import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { getAppSettings } from '@/lib/appSettings';
import { buildPurchasePrefillParam } from '@/lib/purchasePrefill';
import { supabase } from '@/lib/supabase';
import { Button, LoadingScreen } from '@/components/ui';
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

export default function AddStockScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();
  const {
    products,
    fetchProducts,
    createProduct,
  } = useBusinessStore();

  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('piece');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [openingQuantity, setOpeningQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);

  const closeScreen = () => router.back();

  const load = useCallback(async () => {
    if (!currentBusiness) return;

    setLoading(true);
    try {
      await fetchProducts(currentBusiness.id);
    } finally {
      setLoading(false);
    }
  }, [currentBusiness, fetchProducts]);

  useEffect(() => {
    load();
  }, [load]);

  const resetProductForm = () => {
    setProductName('');
    setProductUnit('piece');
    setCostPrice('');
    setSellingPrice('');
    setOpeningQuantity('');
    setReorderLevel('5');
    setIsService(false);
  };

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
          notes: 'Opened from inventory stock addition.',
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

  const handleSaveProduct = async () => {
    if (!currentBusiness) return;
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
      (product) =>
        normalizeProductName(product.name) ===
        normalizeProductName(cleanProductName),
    );
    if (duplicateProduct) {
      Alert.alert(
        'Duplicate product',
        `${duplicateProduct.name} already exists in stock. Update its stock quantity instead.`,
      );
      return;
    }

    const parsedOpeningQuantity = openingQuantity.trim()
      ? parseFloat(openingQuantity)
      : 0;
    if (
      !isService &&
      (!Number.isFinite(parsedOpeningQuantity) || parsedOpeningQuantity < 0)
    ) {
      Alert.alert('Invalid quantity', 'Enter a valid opening quantity.');
      return;
    }

    setSaving(true);
    try {
      const initialQuantity = isService ? 0 : parsedOpeningQuantity;
      const parsedCostPrice = parseFloat(costPrice) || 0;
      const product = await createProduct({
        business_id: currentBusiness.id,
        name: cleanProductName,
        unit: productUnit,
        cost_price: parsedCostPrice,
        selling_price: parseFloat(sellingPrice),
        reorder_level: parseFloat(reorderLevel) || 5,
        is_service: isService,
      });

      if (!product) throw new Error('Failed to create product');

      if (currentBranch) {
        await supabase.from('inventory').insert({
          product_id: product.id,
          branch_id: currentBranch.id,
          quantity: initialQuantity,
        });

        if (initialQuantity > 0) {
          await supabase.from('stock_movements').insert({
            business_id: currentBusiness.id,
            branch_id: currentBranch.id,
            product_id: product.id,
            type: 'stock_in',
            quantity: initialQuantity,
            unit_cost: parsedCostPrice || undefined,
            total_cost: parsedCostPrice
              ? parsedCostPrice * initialQuantity
              : undefined,
            notes: 'Opening stock',
          });
        }
      }

      // Reload products after the inventory row exists so other screens
      // immediately see the correct stock quantity when this screen closes.
      await fetchProducts(currentBusiness.id);

      Toast.show({
        type: 'success',
        text1: 'Product added',
        text2: `${product.name} is now in inventory${initialQuantity > 0 ? ` with ${formatCount(initialQuantity)} ${product.unit}` : ''}.`,
      });

      resetProductForm();
      const openedPurchaseSync = await maybeOpenPurchaseSync({
        productId: product.id,
        productName: product.name,
        productUnit: product.unit,
        quantity: initialQuantity,
        unitCost: parsedCostPrice,
      });

      if (!openedPurchaseSync) {
        closeScreen();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading inventory setup..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Add Stock"
        subtitle="Create a new stock or service item."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 32,
          }}
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
            stockQuantity={openingQuantity}
            onStockQuantityChange={setOpeningQuantity}
            stockQuantityLabel={`Opening Quantity (${productUnit})`}
            stockQuantityHint="Set the starting stock while creating this product."
            isService={isService}
            onIsServiceChange={setIsService}
          />
          <Button
            title={saving ? 'Saving...' : 'Add Product'}
            onPress={handleSaveProduct}
            loading={saving}
            size="lg"
          />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
