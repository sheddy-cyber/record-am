import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { deletePurchaseRecord } from '@/lib/recordDeletion';
import { Badge, Button, Card, ConfirmDialog, EmptyState, LoadingScreen, PaymentSummary, SectionHeader } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function SupplierDetailScreen() {
  const params = useLocalSearchParams<{ supplierId?: string | string[] }>();
  const supplierId = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  const { currentBusiness } = useAuthStore();
  const {
    suppliers,
    selectedSupplier,
    supplierPurchases,
    isLoading,
    fetchSuppliers,
    fetchSupplierDetail,
    deleteSupplier,
    setSelectedSupplier,
  } = useSupplierStore();

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<string | null>(null);

  const closeScreen = () => router.back();

  const load = useCallback(async () => {
    if (!currentBusiness || !supplierId) return;

    await Promise.all([
      fetchSuppliers(currentBusiness.id),
      fetchSupplierDetail(supplierId, currentBusiness.id),
    ]);
  }, [currentBusiness, fetchSupplierDetail, fetchSuppliers, supplierId]);

  useFocusEffect(
    useCallback(() => {
      import('react-native').then(({ InteractionManager }) => {
        InteractionManager.runAfterInteractions(() => {
          load();
        });
      });
    }, [load]),
  );

  const supplier = useMemo(() => {
    return suppliers.find((item) => item.id === supplierId)
      ?? (selectedSupplier?.id === supplierId ? selectedSupplier : null);
  }, [selectedSupplier, supplierId, suppliers]);

  useEffect(() => {
    if (supplier) {
      setSelectedSupplier(supplier);
    }
  }, [setSelectedSupplier, supplier]);

  const handleDelete = () => {
    if (!supplier) return;
    setShowRemoveConfirm(true);
  };

  const handleDeletePurchase = (purchaseId: string) => {
    setPurchaseToDelete(purchaseId);
  };


  if (!supplier) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Supplier Details"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="truck"
          title="Supplier not found"
          description="This supplier record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  const openRecordGoods = () =>
    router.push({ pathname: '/(app)/record-purchase', params: { supplierId: supplier.id } });

  const openEditPurchase = (id: string) =>
    router.push({ pathname: '/(app)/record-purchase', params: { purchaseId: id } });

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={supplier.name}
        subtitle="Supplier details"
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Card style={{ backgroundColor: COLORS.ink }}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, gap: 10 }}>
                {supplier.phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="phone" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: 'rgba(255,253,248,0.8)' }}>
                      {supplier.phone}
                    </Text>
                  </View>
                ) : null}
                {supplier.email ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="mail" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: 'rgba(255,253,248,0.68)' }}>
                      {supplier.email}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { icon: 'plus', onPress: openRecordGoods, color: COLORS.successLight, label: 'Record goods' },
                  { icon: 'edit-2', onPress: () => router.push({ pathname: '/(app)/supplier-edit', params: { supplierId: supplier.id } }), color: COLORS.infoLight, label: 'Edit supplier' },
                  { icon: 'trash-2', onPress: handleDelete, color: '#FECACA', label: 'Remove supplier' },
                ].map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    onPress={action.onPress}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: 'rgba(255,253,248,0.12)',
                      backgroundColor: 'rgba(255,253,248,0.08)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={action.icon as any} size={15} color={action.color} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {[
                { label: 'Total Purchased', value: formatCurrency(supplier.total_purchased ?? 0), color: COLORS.infoLight },
                { label: 'Orders', value: String(supplier.total_orders ?? 0), color: COLORS.successLight },
                { label: 'We Owe', value: formatCurrency(supplier.outstanding_debt ?? 0), color: COLORS.danger },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255,253,248,0.08)',
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: 'rgba(255,253,248,0.08)',
                    padding: 10,
                  }}
                >
                  <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: 'rgba(255,253,248,0.6)', marginBottom: 2 }}>
                    {stat.label}
                  </Text>
                  <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: stat.color }}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {supplier.notes ? (
          <Card style={{ backgroundColor: '#FFFAEB' }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>
              Notes
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.text.secondary, fontStyle: 'italic' }}>
              "{supplier.notes}"
            </Text>
          </Card>
        ) : null}

        <View>
          <SectionHeader title="Goods Bought" action={{ label: 'Record Goods', onPress: openRecordGoods }} />
          {supplierPurchases.length === 0 ? (
            <Card>
              <Text
                style={{
                  fontFamily: FONT.regular,
                  color: COLORS.text.muted,
                  fontSize: 13,
                  textAlign: 'center',
                  paddingVertical: 12,
                }}
              >
                No goods recorded yet
              </Text>
              <Button
                title="Record Goods Bought"
                icon="plus"
                onPress={openRecordGoods}
                variant="secondary"
                size="sm"
              />
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {supplierPurchases.map((purchase, index) => (
                <View key={purchase.id}>
                  <View style={{ padding: 14, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                          {purchase.purchase_number}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                          {format(new Date(purchase.purchase_date || purchase.created_at), 'MMM d, yyyy')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <PaymentSummary
                          totalAmount={purchase.total_amount}
                          amountPaid={purchase.amount_paid}
                          amountOwed={purchase.amount_owed}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => openEditPurchase(purchase.id)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Edit purchase"
                          >
                            <Feather name="edit-2" size={15} color={COLORS.text.secondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeletePurchase(purchase.id)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Delete purchase"
                          >
                            <Feather name="trash-2" size={15} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    {purchase.discount_amount > 0 ? (
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.danger }}>
                        Discount: -{formatCurrency(purchase.discount_amount)}
                      </Text>
                    ) : null}
                    {(purchase.items ?? []).slice(0, 3).map((item: any) => (
                      <Text key={item.id} style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                        - {item.product?.name ?? 'Item'} x {item.quantity} @ {formatCurrency(item.unit_cost)}
                      </Text>
                    ))}
                    {(purchase.items?.length ?? 0) > 3 ? (
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                        +{(purchase.items?.length ?? 0) - 3} more items
                      </Text>
                    ) : null}
                    {purchase.notes ? (
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary, fontStyle: 'italic' }}>
                        "{purchase.notes}"
                      </Text>
                    ) : null}
                  </View>
                  {index < supplierPurchases.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {supplier && (
        <ConfirmDialog
          visible={showRemoveConfirm}
          title="Remove Supplier"
          message={`Remove ${supplier.name}?`}
          confirmLabel="Remove"
          onConfirm={async () => {
            setShowRemoveConfirm(false);
            await deleteSupplier(supplier.id);
            setSelectedSupplier(null);
            Toast.show({ type: 'success', text1: 'Supplier removed' });
            closeScreen();
          }}
          onCancel={() => setShowRemoveConfirm(false)}
          variant="danger"
        />
      )}

      <ConfirmDialog
        visible={!!purchaseToDelete}
        title="Delete record"
        message="Delete this supplier goods record?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!purchaseToDelete) return;
          const pId = purchaseToDelete;
          setPurchaseToDelete(null);
          try {
            await deletePurchaseRecord(pId);
            await load();
            Toast.show({ type: 'success', text1: 'Goods record deleted' });
          } catch (err: any) {
            Alert.alert('Unable to delete', err.message ?? 'Please try again.');
          }
        }}
        onCancel={() => setPurchaseToDelete(null)}
        variant="danger"
      />
    </ScreenShell>
  );
}
