import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { getAppSettings } from '@/lib/appSettings';
import { buildPurchasePrefillParam } from '@/lib/purchasePrefill';
import { supabase } from '@/lib/supabase';
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

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

export default function UpdateStockScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const { currentBusiness, currentBranch } = useAuthStore();
  const { products, fetchProducts } = useBusinessStore();

  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('piece');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);

  const closeScreen = () => router.back();

  const maybeOpenPurchaseSync = async (params: {
    productId: string;
    productName: string;
    productUnit: string;
    quantity: number;
    unitCost: number;
  }) => {
    const settings = await getAppSettings();
    if (!settings.inventoryPurchaseSyncEnabled || params.quantity <= 0) {
      return false;
    }

    router.replace({
      pathname: '/(app)/record-purchase',
      params: {
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

    return true;
  };

  const loadProducts = useCallback(async () => {
    if (!currentBusiness) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await fetchProducts(currentBusiness.id);
    } finally {
      setLoading(false);
    }
  }, [currentBusiness, fetchProducts]);

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
    setCostPrice(product.cost_price ? formatCount(Number(product.cost_price)) : '');
    setSellingPrice(formatCount(Number(product.selling_price ?? 0)));
    setStockQuantity(formatCount(currentStock));
    setReorderLevel(formatCount(Number(product.reorder_level ?? 5)));
    setIsService(product.is_service);
  }, [currentStock, product]);

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

    setSaving(true);
    try {
      const nextQuantity = isService ? 0 : roundAmount(parsedStockQuantity);
      const previousQuantity = roundAmount(currentStock);
      const quantityDelta = roundAmount(nextQuantity - previousQuantity);

      const { error: productError } = await supabase
        .from('products')
        .update({
          name: cleanProductName,
          unit: productUnit,
          cost_price: parsedCostPrice,
          selling_price: parsedSellingPrice,
          reorder_level: parsedReorderLevel,
          is_service: isService,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      throwIfError(productError);

      if (currentBranch) {
        const { error: inventoryError } = await supabase
          .from('inventory')
          .upsert(
            {
              product_id: product.id,
              branch_id: currentBranch.id,
              quantity: nextQuantity,
              last_updated: new Date().toISOString(),
            },
            { onConflict: 'product_id,branch_id' },
          );

        throwIfError(inventoryError);

        if (quantityDelta !== 0) {
          const movementQuantity = Math.abs(quantityDelta);
          const movementType = quantityDelta > 0 ? 'stock_in' : 'stock_out';
          const movementNote =
            isService && previousQuantity > 0
              ? 'Converted to service item from product update.'
              : quantityDelta > 0
                ? 'Quantity increased from product update.'
                : 'Quantity reduced from product update.';

          const { error: movementError } = await supabase.from('stock_movements').insert({
            business_id: currentBusiness.id,
            branch_id: currentBranch.id,
            product_id: product.id,
            type: movementType,
            quantity: movementQuantity,
            unit_cost: movementType === 'stock_in' && parsedCostPrice > 0 ? parsedCostPrice : undefined,
            total_cost:
              movementType === 'stock_in' && parsedCostPrice > 0
                ? roundAmount(parsedCostPrice * movementQuantity)
                : undefined,
            notes: movementNote,
          });

          throwIfError(movementError);
        }
      }

      await fetchProducts(currentBusiness.id);

      Toast.show({
        type: 'success',
        text1: 'Product updated',
        text2: isService
          ? `${cleanProductName} was saved as a service item.`
          : `${cleanProductName} now has ${formatCount(nextQuantity)} ${productUnit} in stock.`,
      });

      const openedPurchaseSync = await maybeOpenPurchaseSync({
        productId: product.id,
        productName: cleanProductName,
        productUnit,
        quantity: quantityDelta > 0 ? roundAmount(quantityDelta) : 0,
        unitCost: parsedCostPrice,
      });

      if (!openedPurchaseSync) {
        closeScreen();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading product..." />;
  }

  if (!product) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Update Stock"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="package"
          title="Product not found"
          description="This stock item could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
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
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
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
            stockQuantityLabel={`Stock Quantity (${productUnit})`}
            stockQuantityHint="Set the quantity currently available in this branch."
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
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
