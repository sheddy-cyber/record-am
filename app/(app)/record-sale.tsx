import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDebtStore } from '@/store/debtStore';
import { useCustomerStore } from '@/store/customerStore';
import { useSaleStore } from '@/store/saleStore';
import { useTabStore } from '@/store/tabStore';
import { supabase } from '@/lib/supabase';
import { recordSaleOffline, updateSaleOffline } from '@/lib/offlineRecords';
import { checkAndNotifyLowStock } from '@/lib/notifications';
import { readCachedRows } from '@/lib/offlineStore';
import {
  getDefaultBundleSize,
  getSaleUnitOption,
  usesCustomBundleSize,
} from '@/lib/records';
import { Button, LoadingScreen } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import {
  SaleCheckoutCard,
  SaleCartList,
  SaleProductPicker,
} from '@/components/sales';
import { COLORS, CURRENCY_SYMBOL, FONT } from '@/constants';
import { CartItem, PaymentMethod, Product, Sale, SaleItem } from '@/types';

const MAX_VISIBLE_PRODUCTS = 5;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

const roundAmount = (value: number) => Number(value.toFixed(2));

export default function RecordSaleScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!currentBusiness) return;
    setRefreshing(true);
    try {
      await Promise.all([
        useBusinessStore.getState().fetchProducts(currentBusiness.id),
        useCustomerStore.getState().fetchCustomers(currentBusiness.id),
      ]);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness]);

  const { products } = useBusinessStore();
  const {
    pinnedProductIds,
    soldProductQuantities,
    togglePinnedProduct,
    loadPinnedProductIds,
    loadSoldProductQuantities,
  } = useSaleStore();

  const { saleId } = useLocalSearchParams<{ saleId?: string }>();
  const isEditing = Boolean(saleId);
  const [loadingSale, setLoadingSale] = useState(false);
  const originalQuantitiesByProduct = useRef<Map<string, number>>(new Map());
  const prevCartTotalRef = useRef<number | null>(null);
  const autoAdjustAmountPaidRef = useRef<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [savingSale, setSavingSale] = useState(false);

  const pinnedProductIdSet = useMemo(() => new Set(pinnedProductIds), [pinnedProductIds]);

  const closeScreen = () => router.back();

  const loadProducts = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    try {
      await loadPinnedProductIds(currentBusiness.id);
    } finally {
      setLoading(false);
    }
    loadSoldProductQuantities(currentBusiness.id, currentBranch.id);
  }, [currentBusiness, currentBranch, loadPinnedProductIds, loadSoldProductQuantities]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const getProductStock = useCallback(
    (product: Product) => {
      if (!currentBranch) return 0;
      const baseStock =
        product.inventory?.find((inventoryItem) => inventoryItem.branch_id === currentBranch.id)?.quantity ?? 0;
      const originalQty = originalQuantitiesByProduct.current.get(product.id) ?? 0;
      return baseStock + originalQty;
    },
    [currentBranch],
  );

  const buildCartItem = useCallback(
    (
      product: Product,
      quantity = 1,
      saleUnit = product.unit,
      discountAmount = 0,
      unitPriceOverride?: number,
      bundleSize = getDefaultBundleSize(product),
    ): CartItem => {
      const normalizedBundleSize = usesCustomBundleSize(product)
        ? Math.max(bundleSize ?? 1, 1)
        : bundleSize;
      const unitOption = getSaleUnitOption(product, saleUnit, normalizedBundleSize);
      const unitPrice = roundAmount(
        Math.max(unitPriceOverride ?? product.selling_price * unitOption.stockFactor, 0),
      );
      const subtotal = roundAmount(quantity * unitPrice);
      const normalizedDiscount = roundAmount(Math.min(Math.max(discountAmount, 0), subtotal));

      return {
        product,
        quantity,
        stock_quantity: roundAmount(quantity * unitOption.stockFactor),
        sale_unit: saleUnit,
        unit_price: unitPrice,
        discount_amount: normalizedDiscount,
        total_price: roundAmount(subtotal - normalizedDiscount),
        bundle_size: normalizedBundleSize,
        base_sale_unit: product.unit,
        uses_custom_bundle: usesCustomBundleSize(product),
      };
    },
    [],
  );

  useEffect(() => {
    if (!saleId || !currentBusiness || !currentBranch) return;

    const businessId = currentBusiness.id;
    const branchId = currentBranch.id;
    let isMounted = true;
    async function loadSaleToEdit() {
      setLoadingSale(true);
      try {
        let currentProducts = useBusinessStore.getState().products;
        if (currentProducts.length === 0) {
          await useBusinessStore.getState().fetchProducts(businessId);
          currentProducts = useBusinessStore.getState().products;
        }

        const [cachedSales, cachedItems] = await Promise.all([
          readCachedRows<Sale>({ businessId, branchId }, 'sales'),
          readCachedRows<SaleItem>({ businessId, branchId }, 'sale_items'),
        ]);

        let sale: any = cachedSales.find((s) => s.id === saleId);
        let items: any[] = cachedItems.filter((i) => i.sale_id === saleId);

        if (!sale || items.length === 0) {
          try {
            const { data: remoteSale } = await supabase
              .from('sales')
              .select('*, customer:customers(*)')
              .eq('id', saleId)
              .maybeSingle();
            if (remoteSale) sale = remoteSale;

            const { data: remoteItems } = await supabase
              .from('sale_items')
              .select('*, product:products(*)')
              .eq('sale_id', saleId);
            if (remoteItems && remoteItems.length > 0) items = remoteItems;
          } catch (e) {
            console.error('Error fetching sale from supabase', e);
          }
        }

        if (!sale || !isMounted) return;

        setCustomerName(sale.customer?.name ?? '');
        setCustomerPhone(sale.customer?.phone ?? '');
        setPaymentMethod((sale.payment_method as PaymentMethod) || 'cash');

        const salePaid = sale.amount_paid != null ? Number(sale.amount_paid) : null;
        const saleTotal = Number(sale.total_amount);
        const isPaidInFull = salePaid == null || salePaid >= saleTotal;
        autoAdjustAmountPaidRef.current = isPaidInFull;

        setAmountPaid(sale.amount_paid != null ? String(sale.amount_paid) : '');
        setSaleNotes(sale.notes ?? '');

        const origQuantities = new Map<string, number>();
        const newCart: CartItem[] = [];
        const newQuantityInputs: Record<string, string> = {};

        for (const item of items) {
          const product = currentProducts.find((p) => p.id === item.product_id) ?? item.product;
          if (!product) continue;

          origQuantities.set(product.id, Number(item.quantity) || 0);

          const cartItem = buildCartItem(
            product,
            Number(item.quantity) || 1,
            product.unit,
            Number(item.discount_amount) || 0,
            Number(item.unit_price) || product.selling_price,
          );
          newCart.push(cartItem);
          newQuantityInputs[product.id] = String(item.quantity);
        }

        originalQuantitiesByProduct.current = origQuantities;
        const initialTotal = newCart.reduce((sum, item) => sum + item.total_price, 0);
        prevCartTotalRef.current = initialTotal;
        setCart(newCart);
        setQuantityInputs(newQuantityInputs);
      } catch (err: any) {
        console.error('Failed to load sale for editing', err);
        Toast.show({
          type: 'error',
          text1: 'Error loading sale',
          text2: err.message || 'Could not load sale details',
        });
      } finally {
        if (isMounted) setLoadingSale(false);
      }
    }

    loadSaleToEdit();

    return () => {
      isMounted = false;
    };
  }, [saleId, currentBusiness, currentBranch, buildCartItem]);

  const searchableProducts = useMemo(
    () => products.filter((product) => product.is_active),
    [products],
  );

  const pinnedProductIndexById = useMemo(
    () =>
      pinnedProductIds.reduce((accumulator, productId, index) => {
        accumulator[productId] = index;
        return accumulator;
      }, {} as Record<string, number>),
    [pinnedProductIds],
  );

  const prioritizedDefaultProducts = useMemo(() => {
    const productById = new Map(searchableProducts.map((product) => [product.id, product]));
    const prioritizedProducts: Product[] = [];
    const selectedProductIds = new Set<string>();

    pinnedProductIds.forEach((productId) => {
      if (prioritizedProducts.length >= MAX_VISIBLE_PRODUCTS) return;

      const product = productById.get(productId);
      if (!product) return;

      prioritizedProducts.push(product);
      selectedProductIds.add(product.id);
    });

    const mostSoldProducts = searchableProducts
      .filter((product) => !selectedProductIds.has(product.id) && (soldProductQuantities[product.id] ?? 0) > 0)
      .sort((firstProduct, secondProduct) => {
        const soldDifference = (soldProductQuantities[secondProduct.id] ?? 0) - (soldProductQuantities[firstProduct.id] ?? 0);
        if (soldDifference !== 0) return soldDifference;

        return new Date(secondProduct.created_at).getTime() - new Date(firstProduct.created_at).getTime();
      });

    mostSoldProducts.forEach((product) => {
      if (prioritizedProducts.length >= MAX_VISIBLE_PRODUCTS) return;

      prioritizedProducts.push(product);
      selectedProductIds.add(product.id);
    });

    const mostRecentProducts = searchableProducts
      .filter((product) => !selectedProductIds.has(product.id))
      .sort(
        (firstProduct, secondProduct) =>
          new Date(secondProduct.created_at).getTime() - new Date(firstProduct.created_at).getTime(),
      );

    mostRecentProducts.forEach((product) => {
      if (prioritizedProducts.length >= MAX_VISIBLE_PRODUCTS) return;
      prioritizedProducts.push(product);
    });

    return prioritizedProducts;
  }, [pinnedProductIds, searchableProducts, soldProductQuantities]);

  const productResults = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (query.length === 0) {
      return prioritizedDefaultProducts;
    }

    return searchableProducts
      .filter((product) => product.name.toLowerCase().includes(query))
      .sort((firstProduct, secondProduct) => {
        const firstPinnedIndex = pinnedProductIndexById[firstProduct.id];
        const secondPinnedIndex = pinnedProductIndexById[secondProduct.id];
        const firstIsPinned = firstPinnedIndex !== undefined;
        const secondIsPinned = secondPinnedIndex !== undefined;

        if (firstIsPinned && secondIsPinned) {
          return firstPinnedIndex - secondPinnedIndex;
        }

        if (firstIsPinned) return -1;
        if (secondIsPinned) return 1;

        const soldDifference =
          (soldProductQuantities[secondProduct.id] ?? 0) - (soldProductQuantities[firstProduct.id] ?? 0);
        if (soldDifference !== 0) return soldDifference;

        return firstProduct.name.localeCompare(secondProduct.name);
      })
      .slice(0, 20);
  }, [pinnedProductIndexById, prioritizedDefaultProducts, deferredSearch, searchableProducts, soldProductQuantities]);

  const handleTogglePinnedProduct = useCallback(
    (productId: string) => {
      if (!currentBusiness) return;
      togglePinnedProduct(currentBusiness.id, productId);
    },
    [currentBusiness, togglePinnedProduct],
  );

  const removeProductFromCart = (productId: string) => {
    setCart((previousCart) => previousCart.filter((item) => item.product.id !== productId));
    setQuantityInputs((previousInputs) => {
      const nextInputs = { ...previousInputs };
      delete nextInputs[productId];
      return nextInputs;
    });
  };

  const toggleProductInCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      removeProductFromCart(product.id);
      return;
    }

    const stock = getProductStock(product);
    if (!product.is_service && stock <= 0) {
      Alert.alert('Out of stock', `${product.name} is currently out of stock.`);
      return;
    }

    setCart((previousCart) => [...previousCart, buildCartItem(product)]);
    setQuantityInputs((previousInputs) => ({
      ...previousInputs,
      [product.id]: '1',
    }));
  };

  const updateCartItem = (
    productId: string,
    changes: {
      quantity?: number;
      saleUnit?: string;
      discountAmount?: number;
      unitPrice?: number;
      bundleSize?: number;
    },
  ) => {
    setCart((previousCart) =>
      previousCart.flatMap((item) => {
        if (item.product.id !== productId) return [item];

        const nextQuantity = changes.quantity ?? item.quantity;
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
          return [item];
        }

        const nextSaleUnit = changes.saleUnit ?? item.sale_unit;
        const nextDiscount = changes.discountAmount ?? item.discount_amount;
        const nextBundleSize =
          changes.bundleSize ??
          item.bundle_size ??
          getDefaultBundleSize(item.product);
        const shouldRecalculatePrice =
          changes.saleUnit !== undefined || changes.bundleSize !== undefined;
        const nextUnitPrice =
          changes.unitPrice !== undefined
            ? changes.unitPrice
            : shouldRecalculatePrice
              ? undefined
              : item.unit_price;
        const nextItem = buildCartItem(
          item.product,
          nextQuantity,
          nextSaleUnit,
          nextDiscount,
          nextUnitPrice,
          nextBundleSize,
        );
        const availableStock = getProductStock(item.product);

        if (!item.product.is_service && nextItem.stock_quantity > availableStock) {
          Alert.alert(
            'Not enough stock',
            `${item.product.name} has ${formatCount(availableStock)} ${item.product.unit} available.`,
          );
          return [item];
        }

        return [nextItem];
      }),
    );
  };

  const handleQuantityChange = (productId: string, value: string) => {
    setQuantityInputs((previousInputs) => ({
      ...previousInputs,
      [productId]: value,
    }));

    if (!value.trim()) return;

    const nextQuantity = parseFloat(value);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

    updateCartItem(productId, { quantity: nextQuantity });
  };

  const handleQuantityBlur = (productId: string) => {
    const item = cart.find((cartItem) => cartItem.product.id === productId);
    if (!item) return;

    const draftQuantity = quantityInputs[productId];
    const parsedQuantity = draftQuantity === undefined ? item.quantity : parseFloat(draftQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setQuantityInputs((previousInputs) => ({
        ...previousInputs,
        [productId]: `${item.quantity}`,
      }));
      return;
    }

    setQuantityInputs((previousInputs) => ({
      ...previousInputs,
      [productId]: `${item.quantity}`,
    }));
  };

  const handleStepQuantity = (productId: string, delta: number) => {
    const item = cart.find((cartItem) => cartItem.product.id === productId);
    if (!item) return;

    const draftQuantity = quantityInputs[productId];
    const parsedDraft = draftQuantity !== undefined && draftQuantity.trim() !== '' ? parseFloat(draftQuantity) : item.quantity;
    const baseQty = Number.isFinite(parsedDraft) && parsedDraft > 0 ? parsedDraft : item.quantity;
    const nextQty = Math.max(1, roundAmount(baseQty + delta));
    if (nextQty === baseQty && delta < 0) return;

    const unitOption = getSaleUnitOption(
      item.product,
      item.sale_unit,
      item.bundle_size,
    );
    const neededStock = roundAmount(nextQty * unitOption.stockFactor);
    const availableStock = getProductStock(item.product);

    if (!item.product.is_service && delta > 0 && neededStock > availableStock) {
      Alert.alert(
        'Not enough stock',
        `${item.product.name} has ${formatCount(availableStock)} ${item.product.unit} available.`,
      );
      return;
    }

    setQuantityInputs((previousInputs) => ({
      ...previousInputs,
      [productId]: `${nextQty}`,
    }));
    updateCartItem(productId, { quantity: nextQty });
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalDiscount = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const paidAmount = amountPaid === '' ? cartTotal : parseFloat(amountPaid) || 0;
  const amountOwed = Math.max(0, roundAmount(cartTotal - paidAmount));
  const paymentStatus = paidAmount >= cartTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'credit';

  useEffect(() => {
    if (!isEditing) return;
    if (cart.length === 0) return;

    if (prevCartTotalRef.current === null) {
      prevCartTotalRef.current = cartTotal;
      return;
    }

    const prevTotal = prevCartTotalRef.current;
    if (prevTotal !== cartTotal) {
      prevCartTotalRef.current = cartTotal;

      const parsedPaid = parseFloat(amountPaid);
      const wasTrackingTotal =
        autoAdjustAmountPaidRef.current ||
        amountPaid === '' ||
        (Number.isFinite(parsedPaid) && roundAmount(parsedPaid) === roundAmount(prevTotal));

      if (wasTrackingTotal) {
        setAmountPaid(cartTotal > 0 ? `${cartTotal}` : '');
      } else if (Number.isFinite(parsedPaid) && parsedPaid > cartTotal) {
        setAmountPaid(cartTotal > 0 ? `${cartTotal}` : '');
      }
    }
  }, [isEditing, cartTotal, amountPaid, cart.length]);

  const handleAmountPaidChange = (value: string) => {
    setAmountPaid(value);
    const parsed = parseFloat(value);
    if (value === '' || (Number.isFinite(parsed) && roundAmount(parsed) === roundAmount(cartTotal))) {
      autoAdjustAmountPaidRef.current = true;
    } else {
      autoAdjustAmountPaidRef.current = false;
    }
  };

  const handleRecordSale = async () => {
    if (!currentBusiness || !currentBranch || !user) return;
    if (cart.length === 0) {
      Alert.alert('Empty cart', 'Add at least one product before recording a sale.');
      return;
    }

    const invalidBundleItem = cart.find(
      (item) =>
        item.uses_custom_bundle &&
        item.sale_unit !== item.product.unit &&
        (!item.bundle_size || item.bundle_size <= 1),
    );
    if (invalidBundleItem) {
      Alert.alert(
        'Bundle size required',
        `Set how many units make up one ${invalidBundleItem.product.unit} for ${invalidBundleItem.product.name}.`,
      );
      return;
    }

    if (amountOwed > 0 && !customerName.trim()) {
      Alert.alert(
        'Customer required',
        'Enter a customer name for sales with an outstanding balance.',
      );
      return;
    }

    if (isEditing && saleId) {
      setSavingSale(true);
      try {
        await updateSaleOffline({
          saleId,
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          userId: user.id,
          cart,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          paymentMethod,
          notes: saleNotes.trim() || undefined,
          subtotal: roundAmount(subtotal),
          discountAmount: roundAmount(totalDiscount),
          totalAmount: roundAmount(cartTotal),
          amountPaid: roundAmount(paidAmount),
          amountOwed: roundAmount(amountOwed),
          paymentStatus,
        });

        await Promise.all([
          useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
          useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
          useDebtStore.getState().hydrateCache(currentBusiness.id, currentBranch.id),
        ]);

        Toast.show({
          type: 'success',
          text1: 'Sale updated',
          text2: 'Changes saved',
        });
        closeScreen();

        void useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id);
        void checkAndNotifyLowStock(currentBusiness.id, currentBranch.id);
      } catch (err: any) {
        Toast.show({
          type: 'error',
          text1: 'Update failed',
          text2: err.message,
        });
      } finally {
        setSavingSale(false);
      }
      return;
    }

    setSavingSale(true);
    try {
      const saleNumber = `OFF-${Date.now().toString(36).toUpperCase()}`;

      if (roundAmount(paidAmount) > 0 || roundAmount(amountOwed) > 0) {
        useDashboardStore.getState().incrementTodaySales(roundAmount(paidAmount), roundAmount(amountOwed));
      }

      await recordSaleOffline({
        businessId: currentBusiness.id,
        branchId: currentBranch.id,
        userId: user.id,
        cart,
        customerName,
        customerPhone,
        paymentMethod,
        notes: saleNotes.trim() || undefined,
        subtotal: roundAmount(subtotal),
        discountAmount: roundAmount(totalDiscount),
        totalAmount: roundAmount(cartTotal),
        amountPaid: roundAmount(paidAmount),
        amountOwed: roundAmount(amountOwed),
        paymentStatus,
        saleNumber,
      });

      // Hydrate local caches BEFORE closing screen, so revenue is ALREADY in place
      await Promise.all([
        useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
        useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
        useDebtStore.getState().hydrateCache(currentBusiness.id, currentBranch.id),
      ]);

      Toast.show({
        type: 'success',
        text1: 'Sale recorded',
        text2: `${saleNumber} · ${CURRENCY_SYMBOL}${cartTotal.toLocaleString('en-NG')} recorded`,
      });
      closeScreen();

      void useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id);
      void checkAndNotifyLowStock(currentBusiness.id, currentBranch.id);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message,
      });
    } finally {
      setSavingSale(false);
    }
  };

  if (loadingSale) {
    return <LoadingScreen message="Loading sale details..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={isEditing ? 'Edit Sale' : 'Record Sale'}
        subtitle={
          isEditing
            ? 'Modify items, customer, or payment details.'
            : 'Search products, build the cart, and check out.'
        }
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {searchableProducts.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
            <Feather name="box" size={48} color={COLORS.border} />
            <Text style={{ fontSize: 16, fontFamily: FONT.medium, color: COLORS.text.primary }}>
              No products available
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: FONT.regular,
                color: COLORS.text.muted,
                textAlign: 'center',
                paddingHorizontal: 32,
              }}
            >
              {products.length === 0
                ? "You haven't added any products to your inventory yet. Add products before recording a sale."
                : 'All your products are currently marked as inactive.'}
            </Text>
            {products.length === 0 && (
              <View style={{ marginTop: 12, minWidth: 200 }}>
                <Button
                  title="Go to Inventory"
                  onPress={() => {
                    useTabStore.getState().setActiveTab('inventory');
                    closeScreen();
                  }}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <SaleProductPicker
              search={search}
              onSearchChange={setSearch}
              products={productResults}
              cart={cart}
              pinnedProductIdSet={pinnedProductIdSet}
              getProductStock={getProductStock}
              onToggleProductInCart={toggleProductInCart}
              onTogglePinnedProduct={handleTogglePinnedProduct}
            />

            <SaleCartList
              cart={cart}
              quantityInputs={quantityInputs}
              onQuantityChange={handleQuantityChange}
              onQuantityBlur={handleQuantityBlur}
              onStepQuantity={handleStepQuantity}
              onDiscountChange={(productId, val) =>
                updateCartItem(productId, { discountAmount: parseFloat(val) || 0 })
              }
              onSaleUnitChange={(productId, unit) => updateCartItem(productId, { saleUnit: unit })}
              onBundleSizeChange={(productId, val) =>
                updateCartItem(productId, { bundleSize: parseFloat(val) || 0 })
              }
              onUnitPriceChange={(productId, val) =>
                updateCartItem(productId, { unitPrice: parseFloat(val) || 0 })
              }
              onRemoveItem={removeProductFromCart}
            />

            {cart.length > 0 ? (
              <SaleCheckoutCard
                subtotal={subtotal}
                totalDiscount={totalDiscount}
                cartTotal={cartTotal}
                amountPaid={amountPaid}
                amountOwed={amountOwed}
                customerName={customerName}
                customerPhone={customerPhone}
                paymentMethod={paymentMethod}
                saleNotes={saleNotes}
                isEditing={isEditing}
                savingSale={savingSale}
                onCustomerNameChange={setCustomerName}
                onCustomerPhoneChange={setCustomerPhone}
                onAmountPaidChange={handleAmountPaidChange}
                onPaymentMethodChange={setPaymentMethod}
                onSaleNotesChange={setSaleNotes}
                onSubmitSale={handleRecordSale}
              />
            ) : null}
          </View>
        )}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
