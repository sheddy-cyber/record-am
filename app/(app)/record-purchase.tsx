import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useSupplierStore } from '@/store/supplierStore';
import { PurchaseCartItem, usePurchaseStore } from '@/store/purchaseStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, KeyboardAwareTextInput, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { Product } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function RecordPurchaseScreen() {
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const { products, fetchProducts } = useBusinessStore();
  const { suppliers, fetchSuppliers } = useSupplierStore();
  const { isLoading, isSaving, recordPurchase } = usePurchaseStore();

  const [productSearch, setProductSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState(false);

  const closeScreen = () => router.back();

  const load = useCallback(async () => {
    if (!currentBusiness || !currentBranch) {
      setReady(true);
      return;
    }

    setReady(false);
    try {
      await Promise.all([
        fetchProducts(currentBusiness.id),
        fetchSuppliers(currentBusiness.id),
      ]);
    } finally {
      setReady(true);
    }
  }, [currentBusiness, currentBranch, fetchProducts, fetchSuppliers]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProducts = products.filter(
    (product) =>
      product.is_active &&
      !product.is_service &&
      product.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const addToCart = (product: Product) => {
    setCart((previousCart) => {
      const existing = previousCart.find((item) => item.product.id === product.id);
      if (existing) {
        return previousCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, total_cost: (item.quantity + 1) * item.unit_cost }
            : item,
        );
      }

      const unitCost = product.cost_price || 0;
      return [...previousCart, { product, quantity: 1, unit_cost: unitCost, total_cost: unitCost }];
    });
  };

  const updateCartItem = (productId: string, field: 'quantity' | 'unit_cost', value: number) => {
    setCart((previousCart) =>
      previousCart
        .map((item) => {
          if (item.product.id !== productId) return item;
          const updated = { ...item, [field]: value };
          updated.total_cost = updated.quantity * updated.unit_cost;
          return updated;
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((previousCart) => previousCart.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total_cost, 0);
  const paid = parseFloat(amountPaid) || 0;
  const amountOwed = Math.max(0, cartTotal - paid);

  const handleSupplierSelect = (id: string) => {
    setSupplierId(id);
    const supplier = suppliers.find((entry) => entry.id === id);
    if (supplier) {
      setSupplierName(supplier.name);
    }
  };

  const handleRecord = async () => {
    if (!currentBusiness || !currentBranch || !user) return;
    if (cart.length === 0) {
      Alert.alert('Empty', 'Add at least one product to record a purchase.');
      return;
    }
    if (!supplierName.trim()) {
      Alert.alert('Error', 'Enter a supplier name.');
      return;
    }

    const purchase = await recordPurchase({
      businessId: currentBusiness.id,
      branchId: currentBranch.id,
      userId: user.id,
      supplierId: supplierId || undefined,
      supplierName: supplierName.trim(),
      items: cart,
      amountPaid: paid || cartTotal,
      notes: notes || undefined,
      purchaseDate,
    });

    if (!purchase) {
      Alert.alert('Error', 'Failed to record purchase. Please try again.');
      return;
    }

    Toast.show({
      type: 'success',
      text1: 'Purchase recorded',
      text2: `${purchase.purchase_number} \u00B7 ${formatCurrency(cartTotal)} from ${supplierName.trim()}`,
    });

    closeScreen();
  };

  if (!ready || (isLoading && products.length === 0)) {
    return <LoadingScreen message="Loading purchase setup..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Purchase"
        subtitle="Add products, supplier details, and payment."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />

      <View style={{ flex: 1 }}>
        <View
          style={{
            padding: 12,
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
        </View>

        <View style={{ flex: 1, flexDirection: 'row' }}>
          <FlatList
            style={{ flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border }}
            data={filteredProducts}
            keyExtractor={(product) => product.id}
            contentContainerStyle={{ padding: 8, gap: 6 }}
            ListEmptyComponent={
              <EmptyState
                icon="package"
                title="No matching products"
                description="Add products in inventory first, then come back here to record the purchase."
              />
            }
            renderItem={({ item }) => {
              const inCart = cart.find((cartItem) => cartItem.product.id === item.id);
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
                </TouchableOpacity>
              );
            }}
          />

          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                Cart ({cart.length})
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
                  Tap products to add them
                </Text>
              </View>
            ) : (
              <KeyboardAwareScrollView style={{ flex: 1 }}>
                {cart.map((item) => (
                  <View key={item.product.id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1 }} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <TouchableOpacity onPress={() => removeFromCart(item.product.id)} activeOpacity={0.8}>
                        <Feather name="x" size={16} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <KeyboardAwareTextInput
                        value={String(item.quantity)}
                        onChangeText={(value) => updateCartItem(item.product.id, 'quantity', parseFloat(value) || 0)}
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
                        value={String(item.unit_cost)}
                        onChangeText={(value) => updateCartItem(item.product.id, 'unit_cost', parseFloat(value) || 0)}
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
                  </View>
                ))}
              </KeyboardAwareScrollView>
            )}
          </View>
        </View>

        {cart.length > 0 ? (
          <KeyboardAwareScrollView
            style={{
              maxHeight: 360,
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          >
            <View style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontFamily: FONT.bold }}>Total</Text>
                <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.success }}>{formatCurrency(cartTotal)}</Text>
              </View>

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

              <InputField
                label="Amount Paid"
                value={amountPaid}
                onChangeText={setAmountPaid}
                placeholder={String(cartTotal)}
                keyboardType="numeric"
                prefix={CURRENCY_SYMBOL}
                containerStyle={{ marginBottom: 4 }}
              />

              {amountOwed > 0 ? (
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
                    Supplier balance: {formatCurrency(amountOwed)}
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
                placeholder="Optional note..."
                multiline
                containerStyle={{ marginBottom: 4 }}
              />

              <Button
                title={isSaving ? 'Recording...' : `Record Purchase \u00B7 ${formatCurrency(cartTotal)}`}
                onPress={handleRecord}
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
