import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useSupplierStore } from '@/store/supplierStore';
import { PurchaseCartItem, usePurchaseStore } from '@/store/purchaseStore';
import { Button, Card, EmptyState, LoadingScreen, PaymentSummary } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { HeaderAction, OverlayHeader, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from "@/constants";
import { Product } from '@/types';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';

const fmt = (n: number) => `\u20A6${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function PurchasesScreen() {
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const { products, fetchProducts } = useBusinessStore();
  const { suppliers, fetchSuppliers } = useSupplierStore();
  const { purchases, isLoading, isSaving, fetchPurchases, recordPurchase } = usePurchaseStore();

  const [showNew, setShowNew] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    await Promise.all([
      fetchPurchases(currentBusiness.id, currentBranch.id),
      fetchProducts(currentBusiness.id),
      fetchSuppliers(currentBusiness.id),
    ]);
  }, [currentBusiness, currentBranch, fetchProducts, fetchPurchases, fetchSuppliers]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProducts = products.filter(
    (product) =>
      product.is_active &&
      !product.is_service &&
      product.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const resetForm = () => {
    setCart([]);
    setSupplierId('');
    setSupplierName('');
    setAmountPaid('');
    setNotes('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setProductSearch('');
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, total_cost: (item.quantity + 1) * item.unit_cost }
            : item,
        );
      }

      const unitCost = product.cost_price || 0;
      return [...prev, { product, quantity: 1, unit_cost: unitCost, total_cost: unitCost }];
    });
  };

  const updateCartItem = (productId: string, field: 'quantity' | 'unit_cost', value: number) => {
    setCart((prev) =>
      prev
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
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
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
      Alert.alert('Empty', 'Add at least one product to record a purchase');
      return;
    }
    if (!supplierName.trim()) {
      Alert.alert('Error', 'Enter a supplier name');
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

    if (purchase) {
      const recordedSupplierName = supplierName.trim();
      setShowNew(false);
      resetForm();
      await load();
      Toast.show({
        type: 'success',
        text1: 'Purchase recorded',
        text2: `${purchase.purchase_number} - ${fmt(cartTotal)} from ${recordedSupplierName}`,
      });
    } else {
      Alert.alert('Error', 'Failed to record purchase. Please try again.');
    }
  };

  if (isLoading && !purchases.length) {
    return <LoadingScreen message="Loading purchases..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Purchases"
          theme="dark"
          right={<HeaderAction icon="plus" label="Add" onPress={() => { resetForm(); setShowNew(true); }} />}
        />

        {purchases.length === 0 ? (
          <EmptyState
            icon="package"
            title="No purchases recorded"
            description="Record stock purchases here. Inventory updates automatically."
            action={{ label: 'Record Purchase', onPress: () => { resetForm(); setShowNew(true); } }}
          />
        ) : (
          <FlatList
            data={purchases}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>{item.purchase_number}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Feather name="truck" size={12} color={COLORS.text.muted} />
                      <Text style={{ fontSize: 13, color: COLORS.text.secondary }}>
                        {(item as any).supplier?.name ?? 'Unknown Supplier'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                      {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
                    </Text>
                  </View>
                  <PaymentSummary totalAmount={item.total_amount} amountPaid={item.amount_paid} amountOwed={item.amount_owed} />
                </View>

                {(item as any).items?.slice(0, 2).map((purchaseItem: any) => (
                  <Text key={purchaseItem.id} style={{ fontSize: 12, color: COLORS.text.muted }}>
                    - {purchaseItem.product?.name} x {purchaseItem.quantity} @ {fmt(purchaseItem.unit_cost)}
                  </Text>
                ))}
                {(item as any).items?.length > 2 ? (
                  <Text style={{ fontSize: 12, color: COLORS.text.muted }}>
                    +{(item as any).items.length - 2} more items
                  </Text>
                ) : null}
              </Card>
            )}
          />
        )}
      </View>

      <Modal visible={showNew} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowNew(false)}>
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <OverlayHeader title="Record Purchase" onClose={() => setShowNew(false)} />

          <View style={{ flex: 1 }}>
            <View
              style={{
                padding: 12,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search products to add..."
                placeholderTextColor={COLORS.text.muted}
                style={{
                  backgroundColor: COLORS.surface,
                  borderWidth: 1,
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
                        borderColor: inCart ? COLORS.success : COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                        Cost: {fmt(item.cost_price || 0)}
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
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.surface2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <Feather name="package" size={24} color={COLORS.text.muted} />
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.text.muted, textAlign: 'center' }}>
                      Tap products to add them
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }}>
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
                          <TextInput
                            value={String(item.quantity)}
                            onChangeText={(value) => updateCartItem(item.product.id, 'quantity', parseFloat(value) || 0)}
                            keyboardType="numeric"
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              paddingHorizontal: 8,
                              paddingVertical: 6,
                              fontSize: 12,
                              color: COLORS.text.primary,
                            }}
                            placeholder="Qty"
                            placeholderTextColor={COLORS.text.muted}
                          />
                          <TextInput
                            value={String(item.unit_cost)}
                            onChangeText={(value) => updateCartItem(item.product.id, 'unit_cost', parseFloat(value) || 0)}
                            keyboardType="numeric"
                            style={{
                              flex: 1,
                              borderWidth: 1,
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
                          Total: {fmt(item.total_cost)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>

            {cart.length > 0 ? (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                  style={{
                    maxHeight: 360,
                    backgroundColor: '#FFFFFF',
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                  }}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={{ padding: 16, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 16, fontFamily: FONT.bold }}>Total</Text>
                      <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.success }}>{fmt(cartTotal)}</Text>
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
                      label={`Amount Paid (\u20A6)`}
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      placeholder={String(cartTotal)}
                      keyboardType="numeric"
                      prefix="\u20A6"
                      containerStyle={{ marginBottom: 4 }}
                    />

                    {amountOwed > 0 ? (
                      <View style={{ backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#DDAEA6', padding: 10 }}>
                        <Text style={{ color: COLORS.danger, fontFamily: FONT.medium, fontSize: 13 }}>
                          Supplier balance: {fmt(amountOwed)}
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
                      title={isSaving ? 'Recording...' : `Record Purchase - ${fmt(cartTotal)}`}
                      onPress={handleRecord}
                      loading={isSaving}
                      variant="success"
                      size="lg"
                    />
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            ) : null}
          </View>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
