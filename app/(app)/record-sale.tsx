import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { supabase } from '@/lib/supabase';
import { recordSaleOffline } from '@/lib/offlineRecords';
import {
  getDefaultBundleSize,
  getSaleUnitOption,
  getSaleUnitOptions,
  usesCustomBundleSize,
} from '@/lib/records';
import { Button, Card, Divider, LoadingScreen, SectionHeader } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { FlatSection, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, PAYMENT_METHODS, RADIUS } from '@/constants';
import { CartItem, PaymentMethod, Product } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const MAX_VISIBLE_PRODUCTS = 5;
const PINNED_SALE_PRODUCTS_STORAGE_PREFIX = 'record-am:sale-pinned-products';

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
  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [savingSale, setSavingSale] = useState(false);
  const [pinnedProductIds, setPinnedProductIds] = useState<string[]>([]);
  const [soldProductQuantities, setSoldProductQuantities] = useState<Record<string, number>>({});

  const closeScreen = () => router.back();

  const pinnedProductsStorageKey = useMemo(
    () =>
      currentBusiness
        ? `${PINNED_SALE_PRODUCTS_STORAGE_PREFIX}:${currentBusiness.id}:${currentBranch?.id ?? 'default'}`
        : null,
    [currentBranch?.id, currentBusiness],
  );

  const persistPinnedProductIds = useCallback(
    async (nextPinnedProductIds: string[]) => {
      if (!pinnedProductsStorageKey) return;
      await AsyncStorage.setItem(pinnedProductsStorageKey, JSON.stringify(nextPinnedProductIds));
    },
    [pinnedProductsStorageKey],
  );

  const loadPinnedProductIds = useCallback(async () => {
    if (!pinnedProductsStorageKey) {
      setPinnedProductIds([]);
      return;
    }

    try {
      const storedValue = await AsyncStorage.getItem(pinnedProductsStorageKey);
      if (!storedValue) {
        setPinnedProductIds([]);
        return;
      }

      const parsedValue = JSON.parse(storedValue);
      setPinnedProductIds(
        Array.isArray(parsedValue)
          ? parsedValue.filter((productId): productId is string => typeof productId === 'string')
          : [],
      );
    } catch {
      setPinnedProductIds([]);
    }
  }, [pinnedProductsStorageKey]);

  const loadSoldProductQuantities = useCallback(async () => {
    if (!currentBusiness || !currentBranch) {
      setSoldProductQuantities({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity,
          sale:sales!inner(business_id, branch_id)
        `)
        .eq('sale.business_id', currentBusiness.id)
        .eq('sale.branch_id', currentBranch.id);

      if (error) throw error;

      const totals = ((data as Array<{ product_id: string; quantity: number }> | null) ?? []).reduce(
        (accumulator, item) => {
          const productId = item.product_id;
          if (!productId) return accumulator;

          accumulator[productId] = (accumulator[productId] ?? 0) + Number(item.quantity ?? 0);
          return accumulator;
        },
        {} as Record<string, number>,
      );

      setSoldProductQuantities(totals);
    } catch {
      setSoldProductQuantities({});
    }
  }, [currentBranch, currentBusiness]);

  const loadProducts = useCallback(async () => {
    if (!currentBusiness) return;
    
    // Only show loading state if we have absolutely no products
    if (useBusinessStore.getState().products.length === 0) {
      setLoading(true);
    }
    
    try {
      void fetchProducts(currentBusiness.id);
      await loadPinnedProductIds();
    } finally {
      setLoading(false);
    }
    
    // Load sold quantities in background - not critical for initial render
    loadSoldProductQuantities();
  }, [currentBusiness, fetchProducts, loadPinnedProductIds, loadSoldProductQuantities]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const getProductStock = useCallback((product: Product) => {
    if (!currentBranch) return 0;
    return product.inventory?.find((inventoryItem) => inventoryItem.branch_id === currentBranch.id)?.quantity ?? 0;
  }, [currentBranch]);

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

  const pinnedProductIdSet = useMemo(
    () => new Set(pinnedProductIds),
    [pinnedProductIds],
  );

  useEffect(() => {
    if (loading) return;
    const validProductIds = new Set(searchableProducts.map((product) => product.id));
    const nextPinnedProductIds = pinnedProductIds.filter((productId) => validProductIds.has(productId));

    if (nextPinnedProductIds.length === pinnedProductIds.length) return;

    setPinnedProductIds(nextPinnedProductIds);
    void persistPinnedProductIds(nextPinnedProductIds);
  }, [loading, persistPinnedProductIds, pinnedProductIds, searchableProducts]);

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
    const query = search.trim().toLowerCase();
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

        const soldDifference = (soldProductQuantities[secondProduct.id] ?? 0) - (soldProductQuantities[firstProduct.id] ?? 0);
        if (soldDifference !== 0) return soldDifference;

        return firstProduct.name.localeCompare(secondProduct.name);
      })
      .slice(0, 20);
  }, [pinnedProductIndexById, prioritizedDefaultProducts, search, searchableProducts, soldProductQuantities]);

  const hasMoreProductResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return searchableProducts.length > productResults.length;
    }

    return searchableProducts.filter((product) => product.name.toLowerCase().includes(query)).length > productResults.length;
  }, [productResults.length, search, searchableProducts]);

  const togglePinnedProduct = useCallback(
    (productId: string) => {
      setPinnedProductIds((previousPinnedProductIds) => {
        const nextPinnedProductIds = previousPinnedProductIds.includes(productId)
          ? previousPinnedProductIds.filter((currentProductId) => currentProductId !== productId)
          : [productId, ...previousPinnedProductIds.filter((currentProductId) => currentProductId !== productId)];

        void persistPinnedProductIds(nextPinnedProductIds);
        return nextPinnedProductIds;
      });
    },
    [persistPinnedProductIds],
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

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalDiscount = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const paidAmount = amountPaid === '' ? cartTotal : parseFloat(amountPaid) || 0;
  const amountOwed = Math.max(0, roundAmount(cartTotal - paidAmount));
  const paymentStatus = paidAmount >= cartTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'credit';

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

    setSavingSale(true);
    try {
      const { sale } = await recordSaleOffline({
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
      });

      Toast.show({
        type: 'success',
        text1: 'Sale recorded',
        text2: `${sale.sale_number} \u00B7 ${formatCurrency(cartTotal)} queued for sync`,
      });

      // Instantly refresh analytics with the new cached data
      void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);

      closeScreen();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingSale(false);
    }
  };


  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Sale"
        subtitle="Search products, build the cart, and check out."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          <InputField
            label="Find Product"
            value={search}
            onChangeText={setSearch}
            placeholder="Search by product name"
            leftIcon={<Feather name="search" size={16} color={COLORS.text.muted} />}
          />

          <SectionHeader title="Products" />
          <View style={{ gap: 10, marginBottom: 20 }}>
            <FlatSection style={{ padding: 14 }}>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                Tap any product to add it to cart.
              </Text>
            </FlatSection>
            {productResults.length === 0 ? (
              <FlatSection style={{ padding: 16 }}>
                <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                  No products match that search.
                </Text>
              </FlatSection>
            ) : (
              productResults.map((product) => {
                const stock = getProductStock(product);
                const isDisabled = !product.is_service && stock <= 0;
                const alreadyAdded = cart.some((item) => item.product.id === product.id);
                const isPinned = pinnedProductIdSet.has(product.id);

                return (
                  <TouchableOpacity
                    key={product.id}
                    onPress={() => toggleProductInCart(product)}
                    activeOpacity={0.8}
                    style={{
                      borderRadius: RADIUS.lg,
                      borderWidth: 1,
                      borderColor: alreadyAdded ? COLORS.ink : COLORS.border,
                      backgroundColor: alreadyAdded ? COLORS.surface2 : COLORS.card,
                      padding: 14,
                      opacity: isDisabled ? 0.55 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                          {product.name}
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
                          {formatCurrency(product.selling_price)} per {product.unit}
                        </Text>
                        {!product.is_service ? (
                          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 4 }}>
                            {formatCount(stock)} {product.unit} available
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <TouchableOpacity
                          onPress={(event) => {
                            event.stopPropagation();
                            togglePinnedProduct(product.id);
                          }}
                          activeOpacity={0.8}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: RADIUS.full,
                            borderWidth: 1,
                            borderColor: isPinned ? COLORS.accent : COLORS.border,
                            backgroundColor: isPinned ? COLORS.accentLight : COLORS.card,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="star" size={15} color={isPinned ? COLORS.accent : COLORS.text.muted} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.accent }}>
                          {isPinned ? 'Tap to unpin' : 'Tap to pin'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <SectionHeader title={`Cart (${cart.length})`} />
          {cart.length === 0 ? (
            <FlatSection style={{ padding: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
                Products you add from search will appear here.
              </Text>
            </FlatSection>
          ) : (
            <View style={{ gap: 10, marginBottom: 20 }}>
              {cart.map((item) => {
                const unitOptions = getSaleUnitOptions(item.product, item.bundle_size);
                const isUnitBreakdown = item.sale_unit !== item.product.unit;

                return (
                  <Card key={item.product.id} style={{ gap: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                          {item.product.name}
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
                          {formatCurrency(item.unit_price)} per {item.sale_unit}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeProductFromCart(item.product.id)} activeOpacity={0.8}>
                        <Feather name="x" size={18} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.secondary }}>
                        Sell As
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {unitOptions.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            onPress={() => updateCartItem(item.product.id, { saleUnit: option.value })}
                            activeOpacity={0.8}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderWidth: 1,
                              borderRadius: RADIUS.sm,
                              borderColor: item.sale_unit === option.value ? COLORS.ink : COLORS.border,
                              backgroundColor: item.sale_unit === option.value ? COLORS.surface2 : COLORS.card,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label="Quantity"
                          value={quantityInputs[item.product.id] ?? `${item.quantity}`}
                          onChangeText={(value) => handleQuantityChange(item.product.id, value)}
                          onBlur={() => handleQuantityBlur(item.product.id)}
                          keyboardType="numeric"
                          placeholder="0"
                          containerStyle={{ marginBottom: 0 }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label="Discount"
                          value={item.discount_amount ? `${item.discount_amount}` : ''}
                          onChangeText={(value) =>
                            updateCartItem(item.product.id, {
                              discountAmount: parseFloat(value) || 0,
                            })
                          }
                          keyboardType="numeric"
                          placeholder="0"
                          prefix={CURRENCY_SYMBOL}
                          containerStyle={{ marginBottom: 0 }}
                        />
                      </View>
                    </View>

                    {isUnitBreakdown ? (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {item.uses_custom_bundle ? (
                          <View style={{ flex: 1 }}>
                            <InputField
                              label={`Units per ${item.product.unit}`}
                              value={item.bundle_size && item.bundle_size > 1 ? `${item.bundle_size}` : ''}
                              onChangeText={(value) =>
                                updateCartItem(item.product.id, {
                                  bundleSize: parseFloat(value) || 0,
                                })
                              }
                              keyboardType="numeric"
                              placeholder="e.g. 12"
                              hint="Needed to reduce stock correctly."
                              containerStyle={{ marginBottom: 0 }}
                            />
                          </View>
                        ) : (
                          <View style={{ flex: 1 }}>
                            <FlatSection style={{ padding: 12, minHeight: 82, justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                                Stock conversion
                              </Text>
                              <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 4 }}>
                                {formatCount(item.bundle_size ?? getDefaultBundleSize(item.product) ?? 1)} {item.sale_unit} per {item.product.unit}
                              </Text>
                            </FlatSection>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <InputField
                            label={`Price per ${item.sale_unit}`}
                            value={item.unit_price ? `${item.unit_price}` : ''}
                            onChangeText={(value) =>
                              updateCartItem(item.product.id, {
                                unitPrice: parseFloat(value) || 0,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            prefix={CURRENCY_SYMBOL}
                            containerStyle={{ marginBottom: 0 }}
                          />
                        </View>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                        Uses {formatCount(item.stock_quantity)} {item.product.unit} from stock
                      </Text>
                      <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                        {formatCurrency(item.total_price)}
                      </Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

          {cart.length > 0 ? (
            <View>
              <SectionHeader title="Checkout" />
              <Card style={{ gap: 14 }}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>Subtotal</Text>
                    <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.primary }}>{formatCurrency(subtotal)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>Discount</Text>
                    <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.primary }}>- {formatCurrency(totalDiscount)}</Text>
                  </View>
                  <Divider />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>Total</Text>
                    <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.accent }}>{formatCurrency(cartTotal)}</Text>
                  </View>
                </View>

                <InputField
                  label="Customer Name"
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Leave blank for walk-in"
                />
                <InputField
                  label="Customer Phone"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="08012345678"
                  keyboardType="phone-pad"
                />
                <InputField
                  label="Amount Paid"
                  value={amountPaid}
                  onChangeText={setAmountPaid}
                  placeholder={`${cartTotal}`}
                  keyboardType="numeric"
                  prefix={CURRENCY_SYMBOL}
                  containerStyle={{ marginBottom: 4 }}
                />
                {amountOwed > 0 ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderRadius: RADIUS.md,
                      borderColor: COLORS.warning,
                      backgroundColor: COLORS.warningLight,
                      padding: 12,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
                      Outstanding balance: {formatCurrency(amountOwed)}
                    </Text>
                  </View>
                ) : null}
                <SelectField
                  label="Payment Method"
                  value={paymentMethod}
                  options={PAYMENT_METHODS}
                  onChange={(value) => setPaymentMethod(value as PaymentMethod)}
                />
                <InputField
                  label="Notes"
                  value={saleNotes}
                  onChangeText={setSaleNotes}
                  placeholder="Optional note for this sale"
                  multiline
                  numberOfLines={3}
                />
                <Button
                  title={savingSale ? 'Recording...' : `Confirm Sale \u00B7 ${formatCurrency(cartTotal)}`}
                  onPress={handleRecordSale}
                  loading={savingSale}
                  size="lg"
                />
              </Card>
            </View>
          ) : null}
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
