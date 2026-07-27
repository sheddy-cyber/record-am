import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View, RefreshControl, BackHandler } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useSupplierStore } from '@/store/supplierStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import {
  calculatePurchaseSubtotal,
  calculatePurchaseTotals,
  createPurchaseCartItemFromDraft,
  createPurchaseCartItemFromProduct,
  PurchaseCartItem,
  usePurchaseStore,
  roundAmount,
} from '@/store/purchaseStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, KeyboardAwareTextInput, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, PRODUCT_UNITS } from '@/constants';
import { PurchasePrefillPayload, parsePurchasePrefillPayload } from '@/lib/purchasePrefill';
import { supabase } from '@/lib/supabase';
import { addMismatch, removeMismatch } from '@/lib/mismatchService';
import { createLocalId } from '@/lib/offlineStore';
import { Product, Purchase } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatNumberInput = (value: number) =>
  Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const CUSTOM_UNIT_VALUE = '__custom_unit__';
const UNIT_OPTIONS = [
  ...PRODUCT_UNITS,
  { value: CUSTOM_UNIT_VALUE, label: 'Custom unit' },
];

const getItemName = (item: PurchaseCartItem) =>
  item.product?.name ?? item.productDraft?.name ?? 'Item';

const getItemUnit = (item: PurchaseCartItem) =>
  item.product?.unit ?? item.productDraft?.unit ?? 'piece';

