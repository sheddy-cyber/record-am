import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View, RefreshControl, BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { supabase } from '@/lib/supabase';
import { Button, Card, EmptyState, PermissionDenied, SectionHeader } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { FlatSection, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, PRODUCT_UNITS } from '@/constants';
import { PurchasePrefillPayload, parsePurchasePrefillPayload } from '@/lib/purchasePrefill';
import { addMismatch, removeMismatch } from '@/lib/mismatchService';
import { createLocalId } from '@/lib/offlineStore';
import { Product, Purchase } from '@/types';
import { canManagePurchases } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';

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

async function fetchLatestPurchaseCostForProduct(productId: string, businessId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('purchase_items')
      .select('unit_cost')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return Number(data[0].unit_cost) || null;
  } catch {
    return null;
  }
}

export default function RecordPurchaseScreen() {
  const insets = useSafeAreaInsets();
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
  const userRole = useAuthStore((s) => s.userRole);
  const canManageGoods = canManagePurchases(userRole);

  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const suppliers = useSupplierStore((s) => s.suppliers);
  const fetchSuppliers = useSupplierStore((s) => s.fetchSuppliers);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !canManageGoods) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchProducts(currentBusiness.id),
        fetchSuppliers(currentBusiness.id),
      ]);
    } catch (_) {}
    setRefreshing(false);
  }, [canManageGoods, currentBusiness, fetchProducts, fetchSuppliers]);

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
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('piece');
  const [ready, setReady] = useState(false);
  const [purchaseMissing, setPurchaseMissing] = useState(false);
  const [prefillOriginals, setPrefillOriginals] = useState<Record<string, { quantity: number; unit_cost: number }>>({});
  const [lastPurchaseCosts, setLastPurchaseCosts] = useState<Record<string, number>>({});

  const hasSavedRef = useRef(false);

  const closeScreen = () => dismissScreen();

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

  const initializeFromPrefill = async (payload: PurchasePrefillPayload | null, availableProducts: Product[]) => {
    if (!payload) return;

    const nextCart = await Promise.all(
      (payload.items ?? []).map(async (item) => {
        const linkedProduct = item.productId
          ? availableProducts.find((entry) => entry.id === item.productId)
          : availableProducts.find((entry) => normalizeName(entry.name) === normalizeName(item.productName ?? ''));

        if (linkedProduct) {
          const latestCost = currentBusiness
            ? await fetchLatestPurchaseCostForProduct(linkedProduct.id, currentBusiness.id)
            : null;
          const defaultCost = item.unitCost ?? latestCost ?? 0;

          return createPurchaseCartItemFromProduct(linkedProduct, {
            quantity: Number(item.quantity ?? 1),
            unit_cost: defaultCost,
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
    );

    const filteredCart = nextCart.filter((item): item is PurchaseCartItem => Boolean(item));

    if (filteredCart.length > 0) {
      setCart(filteredCart);

      const originals: Record<string, { quantity: number; unit_cost: number }> = {};
      for (const cartItem of filteredCart) {
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
      if (!canManageGoods || !currentBusiness || !currentBranch) {
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
          await initializeFromPrefill(prefill, latestProducts);

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
    canManageGoods,
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

  const visibleProducts = useMemo(() => {
    if (showAllProducts || productSearch.trim()) return filteredProducts;
    return filteredProducts.slice(0, 6);
  }, [filteredProducts, productSearch, showAllProducts]);


  const hasMoreProducts =
    !showAllProducts &&
    !productSearch.trim() &&
    filteredProducts.length > visibleProducts.length;

  // Tracks which product IDs have already been fetched to avoid re-fetching.
  const fetchedCostIdsRef = useRef<Set<string>>(new Set());

  // Fetch the last actual purchase cost for each visible product so the
  // catalogue cards show real market prices instead of the weighted average.
  useEffect(() => {
    if (!currentBusiness) return;
    const businessId = currentBusiness.id;
    const uncached = visibleProducts.filter((p) => !fetchedCostIdsRef.current.has(p.id));
    if (uncached.length === 0) return;

    // Mark as in-flight immediately so concurrent renders don't double-fetch
    for (const p of uncached) fetchedCostIdsRef.current.add(p.id);

    let cancelled = false;
    Promise.all(
      uncached.map(async (p) => {
        const cost = await fetchLatestPurchaseCostForProduct(p.id, businessId);
        return { id: p.id, cost: cost ?? null };
      })
    ).then((results) => {
      if (cancelled) return;
      setLastPurchaseCosts((prev) => {
        const next = { ...prev };
        for (const { id, cost } of results) {
          // null means no prior purchase — store 0 so we don't re-fetch
          next[id] = cost ?? 0;
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProducts, currentBusiness]);

  const addToCart = async (product: Product) => {
    const latestCost = currentBusiness
      ? await fetchLatestPurchaseCostForProduct(product.id, currentBusiness.id)
      : null;
    const defaultCost = latestCost ?? 0;

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

      return [...previousCart, createPurchaseCartItemFromProduct(product, { unit_cost: defaultCost })];
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

  const stepCartItemQuantity = (itemKey: string, change: number) => {
    setCart((previousCart) =>
      previousCart.map((item) => {
        if (item.key !== itemKey) return item;
        const quantity = Math.max(1, roundAmount(item.quantity + change));
        return {
          ...item,
          quantity,
          input_quantity: formatNumberInput(quantity),
          total_cost: Number((quantity * item.unit_cost).toFixed(2)),
        };
      }),
    );
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
          await removeMismatch(mismatchId, currentBusiness.id);
        }

        void useBusinessStore.getState().fetchProducts(currentBusiness.id);
        void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
        void useAnalyticsStore.getState().fetchAnalytics(currentBusiness.id, currentBranch.id);
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

  if (!canManageGoods) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Goods Purchases"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <PermissionDenied
          title="Goods purchases are restricted"
          description="This account cannot view or record supplier purchases and cost prices."
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
            ? 'Review the supplier, goods, and payment before saving.'
            : 'Save a supplier purchase. Your stock quantity will not change.'
        }
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={handleCancelOrBack} />}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 36 }}
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
        <View style={styles.flowCard}>
          <View style={styles.flowIntro}>
            <View style={styles.flowIcon}>
              <Feather name="shopping-bag" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowTitle}>Purchase workspace</Text>
              <Text style={styles.flowCopy}>Capture the supplier, goods, and what you paid in one clear record.</Text>
            </View>
            {cart.length > 0 ? (
              <View style={styles.flowTotal}>
                <Text style={styles.flowTotalLabel}>TOTAL</Text>
                <Text style={styles.flowTotalValue}>{formatCurrency(totals.totalAmount)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.flowSteps}>
            {['Supplier', 'Goods', 'Payment'].map((step, index) => (
              <View key={step} style={styles.flowStep}>
                <View style={[styles.flowStepNumber, (index === 0 || cart.length > 0) && styles.flowStepNumberActive]}>
                  {index === 0 && supplierName.trim() ? (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.flowStepNumberText, (index === 0 || cart.length > 0) && styles.flowStepNumberTextActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={styles.flowStepLabel}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Supplier & date" />
          <Card style={{ gap: 14 }}>
            {lockedSupplierId ? (
              <FlatSection style={styles.lockedSupplier}>
                <View style={styles.lockedSupplierIcon}>
                  <Feather name="truck" size={17} color={COLORS.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lockedSupplierLabel}>SUPPLIER</Text>
                  <Text style={styles.lockedSupplierName}>{supplierName || 'Loading supplier...'}</Text>
                </View>
              </FlatSection>
            ) : (
              <>
                <SelectField
                  label="Choose saved supplier"
                  value={supplierId}
                  options={[
                    { value: '', label: 'Enter a supplier name below' },
                    ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
                  ]}
                  onChange={handleSupplierSelect}
                  containerStyle={{ marginBottom: 0 }}
                />
                <InputField
                  label="Supplier name"
                  value={supplierName}
                  onChangeText={setSupplierName}
                  placeholder="e.g. Dangote Foods Ltd"
                  hint="A new supplier will be saved to your supplier records."
                  required
                  leftIcon={<Feather name="truck" size={16} color={COLORS.text.muted} />}
                  containerStyle={{ marginBottom: 0 }}
                />
              </>
            )}

            <View>
              <InputField
                label="Purchase date"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
                leftIcon={<Feather name="calendar" size={16} color={COLORS.text.muted} />}
                containerStyle={{ marginBottom: 0 }}
              />
              <TouchableOpacity
                onPress={() => setPurchaseDate(format(new Date(), 'yyyy-MM-dd'))}
                activeOpacity={0.75}
                style={styles.todayAction}
              >
                <Feather name="calendar" size={13} color={COLORS.accent} />
                <Text style={styles.todayActionText}>Use today</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Add goods" />
          <Card style={{ gap: 14 }}>
            <View style={styles.productIntro}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productIntroTitle}>Find from your catalogue</Text>
                <Text style={styles.productIntroCopy}>Tap an item to add it. Tap again to increase its quantity.</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowNewItemForm((value) => !value);
                  setNewItemName((current) => current || productSearch.trim());
                }}
                activeOpacity={0.75}
                style={[styles.newItemToggle, showNewItemForm && styles.newItemToggleActive]}
              >
                <Feather name={showNewItemForm ? 'x' : 'plus'} size={16} color={showNewItemForm ? '#FFFFFF' : COLORS.accent} />
                <Text style={[styles.newItemToggleText, showNewItemForm && styles.newItemToggleTextActive]}>
                  {showNewItemForm ? 'Close' : 'New item'}
                </Text>
              </TouchableOpacity>
            </View>

            <InputField
              label="Search products"
              value={productSearch}
              onChangeText={(value) => {
                setProductSearch(value);
                setShowAllProducts(false);
              }}
              placeholder="Search by product name"
              leftIcon={<Feather name="search" size={16} color={COLORS.text.muted} />}
              rightElement={
                productSearch ? (
                  <TouchableOpacity onPress={() => setProductSearch('')} activeOpacity={0.7} hitSlop={8}>
                    <Feather name="x-circle" size={17} color={COLORS.text.muted} />
                  </TouchableOpacity>
                ) : undefined
              }
              containerStyle={{ marginBottom: 0 }}
            />

            {showNewItemForm ? (
              <View style={styles.newItemForm}>
                <View style={styles.newItemFormHeading}>
                  <View style={styles.newItemFormIcon}>
                    <Feather name="plus" size={15} color={COLORS.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.newItemFormTitle}>Add a new catalogue item</Text>
                    <Text style={styles.newItemFormCopy}>It will be created with zero stock and linked to this purchase.</Text>
                  </View>
                </View>
                <InputField
                  label="Item name"
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="e.g. Large Rice Bag"
                  containerStyle={{ marginBottom: 0 }}
                />
                <SelectField
                  label="Unit of measurement"
                  value={selectedNewItemUnit}
                  options={UNIT_OPTIONS}
                  onChange={(value) => setNewItemUnit(value === CUSTOM_UNIT_VALUE ? '' : value)}
                  containerStyle={{ marginBottom: 0 }}
                />
                {selectedNewItemUnit === CUSTOM_UNIT_VALUE ? (
                  <InputField
                    label="Custom unit"
                    value={newItemUnit}
                    onChangeText={setNewItemUnit}
                    placeholder="e.g. crate, bundle, plate"
                    required
                    containerStyle={{ marginBottom: 0 }}
                  />
                ) : null}
                <Button title="Add to purchase" onPress={addNewItemToCart} variant="accent" size="sm" icon="plus" />
              </View>
            ) : null}

            {visibleProducts.length > 0 ? (
              <View style={styles.productList}>
                {visibleProducts.map((product) => {
                  const cartItem = cart.find((item) => item.product?.id === product.id);
                  const inCart = Boolean(cartItem);
                  return (
                    <TouchableOpacity
                      key={product.id}
                      onPress={() => addToCart(product)}
                      activeOpacity={0.8}
                      style={[styles.productRow, inCart && styles.productRowActive]}
                    >
                      <View style={[styles.productIcon, inCart && styles.productIconActive]}>
                        <Feather name={inCart ? 'check' : 'package'} size={17} color={inCart ? COLORS.success : COLORS.navy} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.productMeta}>
                          {formatCurrency(
                            product.id in lastPurchaseCosts
                              ? lastPurchaseCosts[product.id]
                              : Number(product.cost_price || 0)
                          )}{' '}
                          per {product.unit}
                        </Text>
                      </View>
                      <View style={[styles.productAdd, inCart && styles.productAddActive]}>
                        {inCart ? (
                          <Text style={styles.productAddActiveText}>{formatNumberInput(cartItem?.quantity ?? 0)}</Text>
                        ) : (
                          <Feather name="plus" size={17} color={COLORS.accent} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <FlatSection style={styles.noProducts}>
                <Feather name="search" size={18} color={COLORS.text.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noProductsTitle}>No matching products</Text>
                  <Text style={styles.noProductsCopy}>Create a new item above if it is not yet in your catalogue.</Text>
                </View>
              </FlatSection>
            )}

            {hasMoreProducts ? (
              <Button
                title={`Show all ${filteredProducts.length} products`}
                onPress={() => setShowAllProducts(true)}
                variant="ghost"
                size="sm"
              />
            ) : null}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={`Purchase items${cart.length ? ` (${cart.length})` : ''}`} />
          {cart.length === 0 ? (
            <FlatSection style={styles.emptyCart}>
              <View style={styles.emptyCartIcon}>
                <Feather name="shopping-bag" size={21} color={COLORS.text.muted} />
              </View>
              <Text style={styles.emptyCartTitle}>Your purchase is empty</Text>
              <Text style={styles.emptyCartCopy}>Add goods above to set quantities and supplier costs.</Text>
            </FlatSection>
          ) : (
            <View style={styles.cartList}>
              {cart.map((item) => (
                <Card key={item.key} style={{ gap: 14 }}>
                  <View style={styles.cartItemHeader}>
                    <View style={[styles.productIcon, item.productDraft && styles.newProductIcon]}>
                      <Feather name={item.productDraft ? 'star' : 'package'} size={17} color={item.productDraft ? COLORS.warning : COLORS.navy} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={1}>{getItemName(item)}</Text>
                      <Text style={styles.cartItemMeta}>
                        {getItemUnit(item)}{item.productDraft ? ' · New catalogue item' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeFromCart(item.key)}
                      activeOpacity={0.75}
                      hitSlop={8}
                      style={styles.removeItemAction}
                      accessibilityLabel={`Remove ${getItemName(item)}`}
                    >
                      <Feather name="trash-2" size={16} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cartItemFields}>
                    <View style={{ flex: 1 }}>
                      <InputField
                        label={`Quantity (${getItemUnit(item)})`}
                        value={item.input_quantity !== undefined ? item.input_quantity : formatNumberInput(item.quantity)}
                        onChangeText={(value) => updateCartItem(item.key, 'quantity', value)}
                        keyboardType="numeric"
                        placeholder="0"
                        rightElement={
                          <View style={styles.quantityStepper}>
                            <TouchableOpacity onPress={() => stepCartItemQuantity(item.key, -1)} hitSlop={6} style={styles.stepperButton}>
                              <Feather name="minus" size={13} color={COLORS.text.secondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => stepCartItemQuantity(item.key, 1)} hitSlop={6} style={styles.stepperButton}>
                              <Feather name="plus" size={13} color={COLORS.text.secondary} />
                            </TouchableOpacity>
                          </View>
                        }
                        containerStyle={{ marginBottom: 0 }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputField
                        label="Cost per unit"
                        value={item.input_unit_cost !== undefined ? item.input_unit_cost : formatNumberInput(item.unit_cost)}
                        onChangeText={(value) => updateCartItem(item.key, 'unit_cost', value)}
                        keyboardType="numeric"
                        placeholder="0"
                        prefix={CURRENCY_SYMBOL}
                        isAmount={true}
                        containerStyle={{ marginBottom: 0 }}
                      />
                    </View>
                  </View>

                  <View style={styles.itemTotalRow}>
                    <Text style={styles.itemTotalLabel}>
                      {formatNumberInput(item.quantity)} × {formatCurrency(item.unit_cost)}
                    </Text>
                    <Text style={styles.itemTotalValue}>{formatCurrency(item.total_cost)}</Text>
                  </View>

                  {prefillOriginals[item.key] &&
                  (item.quantity !== prefillOriginals[item.key].quantity || item.unit_cost !== prefillOriginals[item.key].unit_cost) ? (
                    <View style={styles.prefillWarning}>
                      <Feather name="alert-triangle" size={14} color={COLORS.warning} />
                      <Text style={styles.prefillWarningText}>
                        Changed from stock entry: {prefillOriginals[item.key].quantity} at {formatCurrency(prefillOriginals[item.key].unit_cost)}.
                      </Text>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </View>

        {cart.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Payment & confirmation" />
            <Card style={{ gap: 16 }}>
              <View style={styles.totalCard}>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={totals.discountAmount > 0 ? styles.totalDiscount : styles.totalNoDiscount}>
                    {totals.discountAmount > 0 ? `−${formatCurrency(totals.discountAmount)}` : '—'}
                  </Text>
                </View>
                <View style={styles.totalDivider} />
                <View style={styles.totalLine}>
                  <Text style={styles.totalHeading}>Purchase total</Text>
                  <Text style={styles.totalAmount}>{formatCurrency(totals.totalAmount)}</Text>
                </View>
              </View>

              <View style={styles.paymentFields}>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Discount"
                    value={discountAmount}
                    onChangeText={setDiscountAmount}
                    placeholder="0"
                    keyboardType="numeric"
                    prefix={CURRENCY_SYMBOL}
                    isAmount={true}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Amount paid"
                    value={amountPaid}
                    onChangeText={(value) => {
                      setAmountPaid(value);
                      setAmountPaidDirty(value.trim() !== '');
                    }}
                    placeholder={formatNumberInput(totals.totalAmount)}
                    keyboardType="numeric"
                    prefix={CURRENCY_SYMBOL}
                    isAmount={true}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
              </View>

              {!amountPaidDirty ? (
                <Text style={styles.paymentHint}>Amount paid defaults to the purchase total until you change it.</Text>
              ) : null}

              {totals.amountOwed > 0 ? (
                <View style={styles.balanceNotice}>
                  <View style={styles.balanceNoticeIcon}>
                    <Feather name="clock" size={15} color={COLORS.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.balanceNoticeTitle}>Supplier balance: {formatCurrency(totals.amountOwed)}</Text>
                    <Text style={styles.balanceNoticeCopy}>This will be recorded as money you still owe this supplier.</Text>
                  </View>
                </View>
              ) : null}

              <InputField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional note about the goods bought"
                leftIcon={
                  <View style={styles.notesIcon}>
                    <Feather name="file-text" size={16} color={COLORS.text.muted} />
                  </View>
                }
                multiline
                numberOfLines={2}
                style={styles.notesInput}
                containerStyle={{ marginBottom: 0 }}
              />

              <View style={styles.recordingNote}>
                <Feather name="info" size={15} color={COLORS.navy} />
                <Text style={styles.recordingNoteText}>This saves the supplier purchase only; it does not add these goods to stock.</Text>
              </View>

              <Button
                title={
                  isSaving
                    ? isEditing ? 'Saving purchase...' : 'Recording goods...'
                    : isEditing
                      ? `Save purchase · ${formatCurrency(totals.totalAmount)}`
                      : `Record goods · ${formatCurrency(totals.totalAmount)}`
                }
                onPress={handleSave}
                loading={isSaving}
                variant="accent"
                size="lg"
                icon="check-circle"
              />
            </Card>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = {
  flowCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden' as const,
  },
  flowIntro: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    padding: 14,
  },
  flowIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.md,
    height: 38,
    justifyContent: 'center' as const,
    width: 38,
  },
  flowTitle: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 14,
  },
  flowCopy: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  flowTotal: {
    alignItems: 'flex-end' as const,
  },
  flowTotalLabel: {
    color: COLORS.text.muted,
    fontFamily: FONT.bold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  flowTotalValue: {
    color: COLORS.accentMuted,
    fontFamily: FONT.bold,
    fontSize: 14,
    marginTop: 2,
  },
  flowSteps: {
    backgroundColor: COLORS.surface2,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  flowStep: {
    alignItems: 'center' as const,
    flex: 1,
    flexDirection: 'row' as const,
    gap: 6,
    justifyContent: 'center' as const,
  },
  flowStepNumber: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.card,
    borderColor: COLORS.borderDark,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center' as const,
    width: 20,
  },
  flowStepNumberActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  flowStepNumberText: {
    color: COLORS.text.muted,
    fontFamily: FONT.bold,
    fontSize: 10,
  },
  flowStepNumberTextActive: {
    color: '#FFFFFF',
  },
  flowStepLabel: {
    color: COLORS.text.secondary,
    fontFamily: FONT.medium,
    fontSize: 11,
  },
  section: {
    marginBottom: 24,
  },
  lockedSupplier: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.infoLight,
    borderColor: COLORS.borderDark,
    flexDirection: 'row' as const,
    gap: 10,
    padding: 12,
  },
  lockedSupplierIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    height: 34,
    justifyContent: 'center' as const,
    width: 34,
  },
  lockedSupplierLabel: {
    color: COLORS.text.muted,
    fontFamily: FONT.bold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  lockedSupplierName: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 14,
    marginTop: 2,
  },
  todayAction: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 5,
    marginTop: 7,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  todayActionText: {
    color: COLORS.accentMuted,
    fontFamily: FONT.medium,
    fontSize: 12,
  },
  productIntro: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  productIntroTitle: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 14,
  },
  productIntroCopy: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  newItemToggle: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.accentLight,
    borderColor: '#ffd4bc',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  newItemToggleActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  newItemToggleText: {
    color: COLORS.accentMuted,
    fontFamily: FONT.medium,
    fontSize: 12,
  },
  newItemToggleTextActive: {
    color: '#FFFFFF',
  },
  newItemForm: {
    backgroundColor: COLORS.warningLight,
    borderColor: '#f7dfc8',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  newItemFormHeading: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 9,
  },
  newItemFormIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    height: 30,
    justifyContent: 'center' as const,
    width: 30,
  },
  newItemFormTitle: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 13,
  },
  newItemFormCopy: {
    color: COLORS.text.secondary,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  productList: {
    gap: 8,
  },
  productRow: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 10,
    padding: 10,
  },
  productRowActive: {
    backgroundColor: COLORS.successLight,
    borderColor: '#a9dfbf',
  },
  productIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.sm,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  productIconActive: {
    backgroundColor: COLORS.card,
  },
  newProductIcon: {
    backgroundColor: COLORS.warningLight,
  },
  productName: {
    color: COLORS.text.primary,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  productMeta: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: 3,
  },
  productAdd: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.full,
    height: 32,
    justifyContent: 'center' as const,
    width: 32,
  },
  productAddActive: {
    backgroundColor: COLORS.success,
    minWidth: 32,
    paddingHorizontal: 7,
    width: undefined,
  },
  productAddActiveText: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
    fontSize: 12,
  },
  noProducts: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    padding: 14,
  },
  noProductsTitle: {
    color: COLORS.text.primary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  noProductsCopy: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  emptyCart: {
    alignItems: 'center' as const,
    padding: 22,
  },
  emptyCartIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    height: 44,
    justifyContent: 'center' as const,
    marginBottom: 10,
    width: 44,
  },
  emptyCartTitle: {
    color: COLORS.text.primary,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  emptyCartCopy: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  cartList: {
    gap: 10,
  },
  cartItemHeader: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  cartItemName: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 15,
  },
  cartItemMeta: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 12,
    marginTop: 3,
  },
  removeItemAction: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.full,
    height: 32,
    justifyContent: 'center' as const,
    width: 32,
  },
  cartItemFields: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  quantityStepper: {
    flexDirection: 'row' as const,
    gap: 1,
    marginRight: -6,
  },
  stepperButton: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.xs,
    height: 28,
    justifyContent: 'center' as const,
    width: 24,
  },
  itemTotalRow: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  itemTotalLabel: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  itemTotalValue: {
    color: COLORS.text.primary,
    fontFamily: FONT.bold,
    fontSize: 14,
  },
  prefillWarning: {
    alignItems: 'flex-start' as const,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.sm,
    flexDirection: 'row' as const,
    gap: 7,
    padding: 9,
  },
  prefillWarningText: {
    color: COLORS.warning,
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 11,
    lineHeight: 15,
  },
  totalCard: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.lg,
    gap: 8,
    padding: 15,
  },
  totalLine: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  totalValue: {
    color: '#FFFFFF',
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  totalDiscount: {
    color: '#f7c59f',
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  totalNoDiscount: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  totalDivider: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    height: 1,
    marginVertical: 2,
  },
  totalHeading: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
    fontSize: 16,
  },
  totalAmount: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
    fontSize: 20,
  },
  paymentFields: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  paymentHint: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: -8,
  },
  balanceNotice: {
    alignItems: 'flex-start' as const,
    backgroundColor: COLORS.warningLight,
    borderColor: '#f7dfc8',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 9,
    padding: 11,
  },
  balanceNoticeIcon: {
    alignItems: 'center' as const,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    height: 28,
    justifyContent: 'center' as const,
    width: 28,
  },
  balanceNoticeTitle: {
    color: COLORS.warning,
    fontFamily: FONT.bold,
    fontSize: 13,
  },
  balanceNoticeCopy: {
    color: COLORS.text.secondary,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  recordingNote: {
    alignItems: 'flex-start' as const,
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.md,
    flexDirection: 'row' as const,
    gap: 8,
    padding: 11,
  },
  recordingNoteText: {
    color: COLORS.text.secondary,
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  notesInput: {
    backgroundColor: 'transparent',
    height: 58,
    minHeight: 58,
    paddingBottom: 8,
    paddingTop: 8,
    textAlignVertical: 'top' as const,
  },
  notesIcon: {
    alignSelf: 'flex-start' as const,
    marginTop: 12,
  },
};
