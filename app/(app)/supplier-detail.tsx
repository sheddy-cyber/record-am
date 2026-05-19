import React, { useEffect, useMemo } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Badge, Button, Card, EmptyState, LoadingScreen, PaymentSummary, SectionHeader } from '@/components/ui';
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
    supplierDebts,
    isLoading,
    fetchSuppliers,
    fetchSupplierDetail,
    deleteSupplier,
    setSelectedSupplier,
  } = useSupplierStore();

  const closeScreen = () => router.back();

  useEffect(() => {
    if (currentBusiness && !suppliers.length) {
      fetchSuppliers(currentBusiness.id);
    }
  }, [currentBusiness, fetchSuppliers, suppliers.length]);

  const supplier = useMemo(() => {
    if (selectedSupplier?.id === supplierId) return selectedSupplier;
    return suppliers.find((item) => item.id === supplierId) ?? null;
  }, [selectedSupplier, supplierId, suppliers]);

  useEffect(() => {
    if (supplier) {
      setSelectedSupplier(supplier);
    }
  }, [setSelectedSupplier, supplier]);

  useEffect(() => {
    if (currentBusiness && supplierId) {
      fetchSupplierDetail(supplierId, currentBusiness.id);
    }
  }, [currentBusiness, fetchSupplierDetail, supplierId]);

  const handleDelete = () => {
    if (!supplier) return;

    Alert.alert('Remove Supplier', `Remove ${supplier.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteSupplier(supplier.id);
          setSelectedSupplier(null);
          Toast.show({ type: 'success', text1: 'Supplier removed' });
          closeScreen();
        },
      },
    ]);
  };

  if (isLoading && !supplier) {
    return <LoadingScreen message="Loading supplier..." />;
  }

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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Edit"
            icon="edit-2"
            onPress={() => router.push({ pathname: '/(app)/supplier-edit', params: { supplierId: supplier.id } })}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
          />
          <Button
            title="Remove"
            icon="trash-2"
            onPress={handleDelete}
            variant="danger"
            size="sm"
            style={{ flex: 1 }}
          />
        </View>

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

        {supplierDebts.filter((debt) => debt.status !== 'settled').length > 0 ? (
          <View>
            <SectionHeader title="What We Owe" />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {supplierDebts
                .filter((debt) => debt.status !== 'settled')
                .map((debt, index, list) => (
                  <View key={debt.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted }}>
                          {format(new Date(debt.created_at), 'MMM d, yyyy')}
                        </Text>
                        {debt.due_date ? (
                          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.warning }}>
                            Due: {format(new Date(debt.due_date), 'MMM d')}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger }}>
                          {formatCurrency(debt.balance)}
                        </Text>
                        <Badge
                          label={debt.status === 'partial' ? 'Partial' : 'Outstanding'}
                          variant={debt.status === 'partial' ? 'warning' : 'danger'}
                        />
                      </View>
                    </View>
                    {index < list.length - 1 ? (
                      <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} />
                    ) : null}
                  </View>
                ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Purchase History" />
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
                No purchases recorded yet
              </Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {supplierPurchases.map((purchase, index) => (
                <View key={purchase.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                        {purchase.purchase_number}
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                        {format(new Date(purchase.created_at), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    <PaymentSummary
                      totalAmount={purchase.total_amount}
                      amountPaid={purchase.amount_paid}
                      amountOwed={purchase.amount_owed}
                    />
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
    </ScreenShell>
  );
}
