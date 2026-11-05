import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useBusinessStore } from '@/store/businessStore';
import { Product, Sale } from '@/types';
import { BottomSheetModal, Button, Card, EmptyState, SectionHeader, SmartChip, confirmModal } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { printCounterpartyStatement, shareCounterpartyStatementPDF } from '@/lib/reports';
import { dismissScreen } from '@/lib/navigation';
import { isDebtForgiven } from '@/lib/records';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const getSaleItemsSummary = (sale: Sale, allProducts: Product[]) => {
  if (sale.items && sale.items.length > 0) {
    return sale.items
      .map((item) => {
        const pName =
          item.product?.name ||
          allProducts.find((p) => p.id === item.product_id)?.name ||
          'Item';
        return `${item.quantity !== 1 ? `${item.quantity}x ` : ''}${pName}`;
      })
      .join(', ');
  }
    return sale.notes?.trim() || '1 sale';
};

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{ customerId?: string | string[] }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const { currentBusiness, currentBranch } = useAuthStore();
  const { products } = useBusinessStore();
  const [refreshing, setRefreshing] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPDF, setIsSharingPDF] = useState(false);
  const {
    customers,
    selectedCustomer,
    customerSales,
    customerDebts,
    fetchCustomerDetail,
    deleteCustomer,
    setSelectedCustomer,
  } = useCustomerStore();

  const closeScreen = () => dismissScreen();

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !customerId) return;
    setRefreshing(true);
    try {
      await fetchCustomerDetail(customerId, currentBusiness.id);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness, customerId, fetchCustomerDetail]);

  // Data is hydrated on app boot.

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

  useFocusEffect(
    useCallback(() => {
      if (currentBusiness?.id && customerId) {
        void fetchCustomerDetail(customerId, currentBusiness.id);
      }
    }, [currentBusiness?.id, customerId, fetchCustomerDetail]),
  );

  const handleDelete = async () => {
    if (!customer) return;
    const confirmed = await confirmModal({
      title: 'Remove Customer',
      message: `Are you sure you want to remove ${customer.name} from your customer list?`,
      confirmText: 'Remove',
      type: 'danger',
    });

    if (confirmed) {
      await deleteCustomer(customer.id);
      setSelectedCustomer(null);
      Toast.show({ type: 'success', text1: 'Customer removed' });
      closeScreen();
    }
  };

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

  const openRecordSale = () =>
    router.push({
      pathname: '/(app)/record-sale',
      params: { customerName: customer.name, customerPhone: customer.phone ?? '' },
    });

  const openEditCustomer = () =>
    router.push({ pathname: '/(app)/customer-edit', params: { customerId: customer.id } });

  const openEditSale = (saleId: string) =>
    router.push({ pathname: '/(app)/record-sale', params: { saleId } });

  const activeDebts = customerDebts.filter((debt) => debt.status !== 'settled');
  const customerHasDetails = Boolean(customer.phone || customer.email || customer.address || customer.notes);

  const handlePrintStatement = async () => {
    if (!currentBusiness || isPrinting) return;

    setIsPrinting(true);
    try {
      await printCounterpartyStatement({
        business: currentBusiness,
        branch: currentBranch,
        kind: 'customer',
        counterparty: customer,
        totalTrade: customer.total_spent ?? 0,
        outstandingBalance: customer.outstanding_debt ?? 0,
        items: customerSales.map((sale) => {
          const forgiven = isDebtForgiven(sale.payment_status, sale.notes);
          return {
            reference: sale.sale_number,
            description: forgiven
              ? `${getSaleItemsSummary(sale, products)} (Debt Forgiven)`
              : getSaleItemsSummary(sale, products),
            date: sale.created_at,
            total: sale.total_amount,
            paid: forgiven ? sale.total_amount : sale.amount_paid,
            balance: forgiven ? 0 : sale.amount_owed,
          };
        }),
      });
      setManageSheetVisible(false);
    } catch (err: any) {
      Alert.alert('Unable to print', err?.message ?? 'Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleShareStatement = async () => {
    if (!currentBusiness || isSharingPDF) return;

    setIsSharingPDF(true);
    try {
      await shareCounterpartyStatementPDF({
        business: currentBusiness,
        branch: currentBranch,
        kind: 'customer',
        counterparty: customer,
        totalTrade: customer.total_spent ?? 0,
        outstandingBalance: customer.outstanding_debt ?? 0,
        items: customerSales.map((sale) => {
          const forgiven = isDebtForgiven(sale.payment_status, sale.notes);
          return {
            reference: sale.sale_number,
            description: forgiven
              ? `${getSaleItemsSummary(sale, products)} (Debt Forgiven)`
              : getSaleItemsSummary(sale, products),
            date: sale.created_at,
            total: sale.total_amount,
            paid: forgiven ? sale.total_amount : sale.amount_paid,
            balance: forgiven ? 0 : sale.amount_owed,
          };
        }),
      });
      setManageSheetVisible(false);
    } catch (err: any) {
      Alert.alert('Unable to share PDF', err?.message ?? 'Please try again.');
    } finally {
      setIsSharingPDF(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={customer.name}
        subtitle={`${customerSales.length} recent sale${customerSales.length === 1 ? '' : 's'}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <HeaderAction icon="edit-2" onPress={openEditCustomer} />
            <HeaderAction icon="more-horizontal" onPress={() => setManageSheetVisible(true)} />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        <Card style={{ backgroundColor: COLORS.navy, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}>
              <Feather name="user" size={20} color="#ffffff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: FONT.semiBold, fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', letterSpacing: 0.8, textTransform: 'uppercase' }}>CUSTOMER ACCOUNT</Text>
              <Text style={{ marginTop: 2, fontFamily: FONT.medium, fontSize: 13, color: '#ffffff' }}>
                {customer.total_transactions ?? 0} sale{customer.total_transactions === 1 ? '' : 's'} recorded
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', letterSpacing: 0.8, textTransform: 'uppercase' }}>CURRENT BALANCE</Text>
            <Text style={{ marginTop: 4, fontFamily: FONT.bold, fontSize: 32, color: (customer.outstanding_debt ?? 0) > 0 ? '#ff8585' : '#4ade80' }}>
              {formatCurrency(customer.outstanding_debt ?? 0)}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: FONT.regular, fontSize: 12, color: 'rgba(255, 255, 255, 0.75)' }}>
              {(customer.outstanding_debt ?? 0) > 0 ? 'Outstanding debt from unpaid or partial sales' : 'No outstanding debt. Customer is fully settled.'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={openRecordSale}
            activeOpacity={0.8}
            style={{
              height: 48,
              marginTop: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: RADIUS.lg,
              backgroundColor: COLORS.accent,
            }}
          >
            <Feather name="plus-circle" size={18} color={COLORS.onAccent} />
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 14, color: COLORS.onAccent }}>Record Sale for {customer.name.split(' ')[0]}</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[
              { label: 'TOTAL SPENT', value: formatCurrency(customer.total_spent ?? 0), color: '#4ade80' },
              { label: 'SALES COUNT', value: String(customer.total_transactions ?? 0), color: '#93c5fd' },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, padding: 12, borderWidth: 1, borderRadius: RADIUS.md, borderColor: 'rgba(255, 255, 255, 0.12)', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
                <Text style={{ fontFamily: FONT.semiBold, fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', letterSpacing: 0.5 }}>{stat.label}</Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.bold, fontSize: 15, color: stat.color }} numberOfLines={1}>{stat.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        {customerHasDetails ? (
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>Customer information</Text>
            {[
              customer.phone ? { icon: 'phone' as const, label: customer.phone } : null,
              customer.email ? { icon: 'mail' as const, label: customer.email } : null,
              customer.address ? { icon: 'map-pin' as const, label: customer.address } : null,
            ].filter(Boolean).map((detail) => (
              <View key={detail!.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <Feather name={detail!.icon} size={14} color={COLORS.text.muted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{detail!.label}</Text>
              </View>
            ))}
            {customer.notes ? (
              <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>NOTE</Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary, fontStyle: 'italic' }}>
                  “{customer.notes}”
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {activeDebts.length > 0 ? (
          <View>
            <SectionHeader title={`Outstanding balance (${activeDebts.length})`} />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {activeDebts.map((debt, index) => (
                <View key={debt.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 11 }}>
                    <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FEF3F2' }}>
                      <Feather name="alert-circle" size={17} color={COLORS.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.primary }}>{format(new Date(debt.created_at), 'MMM d, yyyy')}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 11.5, color: debt.due_date ? COLORS.warning : COLORS.text.muted }}>
                        {debt.due_date ? `Due ${format(new Date(debt.due_date), 'MMM d, yyyy')}` : debt.status === 'partial' ? 'Partially paid' : 'Payment outstanding'}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 15, color: COLORS.danger }}>{formatCurrency(debt.balance)}</Text>
                  </View>
                  {index < activeDebts.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 14, backgroundColor: COLORS.borderSubtle }} /> : null}
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title={`Recent sales (${customerSales.length})`} action={{ label: 'Record sale', onPress: openRecordSale }} />
          {customerSales.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.surface2 }}>
                <Feather name="shopping-bag" size={18} color={COLORS.text.muted} />
              </View>
              <Text style={{ marginTop: 10, fontFamily: FONT.medium, color: COLORS.text.primary, fontSize: 13 }}>No sales recorded yet</Text>
              <Text style={{ marginTop: 3, fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 12, textAlign: 'center' }}>Record a sale to keep this customer’s balance and history up to date.</Text>
              <Button title="Record sale" icon="plus" onPress={openRecordSale} variant="secondary" size="sm" style={{ marginTop: 14 }} />
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {customerSales.map((sale, index) => (
                <View key={sale.id}>
                  <TouchableOpacity onPress={() => openEditSale(sale.id)} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 11 }}>
                    <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.navyLight }}>
                      <Feather name="shopping-bag" size={16} color={COLORS.ink} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{getSaleItemsSummary(sale, products)}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.text.muted }} numberOfLines={1}>
                        {sale.sale_number} · {format(new Date(sale.created_at), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={{ fontSize: 14.5, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{formatCurrency(sale.total_amount)}</Text>
                      {sale.amount_owed > 0 && !isDebtForgiven(sale.payment_status, sale.notes) ? (
                        <SmartChip label={`Owes ${formatCurrency(sale.amount_owed)}`} deep variant="danger" size="xs" />
                      ) : isDebtForgiven(sale.payment_status, sale.notes) ? (
                        <SmartChip label="Debt Forgiven" deep variant="neutral" size="xs" />
                      ) : (
                        <SmartChip label="Paid" deep variant="success" size="xs" />
                      )}
                    </View>
                  </TouchableOpacity>
                  {index < customerSales.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 14, backgroundColor: COLORS.borderSubtle }} /> : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <BottomSheetModal
        visible={manageSheetVisible}
        onClose={() => setManageSheetVisible(false)}
        title="Manage customer"
        subtitle={customer.name}
      >
        <TouchableOpacity
          onPress={handlePrintStatement}
          disabled={isPrinting}
          activeOpacity={0.8}
          style={{ minHeight: 50, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, opacity: isPrinting ? 0.55 : 1 }}
        >
          <Feather name="printer" size={16} color={COLORS.navy} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>{isPrinting ? 'Preparing statement…' : 'Print customer statement'}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Balance and recent sales records</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleShareStatement}
          disabled={isSharingPDF}
          activeOpacity={0.8}
          style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, opacity: isSharingPDF ? 0.55 : 1 }}
        >
          <Feather name="share-2" size={16} color={COLORS.navy} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>{isSharingPDF ? 'Preparing PDF…' : 'Share as PDF'}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Save statement to device</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setManageSheetVisible(false);
            openEditCustomer();
          }}
          activeOpacity={0.8}
          style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card }}
        >
          <Feather name="edit-2" size={16} color={COLORS.text.secondary} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>Edit customer details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            setManageSheetVisible(false);
            await handleDelete();
          }}
          activeOpacity={0.8}
          style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: '#F5C2BA', backgroundColor: '#FEF3F2' }}
        >
          <Feather name="trash-2" size={16} color={COLORS.danger} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.danger }}>Remove customer</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setManageSheetVisible(false)} activeOpacity={0.8} style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.secondary }}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheetModal>
    </ScreenShell>
  );
}
