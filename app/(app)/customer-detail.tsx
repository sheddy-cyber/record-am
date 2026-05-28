import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { Badge, Button, Card, ConfirmDialog, EmptyState, LoadingScreen, PaymentSummary, SectionHeader } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{ customerId?: string | string[] }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const { currentBusiness } = useAuthStore();
  const {
    customers,
    selectedCustomer,
    customerSales,
    customerDebts,
    isLoading,
    fetchCustomers,
    fetchCustomerDetail,
    deleteCustomer,
    setSelectedCustomer,
  } = useCustomerStore();

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const closeScreen = () => router.back();

  useEffect(() => {
    if (currentBusiness && !customers.length) {
      fetchCustomers(currentBusiness.id);
    }
  }, [currentBusiness, customers.length, fetchCustomers]);

  const customer = useMemo(() => {
    if (selectedCustomer?.id === customerId) return selectedCustomer;
    return customers.find((item) => item.id === customerId) ?? null;
  }, [customerId, customers, selectedCustomer]);

  useEffect(() => {
    if (customer) {
      setSelectedCustomer(customer);
    }
  }, [customer, setSelectedCustomer]);

  useEffect(() => {
    if (currentBusiness && customerId) {
      fetchCustomerDetail(customerId, currentBusiness.id);
    }
  }, [currentBusiness, customerId, fetchCustomerDetail]);

  const handleDelete = () => {
    if (!customer) return;
    setShowRemoveConfirm(true);
  };

  if (isLoading && !customer) {
    return <LoadingScreen message="Loading customer..." />;
  }

  if (!customer) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Customer Details"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="user"
          title="Customer not found"
          description="This customer record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={customer.name}
        subtitle="Customer details"
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Card style={{ backgroundColor: COLORS.ink }}>
          <View style={{ gap: 10 }}>
            {customer.phone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="phone" size={14} color="rgba(255,253,248,0.8)" />
                <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: 'rgba(255,253,248,0.8)' }}>
                  {customer.phone}
                </Text>
              </View>
            ) : null}
            {customer.email ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="mail" size={14} color="rgba(255,253,248,0.8)" />
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: 'rgba(255,253,248,0.68)' }}>
                  {customer.email}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {[
                { label: 'Total Spent', value: formatCurrency(customer.total_spent ?? 0), color: COLORS.successLight },
                { label: 'Purchases', value: String(customer.total_transactions ?? 0), color: COLORS.infoLight },
                { label: 'Owes', value: formatCurrency(customer.outstanding_debt ?? 0), color: COLORS.danger },
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
                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 10,
                      color: 'rgba(255,253,248,0.6)',
                      marginBottom: 2,
                    }}
                  >
                    {stat.label}
                  </Text>
                  <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: stat.color }}>
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Edit"
            icon="edit-2"
            onPress={() => router.push({ pathname: '/(app)/customer-edit', params: { customerId: customer.id } })}
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

        {customer.address ? (
          <Card>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 8 }}>
              Address
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Feather name="map-pin" size={14} color={COLORS.text.muted} style={{ marginTop: 2 }} />
              <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.text.primary, flex: 1 }}>
                {customer.address}
              </Text>
            </View>
          </Card>
        ) : null}

        {customer.notes ? (
          <Card style={{ backgroundColor: '#FFFAEB' }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>
              Notes
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.text.secondary, fontStyle: 'italic' }}>
              "{customer.notes}"
            </Text>
          </Card>
        ) : null}

        {customerDebts.filter((debt) => debt.status !== 'settled').length > 0 ? (
          <View>
            <SectionHeader title="Outstanding Debts" />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {customerDebts
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
                      <View style={{ alignItems: 'flex-end' }}>
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
          {customerSales.length === 0 ? (
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
                No purchases yet
              </Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {customerSales.map((sale, index) => (
                <View key={sale.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                        {sale.sale_number}
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                        {format(new Date(sale.created_at), 'MMM d, yyyy \u00B7 h:mm a')}
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary, marginTop: 1 }}>
                        {sale.payment_method.toUpperCase()}
                      </Text>
                    </View>
                    <PaymentSummary
                      totalAmount={sale.total_amount}
                      amountPaid={sale.amount_paid}
                      amountOwed={sale.amount_owed}
                    />
                  </View>
                  {index < customerSales.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {customer && (
        <ConfirmDialog
          visible={showRemoveConfirm}
          title="Remove Customer"
          message={`Remove ${customer.name} from your customer list?`}
          confirmLabel="Remove"
          onConfirm={async () => {
            setShowRemoveConfirm(false);
            await deleteCustomer(customer.id);
            setSelectedCustomer(null);
            Toast.show({ type: 'success', text1: 'Customer removed' });
            closeScreen();
          }}
          onCancel={() => setShowRemoveConfirm(false)}
          variant="danger"
        />
      )}
    </ScreenShell>
  );
}