async function fetchLatestSupplierForProduct(productId: string, businessId: string) {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      supplier_id,
      supplier:suppliers(name),
      purchase_items!inner(product_id)
    `)
    .eq('business_id', businessId)
    .eq('purchase_items.product_id', productId)
    .not('supplier_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.log('[recordPurchase] latest supplier lookup failed:', error.message);
    return null;
  }

  const purchase = data?.[0] as { supplier_id?: string; supplier?: { name?: string } | null } | undefined;
  if (!purchase?.supplier_id && !purchase?.supplier?.name) {
    return null;
  }

  return {
    supplierId: purchase?.supplier_id ?? '',
    supplierName: purchase?.supplier?.name ?? '',
  };
}

export default function RecordPurchaseScreen() {
  const params = useLocalSearchParams<{
    supplierId?: string | string[];
    purchaseId?: string | string[];
    prefill?: string | string[];
    syncFlow?: string | string[];
    originalProductId?: string | string[];
    originalStockQty?: string | string[];
    originalUnitCost?: string | string[];
    mismatchId?: string | string[];
  }>();
  const lockedSupplierId = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  const purchaseId = Array.isArray(params.purchaseId) ? params.purchaseId[0] : params.purchaseId;
  const prefill = useMemo(() => parsePurchasePrefillPayload(params.prefill), [params.prefill]);
  const syncFlow = Array.isArray(params.syncFlow) ? params.syncFlow[0] : params.syncFlow;
  const originalProductId = Array.isArray(params.originalProductId) ? params.originalProductId[0] : params.originalProductId;
  const originalStockQty = Array.isArray(params.originalStockQty) ? params.originalStockQty[0] : params.originalStockQty;
  const originalUnitCost = Array.isArray(params.originalUnitCost) ? params.originalUnitCost[0] : params.originalUnitCost;
  const mismatchId = Array.isArray(params.mismatchId) ? params.mismatchId[0] : params.mismatchId;
  const isEditing = Boolean(purchaseId);
  const isSyncFlowActive = syncFlow === '1';

  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const user = useAuthStore((s) => s.user);

  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const suppliers = useSupplierStore((s) => s.suppliers);
  const fetchSuppliers = useSupplierStore((s) => s.fetchSuppliers);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!currentBusiness) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchProducts(currentBusiness.id),
        fetchSuppliers(currentBusiness.id),
      ]);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness, fetchProducts, fetchSuppliers]);

  const isLoading = usePurchaseStore((s) => s.isLoading);
  const isSaving = usePurchaseStore((s) => s.isSaving);
  const fetchPurchaseById = usePurchaseStore((s) => s.fetchPurchaseById);
  const recordPurchase = usePurchaseStore((s) => s.recordPurchase);
  const updatePurchase = usePurchaseStore((s) => s.updatePurchase);

  const [productSearch, setProductSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [amountPaidDirty, setAmountPaidDirty] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('piece');
  const [ready, setReady] = useState(false);
  const [purchaseMissing, setPurchaseMissing] = useState(false);
  const [prefillOriginals, setPrefillOriginals] = useState<Record<string, { quantity: number; unit_cost: number }>>({});

  const hasSavedRef = useRef(false);

  const closeScreen = () => router.back();

  const handleCancelOrBack = useCallback(async () => {
    if (!hasSavedRef.current && isSyncFlowActive && originalProductId && currentBranch && currentBusiness) {
      hasSavedRef.current = true;
      const productObj = products.find((p) => p.id === originalProductId);
      const cartObj = cart.find((item) => item.product?.id === originalProductId);
      const pName = productObj?.name || cartObj?.product?.name || 'Stock Item';

      await addMismatch({
        type: 'stock_to_purchase_declined',
        productId: originalProductId,
        productName: pName,
        branchId: currentBranch.id,
        businessId: currentBusiness.id,
        quantity: parseFloat(originalStockQty || '0'),
        unitCost: parseFloat(originalUnitCost || '0'),
      });
    }
    closeScreen();
  }, [isSyncFlowActive, originalProductId, currentBranch, currentBusiness, products, cart, originalStockQty, originalUnitCost]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSyncFlowActive && !hasSavedRef.current) {
        void handleCancelOrBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [isSyncFlowActive, handleCancelOrBack]);

  const newItemUnitIsPreset = PRODUCT_UNITS.some((unit) => unit.value === newItemUnit);
  const selectedNewItemUnit = newItemUnitIsPreset ? newItemUnit : CUSTOM_UNIT_VALUE;

  const initializeFromPurchase = (purchase: Purchase) => {
    const linkedSupplier = purchase.supplier_id
      ? useSupplierStore.getState().suppliers.find((entry) => entry.id === purchase.supplier_id)
      : null;
    const purchaseItems = (purchase.items ?? [])
      .filter((item) => item.product)
      .map((item) =>
        createPurchaseCartItemFromProduct(item.product as Product, {
          quantity: Number(item.quantity ?? 0),
          unit_cost: Number(item.unit_cost ?? 0),
        }),
      );

    setCart(purchaseItems);
    setSupplierId(purchase.supplier_id ?? '');
    setSupplierName(purchase.supplier?.name ?? linkedSupplier?.name ?? '');
    setDiscountAmount(formatNumberInput(Number(purchase.discount_amount ?? 0)));
    setAmountPaid(formatNumberInput(Number(purchase.amount_paid ?? 0)));
    setAmountPaidDirty(true);
    setPurchaseDate(purchase.purchase_date || format(new Date(purchase.created_at), 'yyyy-MM-dd'));
    setNotes(purchase.notes ?? '');
  };

  const initializeFromPrefill = (payload: PurchasePrefillPayload | null, availableProducts: Product[]) => {
    if (!payload) return;

    const nextCart = (payload.items ?? [])
      .map((item) => {
        const linkedProduct = item.productId
          ? availableProducts.find((entry) => entry.id === item.productId)
          : availableProducts.find((entry) => normalizeName(entry.name) === normalizeName(item.productName ?? ''));

        if (linkedProduct) {
          return createPurchaseCartItemFromProduct(linkedProduct, {
            quantity: Number(item.quantity ?? 1),
            unit_cost: Number(item.unitCost ?? linkedProduct.cost_price ?? 0),
          });
        }

        if (!item.productName?.trim()) return null;

        return createPurchaseCartItemFromDraft(
          {
            name: item.productName.trim(),
            unit: item.unit?.trim() || 'piece',
            selling_price: Number(item.unitCost ?? 0),
          },
          {
            quantity: Number(item.quantity ?? 1),
            unit_cost: Number(item.unitCost ?? 0),
          },
        );
      })
      .filter((item): item is PurchaseCartItem => Boolean(item));

    if (nextCart.length > 0) {
      setCart(nextCart);

      const originals: Record<string, { quantity: number; unit_cost: number }> = {};
      for (const cartItem of nextCart) {
        originals[cartItem.key] = { quantity: cartItem.quantity, unit_cost: cartItem.unit_cost };
      }
      setPrefillOriginals(originals);
    }

    if (payload.supplierId) {
      setSupplierId(payload.supplierId);
      const linkedSupplier = useSupplierStore.getState().suppliers.find((entry) => entry.id === payload.supplierId);
      if (linkedSupplier) {
        setSupplierName(linkedSupplier.name);
      }
    }
    if (payload.supplierName) {
      setSupplierName(payload.supplierName);
    }
    if (payload.discountAmount && payload.discountAmount > 0) {
      setDiscountAmount(formatNumberInput(payload.discountAmount));
    }
    if (payload.purchaseDate) {
      setPurchaseDate(payload.purchaseDate);
    }
    if (payload.notes) {
      setNotes(payload.notes);
    }
    if (payload.amountPaid !== undefined) {
      setAmountPaid(formatNumberInput(payload.amountPaid));
      setAmountPaidDirty(true);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!currentBusiness || !currentBranch) {
        if (active) setReady(true);
        return;
      }

      setReady(false);
      setPurchaseMissing(false);

      try {
        if (!active) return;

        const latestProducts = useBusinessStore.getState().products;
        const latestSuppliers = useSupplierStore.getState().suppliers;

        if (purchaseId) {
          const purchase = await fetchPurchaseById(purchaseId);
          if (!active) return;

          if (!purchase) {
            setPurchaseMissing(true);
          } else {
            initializeFromPurchase(purchase);
          }
        } else {
          initializeFromPrefill(prefill, latestProducts);

          if (lockedSupplierId) {
            const supplier = latestSuppliers.find((entry) => entry.id === lockedSupplierId);
            if (supplier) {
              setSupplierId(supplier.id);
              setSupplierName(supplier.name);
            } else if (prefill?.supplierId === lockedSupplierId && prefill.supplierName) {
              setSupplierId(lockedSupplierId);
              setSupplierName(prefill.supplierName);
            }
          } else if (!prefill?.supplierId && !prefill?.supplierName) {
            const firstProductId = prefill?.items?.[0]?.productId;
            if (firstProductId) {
              const latestSupplier = await fetchLatestSupplierForProduct(firstProductId, currentBusiness.id);
              if (latestSupplier && active) {
                setSupplierId(latestSupplier.supplierId);
                setSupplierName(latestSupplier.supplierName);
              }
            }
          }
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [
    currentBranch,
    currentBusiness,
    fetchProducts,
    fetchPurchaseById,
    fetchSuppliers,
    lockedSupplierId,
    prefill,
    purchaseId,
  ]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.is_active &&
          !product.is_service &&
          product.name.toLowerCase().includes(productSearch.toLowerCase()),
      ),
    [productSearch, products],
  );

  const addToCart = (product: Product) => {
    setCart((previousCart) => {
      const existingIndex = previousCart.findIndex((item) => item.product?.id === product.id);
      if (existingIndex >= 0) {
        return previousCart.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
                total_cost: Number(((item.quantity + 1) * item.unit_cost).toFixed(2)),
              }
            : item,
        );
      }

      return [...previousCart, createPurchaseCartItemFromProduct(product)];
    });
  };

  const addNewItemToCart = () => {
    const cleanName = newItemName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      Alert.alert('Item name required', 'Enter the item name before adding it to the purchase.');
      return;
    }

    const existingProduct = products.find((product) => normalizeName(product.name) === normalizeName(cleanName));
    if (existingProduct) {
      addToCart(existingProduct);
      setNewItemName('');
      setNewItemUnit('piece');
      setShowNewItemForm(false);
      return;
    }

    const cleanUnit = newItemUnit.trim().replace(/\s+/g, ' ');
    if (!cleanUnit) {
      Alert.alert('Unit required', 'Select a unit of measurement or enter a custom unit.');
      return;
    }

    setCart((previousCart) => {
      const existingIndex = previousCart.findIndex((item) => normalizeName(getItemName(item)) === normalizeName(cleanName));
      if (existingIndex >= 0) {
        return previousCart.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
                total_cost: Number(((item.quantity + 1) * item.unit_cost).toFixed(2)),
              }
            : item,
        );
      }

      return [
        ...previousCart,
        createPurchaseCartItemFromDraft({
          name: cleanName,
          unit: cleanUnit,
          selling_price: 0,
        }),
      ];
    });

    setNewItemName('');
    setNewItemUnit('piece');
    setShowNewItemForm(false);
  };

  const updateCartItem = (itemKey: string, field: 'quantity' | 'unit_cost', value: string) => {
    setCart((previousCart) =>
      previousCart.map((item) => {
        if (item.key !== itemKey) return item;
        const parsed = parseFloat(value);
        const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        const updated = { ...item, [field]: nextValue, [`input_${field}`]: value };
        updated.total_cost = Number((updated.quantity * updated.unit_cost).toFixed(2));
        return updated;
      })
    );
  };

  const removeFromCart = (itemKey: string) => {
    setCart((previousCart) => previousCart.filter((item) => item.key !== itemKey));
  };

  const subtotal = calculatePurchaseSubtotal(cart);
  const parsedDiscount = discountAmount.trim() ? parseFloat(discountAmount) || 0 : 0;
  const effectiveAmountPaid = amountPaid.trim()
    ? parseFloat(amountPaid) || 0
    : amountPaidDirty
      ? 0
      : Math.max(0, subtotal - parsedDiscount);
  const totals = calculatePurchaseTotals(cart, parsedDiscount, effectiveAmountPaid);

  useEffect(() => {
    if (amountPaidDirty) return;
    setAmountPaid(totals.totalAmount > 0 ? formatNumberInput(totals.totalAmount) : '');
  }, [amountPaidDirty, totals.totalAmount]);

  const handleSupplierSelect = (value: string) => {
    setSupplierId(value);
    const supplier = suppliers.find((entry) => entry.id === value);
    if (supplier) {
      setSupplierName(supplier.name);
    }
  };

  const handleSave = async () => {
    if (!currentBusiness || !currentBranch || !user) return;
    if (cart.length === 0) {
      Alert.alert('Empty purchase', 'Add at least one item before saving this purchase.');
      return;
    }
    if (!supplierName.trim()) {
      Alert.alert('Supplier required', 'Enter the supplier name for this purchase.');
      return;
    }
    if (!purchaseDate.trim()) {
      Alert.alert('Purchase date required', 'Enter the purchase date for this purchase.');
      return;
    }
    if (parsedDiscount < 0) {
      Alert.alert('Invalid discount', 'Discount cannot be negative.');
      return;
    }
    if (parsedDiscount > subtotal) {
      Alert.alert('Invalid discount', 'Discount cannot be greater than the subtotal.');
      return;
    }

    const executeSave = async (hasMismatch: boolean) => {
      try {
        let finalSupplierId = supplierId;
        if (!finalSupplierId && supplierName.trim()) {
          const trimmedName = supplierName.trim();
          const existingSupplier = suppliers.find(
            (s) => s.name.trim().toLowerCase() === trimmedName.toLowerCase()
          );
          finalSupplierId = existingSupplier?.id ?? createLocalId();
        }

        if (!finalSupplierId) {
          Alert.alert(
            'Supplier required',
            'Select an existing supplier or enter a supplier name so this purchase appears in supplier records.'
          );
          return;
        }

        const savePayload = {
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          supplierId: finalSupplierId,
          supplierName: supplierName.trim(),
          items: cart,
          amountPaid: totals.amountPaid,
          discountAmount: totals.discountAmount,
          notes: notes.trim() || undefined,
          purchaseDate: purchaseDate.trim(),
        };

        const purchase = isEditing && purchaseId
          ? await updatePurchase({ ...savePayload, purchaseId })
          : await recordPurchase({ ...savePayload, userId: user.id });

        if (!purchase) {
          Alert.alert('Error', isEditing ? 'Failed to update purchase. Please try again.' : 'Failed to record purchase. Please try again.');
          return;
        }

        hasSavedRef.current = true;

        Toast.show({
          type: 'success',
          text1: isEditing ? 'Purchase updated' : 'Goods recorded',
          text2: `${purchase.purchase_number} - ${formatCurrency(totals.totalAmount)} from ${supplierName.trim()}${isEditing ? '' : ' queued for sync'}`,
        });

        if (mismatchId) {
          await removeMismatch(mismatchId);
        }

        void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
        void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);

        const { getAppSettings } = await import('@/lib/appSettings');
        const settings = await getAppSettings();

        const itemsToSync = (purchase.items ?? [])
          .filter((item) => item.product && !item.product.is_service);

        if (isSyncFlowActive) {
          if (hasMismatch && originalProductId && currentBranch && currentBusiness) {
            const matchingCartItem = cart.find(
              (item) => item.product?.id === originalProductId
            );
            if (matchingCartItem) {
              await addMismatch({
                type: 'stock_to_purchase_mismatch',
                productId: originalProductId,
                productName: matchingCartItem.product?.name || 'Unknown',
                branchId: currentBranch.id,
                businessId: currentBusiness.id,
                quantity: parseFloat(originalStockQty || '0'),
                unitCost: parseFloat(originalUnitCost || '0'),
                targetQuantity: matchingCartItem.quantity,
                targetUnitCost: matchingCartItem.unit_cost,
                purchaseId: purchase.id,
              });
            }
          }
          closeScreen();
        } else if (settings.inventoryPurchaseSyncEnabled && !isEditing && itemsToSync.length > 0) {
          Alert.alert(
            'Update Stock?',
            `Would you like to update the inventory stock quantity for the purchased item(s)?`,
            [
              {
                text: 'No, Decline',
                style: 'cancel',
                onPress: async () => {
                  if (currentBranch && currentBusiness) {
                    for (const item of itemsToSync) {
                      await addMismatch({
                        type: 'purchase_to_stock_declined',
                        productId: item.product_id,
                        productName: item.product?.name || 'Unknown',
                        branchId: currentBranch.id,
                        businessId: currentBusiness.id,
                        quantity: item.quantity,
                        unitCost: item.unit_cost,
                        purchaseId: purchase.id,
                      });
                    }
                  }
                  closeScreen();
                },
              },
              {
                text: 'Yes, Update Stock',
                onPress: () => {
                  const firstItem = itemsToSync[0];
                  const remainingItems = itemsToSync.slice(1).map((item) => ({
                    productId: item.product_id,
                    quantity: item.quantity,
                    unitCost: item.unit_cost,
                  }));
                  router.replace({
                    pathname: '/(app)/update-stock',
                    params: {
                      productId: firstItem.product_id,
                      purchasedQty: String(firstItem.quantity),
                      purchasedUnitCost: String(firstItem.unit_cost),
                      purchaseId: purchase.id,
                      syncFlow: '1',
                      pendingQueue: JSON.stringify(remainingItems),
                    },
                  });
                },
              },
            ]
          );
        } else {
          closeScreen();
        }
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Please try again.');
      }
    };

    const originalQtyNum = parseFloat(originalStockQty || '0');
    const originalUnitCostNum = parseFloat(originalUnitCost || '0');
    const matchingCartItem = cart.find(
      (item) => item.product?.id === originalProductId
    );
    const hasMismatch = Boolean(
      isSyncFlowActive &&
      originalProductId &&
      (!matchingCartItem ||
        roundAmount(matchingCartItem.quantity) !== roundAmount(originalQtyNum) ||
        roundAmount(matchingCartItem.unit_cost) !== roundAmount(originalUnitCostNum))
    );

    if (hasMismatch) {
      Alert.alert(
        'Mismatch Warning',
        'The quantity or cost price in the purchase does not match the stock addition. Save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: () => executeSave(true),
          },
        ]
      );
    } else {
      executeSave(false);
    }
  };

  if (ready && purchaseMissing) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Edit Goods Purchase"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={handleCancelOrBack} />}
        />
        <EmptyState
          icon="file-text"
          title="Purchase not found"
          description="This purchase record could not be loaded."
          action={{ label: 'Go Back', onPress: handleCancelOrBack }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={isEditing ? 'Edit Goods Purchase' : 'Record Goods Bought'}
        subtitle={
          isEditing
            ? 'Update supplier goods, discount, and payment details.'
            : 'Track goods bought from suppliers. This does not update stock quantity.'
        }
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={handleCancelOrBack} />}
      />

      <View style={{ flex: 1 }}>
        <View
          style={{
            padding: 12,
            gap: 10,
            backgroundColor: '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <KeyboardAwareTextInput
            value={productSearch}
            onChangeText={setProductSearch}
            placeholder="Search products to add..."
            placeholderTextColor={COLORS.text.muted}
            style={{
              fontFamily: FONT.regular,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: COLORS.border,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 14,
              color: COLORS.text.primary,
            }}
          />

          <Button
            title={showNewItemForm ? 'Hide New Item' : 'Add New Item'}
            icon={showNewItemForm ? 'minus' : 'plus'}
            onPress={() => {
              setShowNewItemForm((value) => !value);
              setNewItemName((current) => current || productSearch.trim());
            }}
            variant="secondary"
            size="sm"
          />

          {showNewItemForm ? (
            <View
              style={{
                padding: 12,
                borderWidth: 1,
                borderRadius: RADIUS.md,
                borderColor: COLORS.border,
                backgroundColor: '#FFFAEB',
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.secondary, marginBottom: 10 }}>
                Create an item that is not yet in stock. It will be saved with zero stock and attached to this purchase.
              </Text>
              <InputField
                label="Item Name"
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="e.g. Large Rice Bag"
                containerStyle={{ marginBottom: 8 }}
              />
              <SelectField
                label="Unit of Measurement"
                value={selectedNewItemUnit}
                options={UNIT_OPTIONS}
                onChange={(value) => {
                  setNewItemUnit(value === CUSTOM_UNIT_VALUE ? '' : value);
                }}
                containerStyle={{ marginBottom: 8 }}
              />
              {selectedNewItemUnit === CUSTOM_UNIT_VALUE ? (
                <InputField
                  label="Custom Unit"
                  value={newItemUnit}
                  onChangeText={setNewItemUnit}
                  placeholder="e.g. crate, bundle, plate"
                  required
                  containerStyle={{ marginBottom: 8 }}
                />
              ) : null}
              <Button
                title="Add Item To Purchase"
                onPress={addNewItemToCart}
                variant="success"
                size="sm"
              />
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1, flexDirection: 'row' }}>
          <FlashList
            style={{ flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border }}
            data={filteredProducts}
            keyExtractor={(product) => product.id}
            contentContainerStyle={{ padding: 8, gap: 6 }}
            estimatedItemSize={70}
            ListEmptyComponent={
              <EmptyState
                icon="package"
                title="No matching products"
                description="Use Add New Item if this product has not been created yet."
              />
            }
            renderItem={({ item }) => {
              const inCart = cart.some((cartItem) => cartItem.product?.id === item.id);
              return (
                <TouchableOpacity
                  onPress={() => addToCart(item)}
                  activeOpacity={0.82}
                  style={{
                    backgroundColor: inCart ? '#ECFDF3' : '#FFFFFF',
                    padding: 10,
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: inCart ? COLORS.success : COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                    Cost: {formatCurrency(item.cost_price || 0)}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                    Unit: {item.unit}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                Purchase Items ({cart.length})
              </Text>
            </View>

            {cart.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Feather name="package" size={24} color={COLORS.text.muted} />
                </View>
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted, textAlign: 'center' }}>
                  Tap products or add a new item to begin
                </Text>
              </View>
            ) : (
              <KeyboardAwareScrollView
                style={{ flex: 1 }}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={COLORS.accent}
                    colors={[COLORS.accent]}
                  />
                }
              >
                {cart.map((item) => (
                  <View key={item.key} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary }} numberOfLines={1}>
                          {getItemName(item)}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                          {getItemUnit(item)}
                          {item.productDraft ? ' - New item' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeFromCart(item.key)} activeOpacity={0.8}>
                        <Feather name="x" size={16} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <KeyboardAwareTextInput
                        value={item.input_quantity !== undefined ? item.input_quantity : String(item.quantity)}
                        onChangeText={(value) => updateCartItem(item.key, 'quantity', value)}
                        keyboardType="numeric"
                        style={{
                          fontFamily: FONT.regular,
                          flex: 1,
                          borderWidth: 1,
                          borderRadius: RADIUS.md,
                          borderColor: COLORS.border,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 12,
                          color: COLORS.text.primary,
                        }}
                        placeholder="Qty"
                        placeholderTextColor={COLORS.text.muted}
                      />
                      <KeyboardAwareTextInput
                        value={item.input_unit_cost !== undefined ? item.input_unit_cost : String(item.unit_cost)}
                        onChangeText={(value) => updateCartItem(item.key, 'unit_cost', value)}
                        keyboardType="numeric"
                        style={{
                          fontFamily: FONT.regular,
                          flex: 1,
                          borderWidth: 1,
                          borderRadius: RADIUS.md,
                          borderColor: COLORS.border,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 12,
                          color: COLORS.text.primary,
                        }}
                        placeholder="Cost"
                        placeholderTextColor={COLORS.text.muted}
                      />
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.success, fontFamily: FONT.medium, marginTop: 4 }}>
                      Total: {formatCurrency(item.total_cost)}
                    </Text>
                    {prefillOriginals[item.key] && (
                      (item.quantity !== prefillOriginals[item.key].quantity || item.unit_cost !== prefillOriginals[item.key].unit_cost) ? (
                        <Text style={{ fontSize: 10, color: COLORS.warning, fontFamily: FONT.medium, marginTop: 4 }}>
                          ⚠ Values changed from stock entry (Qty: {prefillOriginals[item.key].quantity}, Cost: {formatCurrency(prefillOriginals[item.key].unit_cost)})
                        </Text>
                      ) : null
                    )}
                  </View>
                ))}
              </KeyboardAwareScrollView>
            )}
          </View>
        </View>

        {cart.length > 0 ? (
          <KeyboardAwareScrollView
            style={{
              maxHeight: 410,
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          >
            <View style={{ padding: 16, gap: 10 }}>
              {lockedSupplierId ? (
                <View
                  style={{
                    backgroundColor: '#F9FAFB',
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: COLORS.border,
                    padding: 12,
                  }}
                >
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>
                    Supplier
                  </Text>
                  <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                    {supplierName || 'Loading supplier...'}
                  </Text>
                </View>
              ) : (
                <>
                  <SelectField
                    label="Supplier"
                    value={supplierId}
                    options={[
                      { value: '', label: 'Type supplier name below' },
                      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
                    ]}
                    onChange={handleSupplierSelect}
                    containerStyle={{ marginBottom: 4 }}
                  />

                  <InputField
                    label="Supplier Name"
                    value={supplierName}
                    onChangeText={setSupplierName}
                    placeholder="e.g. Dangote Foods Ltd"
                    hint="Required when supplier is not already saved."
                    required
                    containerStyle={{ marginBottom: 4 }}
                  />
                </>
              )}

              <View
                style={{
                  backgroundColor: '#F9FAFB',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: RADIUS.md,
                  padding: 12,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>
                    Subtotal
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    {formatCurrency(subtotal)}
                  </Text>
                </View>
                {totals.discountAmount > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>
                      Discount
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.danger }}>
                      -{formatCurrency(totals.discountAmount)}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                    Total
                  </Text>
                  <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.success }}>
                    {formatCurrency(totals.totalAmount)}
                  </Text>
                </View>
              </View>

              <InputField
                label="Discount"
                value={discountAmount}
                onChangeText={setDiscountAmount}
                placeholder="0"
                keyboardType="numeric"
                prefix={CURRENCY_SYMBOL}
                containerStyle={{ marginBottom: 4 }}
              />

              <InputField
                label="Amount Paid"
                value={amountPaid}
                onChangeText={(value) => {
                  setAmountPaid(value);
                  setAmountPaidDirty(value.trim() !== '');
                }}
                placeholder={formatNumberInput(totals.totalAmount)}
                keyboardType="numeric"
                prefix={CURRENCY_SYMBOL}
                hint={!amountPaidDirty ? 'Defaults to the total cost until you change it.' : undefined}
                containerStyle={{ marginBottom: 4 }}
              />

              {totals.amountOwed > 0 ? (
                <View
                  style={{
                    backgroundColor: '#FEF3F2',
                    borderWidth: 1,
                    borderRadius: 14,
                    borderColor: '#DDAEA6',
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontFamily: FONT.medium, fontSize: 13 }}>
                    Supplier balance: {formatCurrency(totals.amountOwed)}
                  </Text>
                </View>
              ) : null}

              <InputField
                label="Purchase Date"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
                containerStyle={{ marginBottom: 4 }}
              />

              <InputField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional note about the goods bought..."
                multiline
                containerStyle={{ marginBottom: 4 }}
              />

              <Button
                title={
                  isSaving
                    ? isEditing ? 'Saving...' : 'Recording...'
                    : isEditing
                      ? `Save Purchase - ${formatCurrency(totals.totalAmount)}`
                      : `Record Goods - ${formatCurrency(totals.totalAmount)}`
                }
                onPress={handleSave}
                loading={isSaving}
                variant="success"
                size="lg"
              />
            </View>
          </KeyboardAwareScrollView>
        ) : null}
      </View>
    </ScreenShell>
  );
}
