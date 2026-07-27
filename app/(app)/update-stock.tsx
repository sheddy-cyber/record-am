import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { getAppSettings } from '@/lib/appSettings';
import { buildPurchasePrefillParam } from '@/lib/purchasePrefill';
import { addMismatch, removeMismatch } from '@/lib/mismatchService';
import { updateProductAndInventoryOffline } from '@/lib/offlineRecords';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/forms';
import { ProductFormFields } from '@/components/inventory/ProductFormFields';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

const formatCount = (value: number) =>
  Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

const normalizeProductName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const roundAmount = (value: number) => Number(value.toFixed(2));

export default function UpdateStockScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const params = useLocalSearchParams<{
    productId?: string | string[];
    purchasedQty?: string | string[];
    purchasedUnitCost?: string | string[];
    purchaseId?: string | string[];
    syncFlow?: string | string[];
    pendingQueue?: string | string[];
    stockAdjustment?: string | string[];
    mismatchId?: string | string[];
  }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const rawPurchasedQty = Array.isArray(params.purchasedQty) ? params.purchasedQty[0] : params.purchasedQty;
  const rawPurchasedUnitCost = Array.isArray(params.purchasedUnitCost) ? params.purchasedUnitCost[0] : params.purchasedUnitCost;
  const rawStockAdjustment = Array.isArray(params.stockAdjustment) ? params.stockAdjustment[0] : params.stockAdjustment;
  const purchasedQty = rawPurchasedQty ? parseFloat(rawPurchasedQty) || 0 : 0;
  const purchasedUnitCost = rawPurchasedUnitCost ? parseFloat(rawPurchasedUnitCost) || 0 : 0;
  const parsedStockAdjustment = rawStockAdjustment !== undefined ? parseFloat(rawStockAdjustment) : NaN;
  const stockAdjustment = Number.isFinite(parsedStockAdjustment) ? parsedStockAdjustment : null;
  const effectiveStockAdjustment = stockAdjustment ?? purchasedQty;
  const purchaseId = Array.isArray(params.purchaseId) ? params.purchaseId[0] : params.purchaseId;
  const syncFlow = Array.isArray(params.syncFlow) ? params.syncFlow[0] : params.syncFlow;
  const pendingQueue = Array.isArray(params.pendingQueue) ? params.pendingQueue[0] : params.pendingQueue;
  const mismatchId = Array.isArray(params.mismatchId) ? params.mismatchId[0] : params.mismatchId;
  const isSyncFlowActive = syncFlow === '1';
  const isManualReconcile = Boolean(mismatchId);
  const fromPurchase = stockAdjustment !== null || purchasedQty > 0;

  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const onRefresh = useCallback(async () => {
    if (!currentBusiness) return;
    setRefreshing(true);
    try {
      await fetchProducts(currentBusiness.id);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness, fetchProducts]);

  const [loading, setLoading] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('piece');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefilledStockQty, setPrefilledStockQty] = useState<number | null>(null);

  const hasSavedRef = useRef(false);

  const closeScreen = () => router.back();

  const handleCancelOrBack = useCallback(async () => {
    if (!hasSavedRef.current && (isSyncFlowActive || purchaseId) && currentBranch && currentBusiness) {
      hasSavedRef.current = true;
      if (productId && purchasedQty > 0) {
        const productObj = products.find((p) => p.id === productId);
        await addMismatch({
          type: 'purchase_to_stock_declined',
          productId: productId,
          productName: productObj?.name || productName || 'Purchased Item',
          branchId: currentBranch.id,
          businessId: currentBusiness.id,
          quantity: purchasedQty,
          unitCost: purchasedUnitCost,
          purchaseId: purchaseId || undefined,
        });
      }
      if (pendingQueue) {
        try {
          const queue = JSON.parse(pendingQueue);
          for (const item of queue) {
            const pObj = products.find((p) => p.id === item.productId);
            await addMismatch({
              type: 'purchase_to_stock_declined',
              productId: item.productId,
              productName: pObj?.name || 'Purchased Item',
              branchId: currentBranch.id,
              businessId: currentBusiness.id,
              quantity: item.quantity,
              unitCost: item.unitCost,
              purchaseId: purchaseId || undefined,
            });
          }
        } catch (_) {}
      }
    }
    closeScreen();
  }, [isSyncFlowActive, purchaseId, currentBranch, currentBusiness, productId, purchasedQty, products, productName, purchasedUnitCost, pendingQueue]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if ((isSyncFlowActive || purchaseId) && !hasSavedRef.current) {
        void handleCancelOrBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [isSyncFlowActive, purchaseId, handleCancelOrBack]);

  const maybeOpenPurchaseSync = async (params: {
    productId: string;
    productName: string;
    productUnit: string;
    quantity: number;
    unitCost: number;
  }) => {
    const settings = await getAppSettings();
    if (!settings.inventoryPurchaseSyncEnabled || params.quantity <= 0 || isSyncFlowActive) {
      return false;
    }

    Alert.alert(
      'Record Purchase?',
      `Would you like to record a corresponding purchase for this stock addition of ${formatCount(params.quantity)} ${params.productUnit}?`,
      [
        {
          text: 'No, Decline',
          style: 'cancel',
          onPress: async () => {
            if (currentBranch && currentBusiness) {
              await addMismatch({
                type: 'stock_to_purchase_declined',
                productId: params.productId,
                productName: params.productName,
                branchId: currentBranch.id,
                businessId: currentBusiness.id,
                quantity: params.quantity,
                unitCost: params.unitCost,
              });
            }
            closeScreen();
          },
        },
        {
          text: 'Yes, Record Purchase',
          onPress: () => {
            router.replace({
              pathname: '/(app)/record-purchase',
              params: {
                syncFlow: '1',
                originalProductId: params.productId,
                originalStockQty: String(params.quantity),
                originalUnitCost: String(params.unitCost),
                prefill: buildPurchasePrefillParam({
                  notes: 'Opened from inventory stock increase.',
                  items: [
                    {
                      productId: params.productId,
                      productName: params.productName,
                      unit: params.productUnit,
                      quantity: params.quantity,
                      unitCost: params.unitCost,
                    },
                  ],
                }),
              },
            });
          },
        },
      ]
    );

    return true;
  };

  const loadProducts = useCallback(async () => {
    if (!currentBusiness) {
      setLoading(false);
      return;
    }

    if (useBusinessStore.getState().products.length === 0) {
      // Products already fetched by Bootloader
    }
  }, [currentBusiness]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const product = useMemo(
    () => products.find((item) => item.id === productId) ?? null,
    [productId, products],
  );

  const currentStock = useMemo(() => {
    if (!product || !currentBranch) return 0;
    return Number(product.inventory?.find((item) => item.branch_id === currentBranch.id)?.quantity ?? 0);
  }, [currentBranch, product]);

  useEffect(() => {
    if (!product) return;

    setProductName(product.name);
    setProductUnit(product.unit);
    setCostPrice(
      purchasedUnitCost > 0
        ? formatCount(purchasedUnitCost)
        : product.cost_price ? formatCount(Number(product.cost_price)) : ''
    );
    setSellingPrice(formatCount(Number(product.selling_price ?? 0)));

    const newStockQty = fromPurchase
      ? roundAmount(currentStock + effectiveStockAdjustment)
      : currentStock;
    setStockQuantity(formatCount(newStockQty));
    if (fromPurchase) {
      setPrefilledStockQty(newStockQty);
    } else {
      setPrefilledStockQty(null);
    }

    setReorderLevel(formatCount(Number(product.reorder_level ?? 5)));
    setIsService(product.is_service);
  }, [currentStock, effectiveStockAdjustment, fromPurchase, product, purchasedUnitCost]);

  const handleSaveProduct = async () => {
    if (!product || !currentBusiness) return;
    if (!productName.trim()) {
      Alert.alert('Product name required', 'Enter a product or service name.');
      return;
    }
    if (!sellingPrice) {
      Alert.alert('Selling price required', 'Enter a selling price.');
      return;
    }

    const cleanProductName = productName.trim().replace(/\s+/g, ' ');
    const cleanProductUnit = productUnit.trim().replace(/\s+/g, ' ');
    if (!cleanProductUnit) {
      Alert.alert('Unit required', 'Select a unit of measurement or enter a custom unit.');
      return;
    }

    const duplicateProduct = products.find(
      (item) =>
        item.id !== product.id &&
        normalizeProductName(item.name) === normalizeProductName(cleanProductName),
    );

    if (duplicateProduct) {
      Alert.alert(
        'Duplicate product',
        `${duplicateProduct.name} already exists in stock. Use a different name for this item.`,
      );
      return;
    }

    const parsedSellingPrice = parseFloat(sellingPrice);
    if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0) {
      Alert.alert('Invalid selling price', 'Enter a valid selling price.');
      return;
    }

    const parsedCostPrice = costPrice.trim() ? parseFloat(costPrice) : 0;
    if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
      Alert.alert('Invalid cost price', 'Enter a valid cost price.');
      return;
    }

    const parsedStockQuantity = stockQuantity.trim() ? parseFloat(stockQuantity) : 0;
    if (!isService && (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0)) {
      Alert.alert('Invalid quantity', 'Enter a valid stock quantity.');
      return;
    }

    const parsedReorderLevel = reorderLevel.trim() ? parseFloat(reorderLevel) : 5;
    if (!Number.isFinite(parsedReorderLevel) || parsedReorderLevel < 0) {
      Alert.alert('Invalid reorder level', 'Enter a valid reorder level.');
      return;
    }

    const executeSave = async (hasMismatch: boolean) => {
      setSaving(true);
      try {
        const nextQuantity = isService ? 0 : roundAmount(parsedStockQuantity);
        const previousQuantity = roundAmount(currentStock);
        const quantityDelta = roundAmount(nextQuantity - previousQuantity);

        const movementQuantity = Math.abs(quantityDelta);
        const movementType = quantityDelta > 0 ? 'stock_in' : 'stock_out';
        const movementNote =
          isService && previousQuantity > 0
            ? 'Converted to service item from product update.'
            : quantityDelta > 0
              ? 'Quantity increased from product update.'
              : 'Quantity reduced from product update.';

        await updateProductAndInventoryOffline({
          businessId: currentBusiness.id,
          branchId: currentBranch?.id,
          product: product,
          productPatch: {
            name: cleanProductName,
            unit: cleanProductUnit,
            cost_price: parsedCostPrice,
            selling_price: parsedSellingPrice,
            reorder_level: parsedReorderLevel,
            is_service: isService,
          },
          nextQuantity: currentBranch ? nextQuantity : undefined,
          movement:
            currentBranch && quantityDelta !== 0
              ? {
                  type: movementType,
                  quantity: movementQuantity,
                  unit_cost: movementType === 'stock_in' && parsedCostPrice > 0 ? parsedCostPrice : undefined,
                  total_cost:
                    movementType === 'stock_in' && parsedCostPrice > 0
                      ? roundAmount(parsedCostPrice * movementQuantity)
                      : undefined,
                  notes: movementNote,
                }
              : undefined,
        });

        hasSavedRef.current = true;

        Toast.show({
          type: 'success',
          text1: 'Product updated',
          text2: isService
            ? `${cleanProductName} was saved as a service item.`
            : `${cleanProductName} now has ${formatCount(nextQuantity)} ${cleanProductUnit} in stock. Sync queued.`,
        });

        if (mismatchId) {
          await removeMismatch(mismatchId);
        }

        if (isSyncFlowActive) {
          if (hasMismatch && currentBranch && currentBusiness) {
            await addMismatch({
              type: 'purchase_to_stock_mismatch',
              productId: product.id,
              productName: cleanProductName,
              branchId: currentBranch.id,
              businessId: currentBusiness.id,
              quantity: purchasedQty,
              unitCost: purchasedUnitCost,
              targetQuantity: roundAmount(nextQuantity - previousQuantity),
              targetUnitCost: parsedCostPrice,
              purchaseId: purchaseId || undefined,
            });
          }

          const queue = pendingQueue ? JSON.parse(pendingQueue) : [];
          if (queue.length > 0) {
            const nextItem = queue[0];
            const remaining = queue.slice(1);
            router.replace({
              pathname: '/(app)/update-stock',
              params: {
                productId: nextItem.productId,
                purchasedQty: String(nextItem.quantity),
                purchasedUnitCost: String(nextItem.unitCost),
                purchaseId: purchaseId,
                syncFlow: '1',
                pendingQueue: JSON.stringify(remaining),
              },
            });
          } else {
            closeScreen();
          }
        } else {
          const openedPurchaseSync = await maybeOpenPurchaseSync({
            productId: product.id,
            productName: cleanProductName,
            productUnit: cleanProductUnit,
            quantity: quantityDelta > 0 ? roundAmount(quantityDelta) : 0,
            unitCost: parsedCostPrice,
          });

          if (!openedPurchaseSync) {
            closeScreen();
          }
        }
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Please try again.');
      }
    };

    const hasMismatch = !isManualReconcile && isSyncFlowActive && prefilledStockQty !== null && (
      roundAmount(parsedStockQuantity) !== roundAmount(prefilledStockQty) ||
      roundAmount(parsedCostPrice) !== roundAmount(purchasedUnitCost)
    );

    if (hasMismatch) {
      Alert.alert(
        'Mismatch Warning',
        'The quantity or cost price does not match the purchase. Save anyway?',
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


  if (loading) {
    return <LoadingScreen message="Loading product details..." />;
  }

  if (!product) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Update Stock"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={handleCancelOrBack} />}
        />
        <EmptyState
          icon="package"
          title="Product not found"
          description="This stock item could not be loaded."
          action={{ label: 'Go Back', onPress: handleCancelOrBack }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Update Stock"
        subtitle="Edit the product details and current branch quantity."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={handleCancelOrBack} />}
      />
        <KeyboardAwareScrollView
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
          <ProductFormFields
            productName={productName}
            onProductNameChange={setProductName}
            productUnit={productUnit}
            onProductUnitChange={setProductUnit}
            costPrice={costPrice}
            onCostPriceChange={setCostPrice}
            sellingPrice={sellingPrice}
            onSellingPriceChange={setSellingPrice}
            reorderLevel={reorderLevel}
            onReorderLevelChange={setReorderLevel}
            stockQuantity={stockQuantity}
            onStockQuantityChange={setStockQuantity}
            stockQuantityLabel={`Stock Quantity (${productUnit.trim() || 'unit'})`}
            stockQuantityHint={
              prefilledStockQty !== null && parseFloat(stockQuantity) !== prefilledStockQty
                ? isManualReconcile
                  ? `Changed from reconciliation value (${formatCount(prefilledStockQty)}).`
                  : `⚠ Changed from prefilled value (${formatCount(prefilledStockQty)}). Was ${formatCount(currentStock)} + ${formatCount(purchasedQty)} purchased.`
                : isManualReconcile && prefilledStockQty !== null
                  ? `Prefilled for reconciliation: ${formatCount(prefilledStockQty)} ${productUnit.trim() || 'unit'}.`
                  : fromPurchase
                    ? `Prefilled: ${formatCount(currentStock)} in stock + ${formatCount(purchasedQty)} purchased.`
                  : 'Set the quantity currently available in this branch.'
            }
            isService={isService}
            onIsServiceChange={setIsService}
          />
          <Button
            title={saving ? 'Saving...' : 'Save Changes'}
            onPress={handleSaveProduct}
            loading={saving}
            size="lg"
          />
        </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
