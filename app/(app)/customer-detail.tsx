import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useBusinessStore } from '@/store/businessStore';
import { Product, Sale } from '@/types';
import { Button, Card, EmptyState, SectionHeader, confirmModal } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { printCounterpartyStatement, shareCounterpartyStatementPDF } from '@/lib/reports';
import { dismissScreen } from '@/lib/navigation';

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
        items: customerSales.map((sale) => ({
          reference: sale.sale_number,
          description: getSaleItemsSummary(sale, products),
          date: sale.created_at,
          total: sale.total_amount,
          paid: sale.amount_paid,
          balance: sale.amount_owed,
        })),
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
        items: customerSales.map((sale) => ({
          reference: sale.sale_number,
          description: getSaleItemsSummary(sale, products),
          date: sale.created_at,
          total: sale.total_amount,
          paid: sale.amount_paid,
          balance: sale.amount_owed,
        })),
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
        <Card style={{ backgroundColor: COLORS.ink, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,253,248,0.1)' }}>
              <Feather name="user" size={20} color={COLORS.successLight} />
            </View>
            <View style={{ flex: 1, marginLeft: 11 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: 'rgba(255,253,248,0.6)', letterSpacing: 0.7 }}>CUSTOMER ACCOUNT</Text>
              <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 13, color: 'rgba(255,253,248,0.82)' }}>
                {customer.total_transactions ?? 0} sale{customer.total_transactions === 1 ? '' : 's'} recorded
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: 'rgba(255,253,248,0.6)', letterSpacing: 0.7 }}>CURRENT BALANCE</Text>
            <Text style={{ marginTop: 5, fontFamily: FONT.bold, fontSize: 28, color: (customer.outstanding_debt ?? 0) > 0 ? '#FECACA' : COLORS.successLight }}>
              {formatCurrency(customer.outstanding_debt ?? 0)}
            </Text>
            <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 12, color: 'rgba(255,253,248,0.72)' }}>
              {(customer.outstanding_debt ?? 0) > 0 ? 'Outstanding from recorded sales' : 'No outstanding balance for this customer'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={openRecordSale}
            activeOpacity={0.82}
            style={{ minHeight: 46, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.accent }}
          >
            <Feather name="plus" size={17} color="#FFFFFF" />
            <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: '#FFFFFF' }}>Record sale</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[
              { label: 'TOTAL SPENT', value: formatCurrency(customer.total_spent ?? 0), color: COLORS.successLight },
              { label: 'SALES RECORDS', value: String(customer.total_transactions ?? 0), color: COLORS.infoLight },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, padding: 10, borderWidth: 1, borderRadius: RADIUS.md, borderColor: 'rgba(255,253,248,0.1)', backgroundColor: 'rgba(255,253,248,0.06)' }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 9.5, color: 'rgba(255,253,248,0.58)', letterSpacing: 0.45 }}>{stat.label}</Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.bold, fontSize: 14, color: stat.color }} numberOfLines={1}>{stat.value}</Text>
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
                  {index < activeDebts.length - 1 ? <View style={{ height: 1, marginHorizontal: 14, backgroundColor: COLORS.border }} /> : null}
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
                    <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: `${COLORS.success}14` }}>
                      <Feather name="shopping-bag" size={17} color={COLORS.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{getSaleItemsSummary(sale, products)}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.text.muted }} numberOfLines={1}>
                        {sale.sale_number} · {format(new Date(sale.created_at), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', maxWidth: 102 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{formatCurrency(sale.total_amount)}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.medium, fontSize: 11, color: sale.amount_owed > 0 ? COLORS.danger : COLORS.success }} numberOfLines={1}>
                        {sale.amount_owed > 0 ? `Owes ${formatCurrency(sale.amount_owed)}` : 'Paid'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {index < customerSales.length - 1 ? <View style={{ height: 1, marginHorizontal: 14, backgroundColor: COLORS.border }} /> : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal
        visible={manageSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManageSheetVisible(false)}
      >
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,33,28,0.48)' }} onPress={() => setManageSheetVisible(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface }}>
            <View style={{ width: 38, height: 4, alignSelf: 'center', borderRadius: 4, backgroundColor: COLORS.borderDark }} />
            <Text style={{ marginTop: 18, fontFamily: FONT.bold, fontSize: 17, color: COLORS.text.primary }}>Manage customer</Text>
            <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>{customer.name}</Text>

            <TouchableOpacity
              onPress={handlePrintStatement}
              disabled={isPrinting}
              activeOpacity={0.8}
              style={{ minHeight: 50, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, opacity: isPrinting ? 0.55 : 1 }}
            >
              <Feather name="printer" size={16} color={COLORS.accent} />
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
              <Feather name="share-2" size={16} color={COLORS.accent} />
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

            <TouchableOpacity onPress={() => setManageSheetVisible(false)} activeOpacity={0.8} style={{ alignItems: 'center', paddingVertical: 15 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.secondary }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
