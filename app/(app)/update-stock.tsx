import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  BackHandler,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/touchables';
import { Icon } from '@/components/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { addMismatch, removeMismatch } from '@/lib/mismatchService';
import {
  defaultPurchaseLink,
  linkFields,
  purchaseLinkProblem,
  recordPurchaseForStock,
} from '@/lib/stockPurchaseLink';
import { PurchaseLinkFields } from '@/components/inventory/PurchaseLinkFields';
import { updateProductAndInventoryOffline } from '@/lib/offlineRecords';
import { checkAndNotifyLowStock } from '@/lib/notifications';
import { calculateWeightedAverageCost, calculateProfitMargin } from '@/lib/costing';
import { Button, EmptyState, LoadingScreen, RoleGate } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/forms';
import { ProductFormFields } from '@/components/inventory/ProductFormFields';
import { CostStrategySelector } from '@/components/inventory/CostStrategySelector';
import { BarcodeScannerModal } from '@/components/scanner/BarcodeScannerModal';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, CURRENCY_SYMBOL, ACCENTS } from '@/constants';
import { dismissScreen } from '@/lib/navigation';
import { Category } from '@/types';

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
    restock?: string | string[];
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
  const rawRestock = Array.isArray(params.restock) ? params.restock[0] : params.restock;
  const isSyncFlowActive = syncFlow === '1';
  const isManualReconcile = Boolean(mismatchId);
  const isRestock = rawRestock === '1';
  const fromPurchase = stockAdjustment !== null || purchasedQty > 0;
  // Opened for a purchase that already exists (older reconcile flow): don't
  // record a second purchase for the same goods.
  const forExistingPurchase = Boolean(purchaseId) || isSyncFlowActive || purchasedQty > 0 || isManualReconcile;

  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const userRole = useAuthStore((s) => s.userRole);
  const isOwnerOrManager = userRole === 'owner' || userRole === 'manager';
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
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>(undefined);
  const [costPrice, setCostPrice] = useState('');
  const [manualNewCost, setManualNewCost] = useState<number | null>(null);
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefilledStockQty, setPrefilledStockQty] = useState<number | null>(null);
  const [selectedCostStrategy, setSelectedCostStrategy] = useState<'weighted' | 'new' | 'old' | null>(null);
  const [purchaseLink, setPurchaseLink] = useState(defaultPurchaseLink);

  const hasSavedRef = useRef(false);

  const closeScreen = () => dismissScreen();

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

  const oldCost = useMemo(() => Number(product?.cost_price ?? 0), [product]);
  const incomingQty = fromPurchase ? (purchasedQty > 0 ? purchasedQty : Math.max(0, effectiveStockAdjustment)) : 0;
  const hasIncomingPurchaseCost = fromPurchase && purchasedUnitCost > 0 && incomingQty > 0;

  const purchaseWeightedAvg = useMemo(() => {
    if (!hasIncomingPurchaseCost || currentStock <= 0 || oldCost <= 0) return null;
    return calculateWeightedAverageCost({
      currentStock,
      currentCostPrice: oldCost,
      addedQuantity: incomingQty,
      newUnitCost: purchasedUnitCost,
    });
  }, [hasIncomingPurchaseCost, currentStock, oldCost, incomingQty, purchasedUnitCost]);

  useEffect(() => {
    if (!product) return;

    setProductName(product.name);
    setProductUnit(product.unit);
    setCategoryId(product.category_id ?? null);
    setSelectedCategory(product.category);

    const oldCostPrice = Number(product.cost_price ?? 0);
    const hasIncomingPurchase = fromPurchase && purchasedUnitCost > 0 && (purchasedQty > 0 || effectiveStockAdjustment > 0);

    if (hasIncomingPurchase && currentStock > 0 && oldCostPrice > 0 && purchasedUnitCost !== oldCostPrice) {
      const blendedCost = calculateWeightedAverageCost({
        currentStock,
        currentCostPrice: oldCostPrice,
        addedQuantity: purchasedQty > 0 ? purchasedQty : effectiveStockAdjustment,
        newUnitCost: purchasedUnitCost,
      });
      setCostPrice(formatCount(blendedCost));
    } else if (purchasedUnitCost > 0) {
      setCostPrice(formatCount(purchasedUnitCost));
    } else if (oldCostPrice > 0) {
      setCostPrice(formatCount(oldCostPrice));
    } else {
      setCostPrice('');
    }

    setSellingPrice(formatCount(Number(product.selling_price ?? 0)));

    const newStockQty = fromPurchase
      ? roundAmount(currentStock + effectiveStockAdjustment)
      : currentStock;
    setStockQuantity(isRestock ? '' : formatCount(newStockQty));
    if (fromPurchase) {
      setPrefilledStockQty(newStockQty);
    } else {
      setPrefilledStockQty(null);
    }

    setReorderLevel(formatCount(Number(product.reorder_level ?? 5)));
    setBarcode(product.barcode ?? '');
    setIsService(product.is_service);
  }, [currentStock, effectiveStockAdjustment, fromPurchase, isRestock, product, purchasedQty, purchasedUnitCost]);

  const handleCostPriceChange = useCallback((val: string) => {
    setCostPrice(val);
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0 && oldCost > 0 && Math.abs(parsed - oldCost) >= 0.01) {
      setManualNewCost(parsed);
      setSelectedCostStrategy(null);
    } else if (Number.isFinite(parsed) && Math.abs(parsed - oldCost) < 0.01) {
      setManualNewCost(null);
      setSelectedCostStrategy(null);
    }
  }, [oldCost]);

  const parsedCost = parseFloat(costPrice) || 0;
  const parsedSelling = parseFloat(sellingPrice) || 0;
  const parsedStockQty = parseFloat(stockQuantity) || 0;
  const manualAddedQty = isRestock
    ? Math.max(0, roundAmount(parsedStockQty))
    : Math.max(0, roundAmount(parsedStockQty - currentStock));

  const effectiveNewCost = useMemo(() => {
    if (fromPurchase) {
      // When coming from purchase, the new cost is the purchased unit cost
      // This is used for reconciliation calculations
      return purchasedUnitCost > 0 ? purchasedUnitCost : 0;
    }
    if (manualNewCost !== null && manualNewCost > 0) {
      return manualNewCost;
    }
    if (parsedCost > 0 && oldCost > 0 && Math.abs(parsedCost - oldCost) >= 0.01) {
      return parsedCost;
    }
    return 0;
  }, [fromPurchase, purchasedUnitCost, manualNewCost, parsedCost, oldCost]);

  const effectiveIncomingQty = fromPurchase ? incomingQty : manualAddedQty;

  const costPriceOptionsNode = useMemo(() => {
    if (isService) return null;

    const isStockQuantityIncreased = effectiveIncomingQty > 0 && currentStock > 0;

    const hasCostFluctuation =
      isStockQuantityIncreased &&
      oldCost > 0 &&
      effectiveNewCost > 0 &&
      Math.abs(effectiveNewCost - oldCost) >= 0.01;

    if (!hasCostFluctuation) return null;

    return (
      <CostStrategySelector
        oldCost={oldCost}
        newCost={effectiveNewCost}
        currentStock={currentStock}
        incomingQty={effectiveIncomingQty}
        currentCostPrice={costPrice}
        selectedStrategy={selectedCostStrategy || undefined}
        onSelectStrategy={(chosenCost, strategy) => {
          setSelectedCostStrategy(strategy);
          setCostPrice(formatCount(chosenCost));
        }}
        productUnit={productUnit}
        isFromPurchase={fromPurchase}
      />
    );
  }, [
    isService,
    oldCost,
    effectiveNewCost,
    currentStock,
    effectiveIncomingQty,
    costPrice,
    selectedCostStrategy,
    productUnit,
    fromPurchase,
  ]);

  const marginData = useMemo(() => {
    if (parsedSelling <= 0 && parsedCost <= 0) return null;
    return calculateProfitMargin(parsedCost, parsedSelling);
  }, [parsedCost, parsedSelling]);

  const marginIndicatorNode = useMemo(() => {
    return (
      <RoleGate allowedRoles={['owner', 'manager']}>
        {parsedSelling > 0 && parsedCost === 0 && !isService ? (
          <View style={[styles.marginContainer, styles.marginNeutral]}>
            <Icon name="info" size={13} color={COLORS.text.muted} />
            <Text style={styles.marginTextNeutral}>
              No cost price set (100% of selling price recorded as profit)
            </Text>
          </View>
        ) : null}

        {parsedSelling > 0 && parsedCost > 0 && marginData ? (
          marginData.status === 'profit' ? (
            <View style={[styles.marginContainer, styles.marginProfit]}>
              <Icon name="trending-up" size={14} color="#1e8449" />
              <Text style={styles.marginTextProfit}>
                +{CURRENCY_SYMBOL}{formatCount(marginData.profitPerUnit)} profit/unit ({marginData.marginPercentage}% margin)
              </Text>
            </View>
          ) : marginData.status === 'loss' ? (
            <View style={[styles.marginContainer, styles.marginLoss]}>
              <Icon name="alert-triangle" size={14} color={COLORS.danger} />
              <Text style={styles.marginTextLoss}>
                Selling at a loss of {CURRENCY_SYMBOL}{formatCount(Math.abs(marginData.profitPerUnit))}/unit ({Math.abs(marginData.marginPercentage)}% negative margin)
              </Text>
            </View>
          ) : (
            <View style={[styles.marginContainer, styles.marginNeutral]}>
              <Icon name="minus-circle" size={14} color={COLORS.text.secondary} />
              <Text style={styles.marginTextSecondary}>
                Break-even ({CURRENCY_SYMBOL}0.00 profit/unit)
              </Text>
            </View>
          )
        ) : null}
      </RoleGate>
    );
  }, [parsedSelling, parsedCost, isService, marginData]);

  const damageActionNode = useMemo(() => {
    if (!isOwnerOrManager || isService || !product) return null;
    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/(app)/record-damage', params: { productId: product.id } })}
        activeOpacity={0.6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginTop: 2 }}
      >
        <Text style={{ fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>
          Some broke or expired?{' '}
          <Text style={{ fontFamily: FONT.medium, color: COLORS.accentDark }}>Record damage instead</Text>
        </Text>
      </TouchableOpacity>
    );
  }, [isOwnerOrManager, isService, product]);

  const handleSaveProduct = async () => {
    if (!product || !currentBusiness) return;
    if (isRestock && product.is_service) {
      Alert.alert('Service item', 'Services do not have stock to restock.');
      return;
    }
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
    if (
      !isService &&
      (!Number.isFinite(parsedStockQuantity) ||
        parsedStockQuantity < 0 ||
        (isRestock && (!stockQuantity.trim() || parsedStockQuantity <= 0)))
    ) {
      Alert.alert(
        'Invalid quantity',
        isRestock ? 'Enter a restock quantity greater than zero.' : 'Enter a valid stock quantity.',
      );
      return;
    }

    const parsedReorderLevel = reorderLevel.trim() ? parseFloat(reorderLevel) : 5;
    if (!Number.isFinite(parsedReorderLevel) || parsedReorderLevel < 0) {
      Alert.alert('Invalid reorder level', 'Enter a valid reorder level.');
      return;
    }

    if (!isOwnerOrManager && !product.is_service) {
      if (isService && currentStock > 0) {
        Alert.alert(
          'Action Not Permitted',
          'Staff members cannot convert items with existing stock into services. Only owners and managers can reduce or clear stock.'
        );
        return;
      }

      if (!isRestock && parsedStockQuantity < currentStock) {
        Alert.alert(
          'Cannot Reduce Stock',
          `Staff members are only permitted to increase stock quantity.\n\nCurrent on-hand stock is ${formatCount(currentStock)} ${cleanProductUnit}. To update stock, please enter ${formatCount(currentStock)} or higher.`
        );
        return;
      }
    }

    const isStockQuantityIncreased = effectiveIncomingQty > 0 && currentStock > 0;
    const hasCostFluctuation =
      !isService &&
      isStockQuantityIncreased &&
      oldCost > 0 &&
      effectiveNewCost > 0 &&
      Math.abs(effectiveNewCost - oldCost) >= 0.01;

    if (hasCostFluctuation && selectedCostStrategy === null) {
      Alert.alert(
        'Valuation Option Required',
        'Cost price change detected. Please select one of the valuation options (Weighted Average, Use New Cost Price, or Stick with Old Cost Price) before saving.'
      );
      return;
    }

    const plannedIncrease = isService
      ? 0
      : isRestock
        ? parsedStockQuantity
        : roundAmount(parsedStockQuantity - currentStock);
    const willLinkPurchase = !forExistingPurchase && plannedIncrease > 0;
    const linkProblem = willLinkPurchase ? purchaseLinkProblem(purchaseLink) : null;
    if (linkProblem) {
      Alert.alert('Purchase details', linkProblem);
      return;
    }

    const executeSave = async (hasMismatch: boolean) => {
      setSaving(true);
      try {
        const nextQuantity = isService
          ? 0
          : isRestock
            ? roundAmount(currentStock + parsedStockQuantity)
            : roundAmount(parsedStockQuantity);

        if (!isOwnerOrManager && !product.is_service && nextQuantity < roundAmount(currentStock)) {
          Alert.alert(
            'Cannot Reduce Stock',
            'Staff members are only allowed to increase stock quantity.'
          );
          setSaving(false);
          return;
        }
        const previousQuantity = roundAmount(currentStock);
        const quantityDelta = isRestock
          ? roundAmount(parsedStockQuantity)
          : roundAmount(nextQuantity - previousQuantity);

        const movementQuantity = Math.abs(quantityDelta);
        const movementType = quantityDelta > 0 ? 'stock_in' : 'stock_out';
        const movementNote =
          isService && previousQuantity > 0
            ? 'Converted to service item from product update.'
            : isRestock
              ? 'Restocked from inventory.'
            : quantityDelta > 0
              ? 'Quantity increased from product update.'
              : 'Quantity reduced from product update.';

        const actualIncomingUnitCost =
          manualNewCost !== null && manualNewCost > 0
            ? manualNewCost
            : parsedCostPrice;

        // Stock going up is also recorded as a purchase, in the same save.
        const link =
          currentBranch && !forExistingPurchase && !isService && quantityDelta > 0
            ? await recordPurchaseForStock({
                businessId: currentBusiness.id,
                branchId: currentBranch.id,
                items: [
                  {
                    product: { ...product, name: cleanProductName, unit: cleanProductUnit },
                    quantity: quantityDelta,
                    unitCost: actualIncomingUnitCost,
                  },
                ],
                choice: purchaseLink,
                notes: isRestock ? `Restock of ${cleanProductName}` : `Stock increase for ${cleanProductName}`,
              })
            : null;

        await updateProductAndInventoryOffline({
          businessId: currentBusiness.id,
          branchId: currentBranch?.id,
          product: product,
          productPatch: {
            category_id: categoryId || undefined,
            category: selectedCategory,
            name: cleanProductName,
            unit: cleanProductUnit,
            cost_price: parsedCostPrice,
            selling_price: parsedSellingPrice,
            reorder_level: parsedReorderLevel,
            barcode: barcode.trim() || undefined,
            is_service: isService,
          },
          nextQuantity: currentBranch ? nextQuantity : undefined,
          movement:
            currentBranch && quantityDelta !== 0
              ? {
                  type: movementType,
                  quantity: movementQuantity,
                  unit_cost: movementType === 'stock_in' && actualIncomingUnitCost > 0 ? actualIncomingUnitCost : undefined,
                  total_cost:
                    movementType === 'stock_in' && actualIncomingUnitCost > 0
                      ? roundAmount(actualIncomingUnitCost * movementQuantity)
                      : undefined,
                  notes: link ? `${movementNote} Purchase ${link.purchaseNumber}.` : movementNote,
                  ...linkFields(link),
                }
              : undefined,
        });

        hasSavedRef.current = true;

        Toast.show({
          type: 'success',
          text1: isRestock ? 'Stock restocked' : 'Product updated',
          text2: isService
            ? `${cleanProductName} was saved as a service item.`
            : `${cleanProductName} now has ${formatCount(nextQuantity)} ${cleanProductUnit} in stock. Sync queued.`,
        });

        if (currentBusiness && currentBranch) {
          void checkAndNotifyLowStock(currentBusiness.id, currentBranch.id);
        }

        if (isService || nextQuantity > parsedReorderLevel) {
          try {
            const { useNotificationStore } = await import('@/store/notificationStore');
            void useNotificationStore.getState().markLowStockAsRead(product.id, cleanProductName);
          } catch (_) {}
        }

        if (mismatchId) {
          await removeMismatch(mismatchId, currentBusiness?.id);
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
          closeScreen();
        }
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Please try again.');
      }
    };

    const purchaseWeightedCost = purchaseWeightedAvg;
    const isRecognizedCostStrategy =
      (purchaseWeightedCost !== null && Math.abs(parsedCostPrice - purchaseWeightedCost) < 0.05) ||
      Math.abs(parsedCostPrice - oldCost) < 0.05 ||
      Math.abs(parsedCostPrice - purchasedUnitCost) < 0.05;

    const isQuantityMismatch =
      prefilledStockQty !== null &&
      roundAmount(parsedStockQuantity) !== roundAmount(prefilledStockQty);
    const isCostMismatch = !isRecognizedCostStrategy;

    const hasMismatch = !isManualReconcile && isSyncFlowActive && (
      isQuantityMismatch || isCostMismatch
    );

    const isQuantityOnlyRestock =
      isRestock &&
      Math.abs(parsedCostPrice - oldCost) < 0.01 &&
      Math.abs(parsedSellingPrice - Number(product.selling_price ?? 0)) < 0.01;

    if (isQuantityOnlyRestock && !hasMismatch) {
      void executeSave(false);
      return;
    }

    const checkLossAndExecute = (mismatch: boolean) => {
      if (!isService && parsedCostPrice > 0 && parsedCostPrice >= parsedSellingPrice) {
        const isLoss = parsedCostPrice > parsedSellingPrice;
        Alert.alert(
          isLoss ? 'Potential Loss Warning' : 'Zero Margin Warning',
          isLoss
            ? `Your cost price (${CURRENCY_SYMBOL}${formatCount(parsedCostPrice)}) is higher than your selling price (${CURRENCY_SYMBOL}${formatCount(parsedSellingPrice)}).\n\nSelling at this price will register a loss of ${CURRENCY_SYMBOL}${formatCount(parsedCostPrice - parsedSellingPrice)} per unit. Do you want to adjust your selling price or continue anyway?`
            : `Your cost price (${CURRENCY_SYMBOL}${formatCount(parsedCostPrice)}) is equal to your selling price (${CURRENCY_SYMBOL}${formatCount(parsedSellingPrice)}).\n\nYou will make zero profit on this item. Save anyway?`,
          [
            { text: 'Adjust Price', style: 'cancel' },
            {
              text: 'Save Anyway',
              style: isLoss ? 'destructive' : 'default',
              onPress: () => executeSave(mismatch),
            },
          ]
        );
      } else {
        executeSave(mismatch);
      }
    };

    const confirmAndExecute = (mismatch: boolean) => {
      if (!isService && parsedCostPrice === 0) {
        Alert.alert(
          'Missing Cost Price',
          'Without a cost price, 100% of the selling price will be recorded as profit.\n\nDo you want to add a cost price or continue anyway?',
          [
            { text: 'Add Cost Price', style: 'cancel' },
            { text: 'Continue Anyway', onPress: () => checkLossAndExecute(mismatch), style: 'default' },
          ]
        );
      } else {
        checkLossAndExecute(mismatch);
      }
    };

    if (hasMismatch) {
      Alert.alert(
        'Mismatch Warning',
        'The quantity or cost price does not match the purchase. Save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: () => confirmAndExecute(true),
          },
        ]
      );
    } else {
      confirmAndExecute(false);
    }
  };


  if (loading) {
    return <LoadingScreen message="Loading product details..." />;
  }

  if (!product) {
    return (
      <ScreenShell backgroundColor={COLORS.surface}>
        <ScreenHeader
          title={isRestock ? 'Restock Item' : 'Update Stock'}
         
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
    <ScreenShell backgroundColor={COLORS.surface}>
      <ScreenHeader
        title={isRestock ? 'Restock' : 'Edit product'}
        subtitle={product?.name}
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
          {product && !product.is_service && !isManualReconcile && !fromPurchase ? (
            <View style={summaryStyles.card}>
              <View style={{ flex: 1 }}>
                <Text style={summaryStyles.label}>In stock{currentBranch?.name ? ` at ${currentBranch.name}` : ''}</Text>
                <Text style={summaryStyles.value}>
                  {formatCount(currentStock)}
                  <Text style={summaryStyles.unit}> {product.unit}</Text>
                </Text>
                <Text
                  style={[
                    summaryStyles.status,
                    currentStock <= 0
                      ? { color: COLORS.dangerText }
                      : currentStock <= Number(product.reorder_level || 0)
                      ? { color: COLORS.warningText }
                      : null,
                  ]}
                >
                  {currentStock <= 0
                    ? 'Out of stock'
                    : `${currentStock <= Number(product.reorder_level || 0) ? 'Running low · ' : ''}reorder at ${formatCount(Number(product.reorder_level || 0))}`}
                </Text>
              </View>
              {!isRestock ? (
                <Button title="Restock" icon="plus" size="sm" onPress={() => router.setParams({ restock: '1' } as any)} />
              ) : null}
            </View>
          ) : null}

          <ProductFormFields
            productName={productName}
            onProductNameChange={setProductName}
            productUnit={productUnit}
            onProductUnitChange={setProductUnit}
            categoryId={categoryId}
            onCategoryIdChange={(id, cat) => {
              setCategoryId(id);
              setSelectedCategory(cat);
            }}
            costPrice={costPrice}
            onCostPriceChange={handleCostPriceChange}
            costPriceExtra={costPriceOptionsNode}
            sellingPrice={sellingPrice}
            onSellingPriceChange={setSellingPrice}
            sellingPriceExtra={marginIndicatorNode}
            reorderLevel={reorderLevel}
            onReorderLevelChange={setReorderLevel}
            stockQuantity={stockQuantity}
            onStockQuantityChange={setStockQuantity}
            stockQuantityExtra={damageActionNode}
            stockQuantityFirst={isRestock}
            stockQuantityLabel={
              isRestock
                ? `How many ${productUnit.trim() || 'units'} came in?`
                : `Quantity in stock (${productUnit.trim() || 'unit'})`
            }
            stockQuantityHint={
              isRestock
                ? parsedStockQty > 0
                  ? `New total will be ${formatCount(roundAmount(currentStock + parsedStockQty))} ${productUnit.trim() || 'unit'}.`
                  : `Added to the ${formatCount(currentStock)} already in stock.`
                : !isOwnerOrManager
                  ? parsedStockQty > 0 && parsedStockQty < currentStock
                    ? `Staff cannot reduce stock below current quantity (${formatCount(currentStock)} ${productUnit.trim() || 'unit'}).`
                    : `Staff can only increase stock. Current on-hand: ${formatCount(currentStock)} ${productUnit.trim() || 'unit'}.`
                : prefilledStockQty !== null && parseFloat(stockQuantity) !== prefilledStockQty
                ? isManualReconcile
                  ? `Changed from reconciliation value (${formatCount(prefilledStockQty)}).`
                  : `Changed from prefilled value (${formatCount(prefilledStockQty)}). Was ${formatCount(currentStock)} + ${formatCount(purchasedQty)} purchased.`
                : isManualReconcile && prefilledStockQty !== null
                  ? `Prefilled for reconciliation: ${formatCount(prefilledStockQty)} ${productUnit.trim() || 'unit'}.`
                  : fromPurchase
                    ? `Prefilled: ${formatCount(currentStock)} in stock + ${formatCount(purchasedQty)} purchased.`
                  : 'Set the quantity currently available in this branch.'
            }
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScanBarcodePress={() => setScannerOpen(true)}
            isService={isService}
            onIsServiceChange={(val) => {
              if (val && !isOwnerOrManager && currentStock > 0) {
                Alert.alert(
                  'Action Restricted',
                  'Staff members cannot convert items with existing stock into services. Only owners and managers can change this.'
                );
                return;
              }
              setIsService(val);
            }}
          />
          {!isService && !forExistingPurchase ? (
            <PurchaseLinkFields
              value={purchaseLink}
              onChange={setPurchaseLink}
              quantity={
                isRestock
                  ? parseFloat(stockQuantity) || 0
                  : roundAmount((parseFloat(stockQuantity) || 0) - currentStock)
              }
            />
          ) : null}
          <Button
            title={isRestock ? 'Add to stock' : 'Save changes'}
            onPress={handleSaveProduct}
            loading={saving}
            size="lg"
          />
        </KeyboardAwareScrollView>

        <BarcodeScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={(scanned) => setBarcode(scanned)}
          title="Scan Product Barcode"
          subtitle="Point at any barcode or QR code on the packaging"
        />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  marginContainer: {
    marginTop: -8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  marginProfit: {
    backgroundColor: ACCENTS.profit.bg,
    borderColor: ACCENTS.profit.border,
  },
  marginLoss: {
    backgroundColor: ACCENTS.danger.bg,
    borderColor: ACCENTS.danger.border,
  },
  marginNeutral: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  marginTextProfit: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: '#1e8449',
    flex: 1,
  },
  marginTextLoss: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.danger,
    flex: 1,
  },
  marginTextNeutral: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    flex: 1,
  },
  marginTextSecondary: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    flex: 1,
  },
});

const summaryStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 24,
  },
  label: { fontSize: 13.5, fontFamily: FONT.medium, color: COLORS.text.secondary },
  value: { fontSize: 36, lineHeight: 42, fontFamily: FONT.display, color: COLORS.text.primary, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 17, fontFamily: FONT.regular, color: COLORS.text.muted, letterSpacing: 0 },
  status: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted },
});
