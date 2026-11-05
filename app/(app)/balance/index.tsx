import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { addDays, format, subDays } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { shareDailyReport, shareStaffShiftReport } from '@/lib/reports';
import { Badge, Button, Card, EmptyState, SectionHeader } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { canViewFinancialData } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';

const formatCurrency = (value: number) => {
  const isNegative = value < 0;
  return `${isNegative ? '-' : ''}${CURRENCY_SYMBOL}${Math.abs(value).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
};

export default function DailyBalanceScreen() {
  const { currentBusiness, currentBranch, userRole, profile, user } = useAuthStore();
  const canViewFinancials = canViewFinancialData(userRole);

  // If user can view financials (owner/manager), they can toggle between owner view and staff view
  const [viewMode, setViewMode] = useState<'owner' | 'staff'>(canViewFinancials ? 'owner' : 'staff');
  const [staffTab, setStaffTab] = useState<'all' | 'sales' | 'repayments'>('all');
  const [showPicker, setShowPicker] = useState(false);
  const touchStartX = useRef(0);

  // Synchronize view mode if permissions change
  useEffect(() => {
    if (!canViewFinancials) {
      setViewMode('staff');
    }
  }, [canViewFinancials]);

  const {
    summary,
    entries,
    digitalInflows,
    isLoading,
    isSaving,
    selectedDate,
    setSelectedDate,
    fetchDailyBalance,
    reopenDay,
  } = useDailyBalanceStore();

  const load = useCallback(() => {
    if (currentBusiness && currentBranch) {
      fetchDailyBalance(currentBusiness.id, currentBranch.id, selectedDate);
    }
  }, [currentBranch, currentBusiness, fetchDailyBalance, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh({
    channelName: `daily-balance-${currentBranch?.id ?? 'unknown'}-${selectedDate}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id, selectedDate],
    tables: [
      ...(currentBranch ? [{ table: 'sales', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(canViewFinancials && currentBranch ? [{ table: 'expenses', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'customer_debts', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      { table: 'debt_repayments' },
    ],
    onRefresh: load,
  });

  const changeDate = (direction: 1 | -1) => {
    const current = new Date(selectedDate);
    const next = direction === 1 ? addDays(current, 1) : subDays(current, 1);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const nextStr = format(next, 'yyyy-MM-dd');
    if (nextStr > todayStr) return;
    setSelectedDate(nextStr);
  };

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

  const handleReopenDay = () => {
    if (!currentBusiness || !currentBranch || !summary?.is_closed) return;
    Alert.alert(
      'Reopen Day',
      `Are you sure you want to reopen the balance for ${format(new Date(selectedDate), 'MMM d, yyyy')}? This will unlock editing for that day.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen Day',
          style: 'destructive',
          onPress: async () => {
            const success = await reopenDay(currentBusiness.id, currentBranch.id);
            if (!success) {
              Alert.alert('Error', 'Failed to reopen the balance. Please try again.');
            }
          },
        },
      ]
    );
  };

  const discrepancy = summary ? (summary.cash_in_hand_actual ?? 0) - summary.cash_in_hand_expected : 0;
  const isClosed = summary?.is_closed ?? false;

  const salesEntries = entries.filter((entry) => entry.type === 'sale');
  const expenseEntries = entries.filter((entry) => entry.type === 'expense');
  const repaymentEntries = entries.filter((entry) => entry.type === 'debt_repayment');

  const repaymentTotal = repaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalRevenue = (summary?.total_sales ?? 0) + repaymentTotal;
  const entryDiscounts = salesEntries.reduce((sum, entry) => sum + Number(entry.discount_amount ?? 0), 0);
  const totalDiscounts = Math.max(summary?.total_discounts ?? 0, entryDiscounts);
  const discountedSalesCount = salesEntries.filter((entry) => Number(entry.discount_amount ?? 0) > 0).length;

  // Cash collections
  const totalCashSales = salesEntries.reduce((sum, e) => {
    if (e.payment_method === 'cash') return sum + e.amount;
    if (e.payment_method === 'mixed') return sum + (e.cash_amount ?? 0);
    return sum;
  }, 0);
  const totalCashRepayments = repaymentEntries.reduce((sum, e) => {
    if (e.payment_method === 'cash') return sum + e.amount;
    if (e.payment_method === 'mixed') return sum + (e.cash_amount ?? 0);
    return sum;
  }, 0);
  const totalCashInTill = totalCashSales + totalCashRepayments;

  const totalDigital = digitalInflows?.totalDigital ?? 0;
  const totalTransfer = digitalInflows?.totalTransfer ?? 0;
  const totalPos = digitalInflows?.totalPos ?? 0;

  // Staff activity entries (Sales & Repayments only; NO expenses!)
  const staffEntries = entries.filter((e) => e.type === 'sale' || e.type === 'debt_repayment');
  const filteredStaffEntries =
    staffTab === 'sales'
      ? salesEntries
      : staffTab === 'repayments'
      ? repaymentEntries
      : staffEntries;

  const handleShareStaffSummary = async () => {
    if (!currentBusiness || !currentBranch) return;
    try {
      await shareStaffShiftReport({
        date: selectedDate,
        business: currentBusiness,
        branch: currentBranch,
        staffName: profile?.full_name || user?.user_metadata?.full_name || user?.email || undefined,
        totalSales: totalRevenue,
        totalCash: totalCashInTill,
        totalTransfer,
        totalPos,
        totalDiscounts,
        totalTransactions: staffEntries.length,
        digitalBreakdown: digitalInflows
          ? {
              byBank: digitalInflows.byBank,
              byPos: digitalInflows.byPos,
            }
          : undefined,
        isClosed,
      });
    } catch (err: any) {
      console.error('[staffShiftReport]', err);
      Alert.alert('Report Error', 'Failed to generate staff shift summary. Please try again.');
    }
  };

  const handleShareOwnerReport = () => {
    if (!currentBusiness || !currentBranch || !summary) return;
    shareDailyReport({
      date: selectedDate,
      business: currentBusiness,
      branch: currentBranch,
      totalSales: totalRevenue,
      totalDiscounts,
      totalExpenses: summary.total_expenses,
      grossProfit: summary.gross_profit,
      netProfit: summary.net_profit,
      totalTransactions: salesEntries.length + repaymentEntries.length,
      cashExpected: summary.cash_in_hand_expected,
      cashActual: summary.cash_in_hand_actual,
      topProducts: [],
      salesByMethod: Object.entries(
        [...salesEntries, ...repaymentEntries].reduce((acc: Record<string, number>, entry) => {
          if (entry.payment_method === 'mixed') {
            const cash = entry.cash_amount ?? 0;
            const transfer = entry.transfer_amount ?? Math.max(0, entry.amount - cash);
            acc['cash'] = (acc['cash'] || 0) + cash;
            acc['transfer'] = (acc['transfer'] || 0) + transfer;
          } else {
            acc[entry.payment_method] = (acc[entry.payment_method] || 0) + entry.amount;
          }
          return acc;
        }, {})
      ).map(([method, amount]) => ({ method, amount })),
      isClosed: summary.is_closed,
    });
  };

  const discrepancyTone =
    discrepancy === 0 ? COLORS.success : discrepancy > 0 ? COLORS.ink : COLORS.danger;
  const discrepancyBg =
    discrepancy === 0 ? '#ECFDF3' : discrepancy > 0 ? '#EEF4FF' : '#FEF3F2';
  const discrepancyBorder =
    discrepancy === 0 ? '#BFD9CA' : discrepancy > 0 ? '#B7CADB' : '#DDAEA6';

  const isStaffView = viewMode === 'staff';

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={isStaffView && !canViewFinancials ? 'Daily Balance' : 'Daily Balance'}
          subtitle={format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
          right={
            isClosed ? (
              <Badge label="Day Closed" variant="success" />
            ) : (
              <Badge label="Register Active" variant="info" />
            )
          }
        />

        <View style={{ backgroundColor: COLORS.ink, paddingHorizontal: 20, paddingBottom: 16 }}>
          {/* Owner view mode toggle: lets management switch to preview staff register view */}
          {canViewFinancials ? (
            <View style={styles.modeToggleContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setViewMode('owner')}
                style={[styles.modeToggleBtn, viewMode === 'owner' && styles.modeToggleBtnActive]}
              >
                <Feather
                  name="shield"
                  size={12}
                  color={viewMode === 'owner' ? COLORS.ink : 'rgba(255, 255, 255, 0.75)'}
                />
                <Text
                  style={[
                    styles.modeToggleText,
                    viewMode === 'owner' && styles.modeToggleTextActive,
                  ]}
                >
                  Management View
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setViewMode('staff')}
                style={[styles.modeToggleBtn, viewMode === 'staff' && styles.modeToggleBtnActive]}
              >
                <Feather
                  name="user-check"
                  size={12}
                  color={viewMode === 'staff' ? COLORS.ink : 'rgba(255, 255, 255, 0.75)'}
                />
                <Text
                  style={[
                    styles.modeToggleText,
                    viewMode === 'staff' && styles.modeToggleTextActive,
                  ]}
                >
                  Staff Shift View
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Date Selector Bar */}
          <View
            onTouchStart={(e) => {
              touchStartX.current = e.nativeEvent.pageX;
            }}
            onTouchEnd={(e) => {
              const distance = touchStartX.current - e.nativeEvent.pageX;
              if (distance > 50) {
                changeDate(1);
              } else if (distance < -50) {
                changeDate(-1);
              }
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: RADIUS.lg,
              borderColor: 'rgba(255, 255, 255, 0.14)',
              padding: 10,
            }}
          >
            <TouchableOpacity
              onPress={() => changeDate(-1)}
              activeOpacity={0.7}
              style={{
                width: 38,
                height: 38,
                borderRadius: RADIUS.full,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-left" size={18} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: 2, paddingHorizontal: 12 }}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#ffffff', fontFamily: FONT.bold, fontSize: 16 }}>
                  {format(new Date(selectedDate), 'EEEE')}
                </Text>
                <Feather name="calendar" size={13} color="rgba(255, 255, 255, 0.7)" />
              </View>
              <Text
                style={{
                  fontFamily: FONT.medium,
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {format(new Date(selectedDate), 'MMMM d, yyyy')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => changeDate(1)}
              activeOpacity={0.7}
              style={{
                width: 38,
                height: 38,
                borderRadius: RADIUS.full,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isToday ? 0.3 : 1,
              }}
              disabled={isToday}
            >
              <Feather name="chevron-right" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={COLORS.ink} />}
          showsVerticalScrollIndicator={false}
        >
          {isStaffView ? (
            /* ========================================================================= */
            /* STAFF SHIFT VIEW (No Profit, No Expenses, No Cost Prices, Register-Centric) */
            /* ========================================================================= */
            <View style={{ padding: 20, gap: 18 }}>
              {/* Register Status Banner */}
              <Card
                style={{
                  backgroundColor: isClosed ? '#ECFDF3' : '#F0F9FF',
                  borderColor: isClosed ? '#BFD9CA' : '#BAE6FD',
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isClosed ? '#D1FAE5' : '#E0F2FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather
                      name={isClosed ? 'check-circle' : 'clock'}
                      size={18}
                      color={isClosed ? COLORS.success : COLORS.navy}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.text.primary }}>
                      {isClosed ? 'Register Closed by Management' : 'Register Active'}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 12,
                        color: COLORS.text.secondary,
                        marginTop: 2,
                        lineHeight: 16,
                      }}
                    >
                      {isClosed
                        ? 'This day has been officially audited and balanced by management.'
                        : 'Cash in drawer and digital collections update in real time as sales and debt collections occur.'}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* 4 Register Metric Cards */}
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Card style={{ flex: 1, padding: 14 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Total Collections
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.accentDark }}>
                      {formatCurrency(totalRevenue)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      {staffEntries.length} transaction{staffEntries.length === 1 ? '' : 's'}
                    </Text>
                  </Card>

                  <Card style={{ flex: 1, padding: 14 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Cash in Drawer
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.success }}>
                      {formatCurrency(totalCashInTill)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      physical till cash
                    </Text>
                  </Card>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Card style={{ flex: 1, padding: 14 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Digital Collections
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.navy }}>
                      {formatCurrency(totalDigital)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      transfers & POS cards
                    </Text>
                  </Card>

                  <Card style={{ flex: 1, padding: 14 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Discounts Given
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {formatCurrency(totalDiscounts)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      {discountedSalesCount} discounted sale{discountedSalesCount === 1 ? '' : 's'}
                    </Text>
                  </Card>
                </View>
              </View>

              {/* Physical Cash in Drawer Breakdown Card */}
              <Card style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: '#ECFDF5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="inbox" size={16} color={COLORS.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.text.primary }}>
                      Physical Cash Breakdown
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>
                      Physical currency in drawer to be handed over
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>
                      Cash from Direct Sales
                    </Text>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.primary }}>
                      {formatCurrency(totalCashSales)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>
                      Cash from Debt Repayments
                    </Text>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.primary }}>
                      {formatCurrency(totalCashRepayments)}
                    </Text>
                  </View>

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: 4 }} />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.text.primary }}>
                      Total Cash in Drawer
                    </Text>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.success }}>
                      {formatCurrency(totalCashInTill)}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 14,
                    padding: 10,
                    backgroundColor: COLORS.surface2,
                    borderRadius: RADIUS.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Feather name="info" size={13} color={COLORS.text.muted} />
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.secondary, flex: 1 }}>
                    Count physical notes and coins in the register. Your physical cash must match this total at shift handover.
                  </Text>
                </View>
              </Card>

              {/* Digital Collections Breakdown Card */}
              {Boolean(digitalInflows && digitalInflows.totalDigital > 0) ? (
                <Card style={{ padding: 14 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: COLORS.infoLight,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="globe" size={16} color={COLORS.navy} />
                      </View>
                      <View>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>
                          Digital & Bank Inflows
                        </Text>
                        <Text
                          style={{
                            fontSize: 18,
                            fontFamily: FONT.bold,
                            color: COLORS.text.primary,
                            marginTop: 1,
                          }}
                        >
                          {formatCurrency(digitalInflows!.totalDigital)}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        backgroundColor: COLORS.infoLight,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.full,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.navy }}>
                        {digitalInflows!.byBank.length + digitalInflows!.byPos.length} channel
                        {digitalInflows!.byBank.length + digitalInflows!.byPos.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>

                  {digitalInflows!.byBank.length > 0 ? (
                    <View style={{ marginBottom: digitalInflows!.byPos.length > 0 ? 10 : 0 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.bold,
                          color: COLORS.text.secondary,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 6,
                        }}
                      >
                        Bank Transfers ({formatCurrency(digitalInflows!.totalTransfer)})
                      </Text>
                      <View style={{ gap: 6 }}>
                        {digitalInflows!.byBank.map((item) => (
                          <View
                            key={item.bankName}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              backgroundColor: COLORS.surface,
                              borderRadius: RADIUS.sm,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Feather name="send" size={12} color={COLORS.navy} />
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontFamily: FONT.medium,
                                  color: COLORS.text.primary,
                                }}
                              >
                                {item.bankName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontFamily: FONT.regular,
                                  color: COLORS.text.muted,
                                }}
                              >
                                ({item.count} payment{item.count === 1 ? '' : 's'})
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 13,
                                fontFamily: FONT.bold,
                                color: COLORS.text.primary,
                              }}
                            >
                              {formatCurrency(item.total)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {digitalInflows!.byPos.length > 0 ? (
                    <View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.bold,
                          color: COLORS.accentDark,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 6,
                        }}
                      >
                        POS / Card Payments ({formatCurrency(digitalInflows!.totalPos)})
                      </Text>
                      <View style={{ gap: 6 }}>
                        {digitalInflows!.byPos.map((item) => (
                          <View
                            key={item.bankName}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              backgroundColor: COLORS.surface,
                              borderRadius: RADIUS.sm,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Feather name="credit-card" size={12} color={COLORS.accentDark} />
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontFamily: FONT.medium,
                                  color: COLORS.text.primary,
                                }}
                              >
                                {item.bankName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontFamily: FONT.regular,
                                  color: COLORS.text.muted,
                                }}
                              >
                                ({item.count} payment{item.count === 1 ? '' : 's'})
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 13,
                                fontFamily: FONT.bold,
                                color: COLORS.text.primary,
                              }}
                            >
                              {formatCurrency(item.total)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {/* Shift Activity Section with Filter Tabs */}
              <View>
                <SectionHeader title="Shift Collections Log" />

                {/* Filter Tabs */}
                <View style={styles.filterTabsContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setStaffTab('all')}
                    style={[styles.filterTab, staffTab === 'all' && styles.filterTabActive]}
                  >
                    <Text style={[styles.filterTabText, staffTab === 'all' && styles.filterTabTextActive]}>
                      All ({staffEntries.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setStaffTab('sales')}
                    style={[styles.filterTab, staffTab === 'sales' && styles.filterTabActive]}
                  >
                    <Text style={[styles.filterTabText, staffTab === 'sales' && styles.filterTabTextActive]}>
                      Sales ({salesEntries.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setStaffTab('repayments')}
                    style={[styles.filterTab, staffTab === 'repayments' && styles.filterTabActive]}
                  >
                    <Text style={[styles.filterTabText, staffTab === 'repayments' && styles.filterTabTextActive]}>
                      Debt Collections ({repaymentEntries.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Activity List */}
                {filteredStaffEntries.length > 0 ? (
                  <Card style={{ padding: 0, overflow: 'hidden', marginTop: 10 }}>
                    {filteredStaffEntries.map((entry, index) => (
                      <View key={entry.id}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 14,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                                {entry.description}
                              </Text>
                              {Boolean(entry.discount_amount && entry.discount_amount > 0) && (
                                <View
                                  style={{
                                    backgroundColor: COLORS.warningLight,
                                    paddingHorizontal: 6,
                                    paddingVertical: 1,
                                    borderRadius: RADIUS.xs,
                                  }}
                                >
                                  <Text style={{ fontSize: 10, fontFamily: FONT.bold, color: COLORS.accentDark }}>
                                    -{formatCurrency(entry.discount_amount!)} OFF
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 12,
                                color: COLORS.text.muted,
                                marginTop: 2,
                              }}
                            >
                              {format(new Date(entry.time), 'h:mm a')}
                              {' \u00B7 '}
                              {entry.payment_method === 'mixed' && entry.cash_amount != null
                                ? `MIXED (${formatCurrency(entry.cash_amount)} Cash · ${formatCurrency(entry.transfer_amount ?? 0)} Transfer${entry.bank_name ? ` [${entry.bank_name}]` : ''})`
                                : entry.bank_name
                                ? `${entry.payment_method.toUpperCase()} \u00B7 ${entry.bank_name}`
                                : entry.payment_method.toUpperCase()}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: FONT.bold,
                              color: entry.type === 'sale' ? COLORS.success : COLORS.accentDark,
                            }}
                          >
                            +{formatCurrency(entry.amount)}
                          </Text>
                        </View>
                        {index < filteredStaffEntries.length - 1 ? (
                          <View
                            style={{
                              height: StyleSheet.hairlineWidth,
                              backgroundColor: COLORS.borderSubtle,
                              marginHorizontal: 14,
                            }}
                          />
                        ) : null}
                      </View>
                    ))}
                  </Card>
                ) : (
                  <EmptyState
                    icon="inbox"
                    title="No transactions yet"
                    description={
                      staffTab === 'sales'
                        ? 'No sales have been recorded for this day.'
                        : staffTab === 'repayments'
                        ? 'No debt payments have been collected for this day.'
                        : 'No sales or debt collections have been recorded for this day.'
                    }
                  />
                )}
              </View>

              {/* Day Closing Notes from Management */}
              {isClosed && summary?.notes ? (
                <Card style={{ backgroundColor: '#F9FAFB' }}>
                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 12,
                      color: COLORS.text.muted,
                      marginBottom: 4,
                    }}
                  >
                    Management Closing Notes
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 14,
                      color: COLORS.text.secondary,
                      fontStyle: 'italic',
                    }}
                  >
                    "{summary.notes}"
                  </Text>
                </Card>
              ) : null}

              {/* Shift Handover Actions */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <Button
                  title="Share Shift Summary"
                  icon="share-2"
                  onPress={handleShareStaffSummary}
                  size="lg"
                  variant="primary"
                />
                <Text
                  style={{
                    fontFamily: FONT.regular,
                    fontSize: 12,
                    color: COLORS.text.muted,
                    textAlign: 'center',
                    paddingHorizontal: 16,
                  }}
                >
                  Share this verified register shift summary with the business owner or shift manager.
                </Text>
              </View>

              <View style={{ height: 20 }} />
            </View>
          ) : (
            /* ========================================================================= */
            /* OWNER / MANAGEMENT VIEW (Full Financial Reconciliation, Net Profit, P&L)   */
            /* ========================================================================= */
            <View style={{ padding: 20, gap: 20 }}>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Card style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Total Revenue
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.accentDark }}>
                      {formatCurrency(totalRevenue)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      {salesEntries.length + repaymentEntries.length} revenue entr
                      {salesEntries.length + repaymentEntries.length === 1 ? 'y' : 'ies'}
                    </Text>
                  </Card>
                  <Card style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Total Expenses
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.danger }}>
                      {formatCurrency(summary?.total_expenses ?? 0)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      {expenseEntries.length} item{expenseEntries.length !== 1 ? 's' : ''}
                    </Text>
                  </Card>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Card style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Net Profit
                    </Text>
                    <Text
                      style={{
                        fontSize: 20,
                        fontFamily: FONT.bold,
                        color: (summary?.net_profit ?? 0) >= 0 ? COLORS.success : COLORS.danger,
                      }}
                    >
                      {formatCurrency(summary?.net_profit ?? 0)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      after capital & expenses
                    </Text>
                  </Card>
                  <Card style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginBottom: 4,
                      }}
                    >
                      Expected Cash
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {formatCurrency(summary?.cash_in_hand_expected ?? 0)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLORS.text.muted,
                        marginTop: 2,
                      }}
                    >
                      cash on hand
                    </Text>
                  </Card>
                </View>

                <Card style={{ padding: 14 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        flex: 1,
                        marginRight: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: COLORS.warningLight,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="tag" size={16} color={COLORS.accentDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: FONT.regular,
                            fontSize: 11,
                            color: COLORS.text.muted,
                          }}
                        >
                          Total Discounts Given
                        </Text>
                        <Text
                          style={{
                            fontSize: 18,
                            fontFamily: FONT.bold,
                            color: COLORS.text.primary,
                            marginTop: 1,
                          }}
                        >
                          {formatCurrency(totalDiscounts)}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        backgroundColor:
                          totalDiscounts > 0 ? COLORS.warningLight : 'rgba(0,0,0,0.04)',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.full,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FONT.medium,
                          fontSize: 11,
                          color: totalDiscounts > 0 ? COLORS.accentDark : COLORS.text.muted,
                        }}
                      >
                        {discountedSalesCount} discounted sale
                        {discountedSalesCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>
                </Card>

                {isClosed && summary?.cash_in_hand_actual !== undefined ? (
                  <Card style={{ backgroundColor: discrepancyBg, borderColor: discrepancyBorder }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: FONT.regular,
                            fontSize: 12,
                            color: COLORS.text.muted,
                            marginBottom: 8,
                          }}
                        >
                          Cash Reconciliation
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          <View>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 10,
                                color: COLORS.text.muted,
                              }}
                            >
                              Expected
                            </Text>
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: FONT.bold,
                                color: COLORS.text.primary,
                              }}
                            >
                              {formatCurrency(summary.cash_in_hand_expected)}
                            </Text>
                          </View>
                          <View>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 10,
                                color: COLORS.text.muted,
                              }}
                            >
                              Actual
                            </Text>
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: FONT.bold,
                                color: COLORS.text.primary,
                              }}
                            >
                              {formatCurrency(summary.cash_in_hand_actual)}
                            </Text>
                          </View>
                          <View>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 10,
                                color: COLORS.text.muted,
                              }}
                            >
                              Difference
                            </Text>
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: FONT.bold,
                                color: discrepancyTone,
                              }}
                            >
                              {discrepancy > 0 ? '+' : ''}
                              {formatCurrency(discrepancy)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Feather
                        name={
                          discrepancy === 0
                            ? 'check-circle'
                            : discrepancy > 0
                            ? 'trending-up'
                            : 'alert-triangle'
                        }
                        size={20}
                        color={discrepancyTone}
                      />
                    </View>
                  </Card>
                ) : null}

                {Boolean(digitalInflows && digitalInflows.totalDigital > 0) ? (
                  <Card style={{ padding: 14 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: COLORS.infoLight,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="globe" size={16} color={COLORS.navy} />
                        </View>
                        <View>
                          <Text
                            style={{
                              fontFamily: FONT.regular,
                              fontSize: 11,
                              color: COLORS.text.muted,
                            }}
                          >
                            Digital & Bank Inflows
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              fontFamily: FONT.bold,
                              color: COLORS.text.primary,
                              marginTop: 1,
                            }}
                          >
                            {formatCurrency(digitalInflows!.totalDigital)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          backgroundColor: COLORS.infoLight,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: RADIUS.full,
                        }}
                      >
                        <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.navy }}>
                          {digitalInflows!.byBank.length + digitalInflows!.byPos.length} channel
                          {digitalInflows!.byBank.length + digitalInflows!.byPos.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>

                    {digitalInflows!.byBank.length > 0 ? (
                      <View style={{ marginBottom: digitalInflows!.byPos.length > 0 ? 10 : 0 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: FONT.bold,
                            color: COLORS.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 6,
                          }}
                        >
                          Bank Transfers ({formatCurrency(digitalInflows!.totalTransfer)})
                        </Text>
                        <View style={{ gap: 6 }}>
                          {digitalInflows!.byBank.map((item) => (
                            <View
                              key={item.bankName}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                backgroundColor: COLORS.surface,
                                borderRadius: RADIUS.sm,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="send" size={12} color={COLORS.navy} />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontFamily: FONT.medium,
                                    color: COLORS.text.primary,
                                  }}
                                >
                                  {item.bankName}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontFamily: FONT.regular,
                                    color: COLORS.text.muted,
                                  }}
                                >
                                  ({item.count} payment{item.count === 1 ? '' : 's'})
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontFamily: FONT.bold,
                                  color: COLORS.text.primary,
                                }}
                              >
                                {formatCurrency(item.total)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {digitalInflows!.byPos.length > 0 ? (
                      <View>
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: FONT.bold,
                            color: COLORS.accentDark,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 6,
                          }}
                        >
                          POS / Card Payments ({formatCurrency(digitalInflows!.totalPos)})
                        </Text>
                        <View style={{ gap: 6 }}>
                          {digitalInflows!.byPos.map((item) => (
                            <View
                              key={item.bankName}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                backgroundColor: COLORS.surface,
                                borderRadius: RADIUS.sm,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="credit-card" size={12} color={COLORS.accentDark} />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontFamily: FONT.medium,
                                    color: COLORS.text.primary,
                                  }}
                                >
                                  {item.bankName}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontFamily: FONT.regular,
                                    color: COLORS.text.muted,
                                  }}
                                >
                                  ({item.count} payment{item.count === 1 ? '' : 's'})
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontFamily: FONT.bold,
                                  color: COLORS.text.primary,
                                }}
                              >
                                {formatCurrency(item.total)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </Card>
                ) : null}
              </View>

              {salesEntries.length > 0 ? (
                <View>
                  <SectionHeader title={`Sales (${salesEntries.length})`} />
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {salesEntries.map((entry, index) => (
                      <View key={entry.id}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 14,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                                {entry.description}
                              </Text>
                              {Boolean(entry.discount_amount && entry.discount_amount > 0) && (
                                <View
                                  style={{
                                    backgroundColor: COLORS.warningLight,
                                    paddingHorizontal: 6,
                                    paddingVertical: 1,
                                    borderRadius: RADIUS.xs,
                                  }}
                                >
                                  <Text style={{ fontSize: 10, fontFamily: FONT.bold, color: COLORS.accentDark }}>
                                    -{formatCurrency(entry.discount_amount!)} OFF
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 12,
                                color: COLORS.text.muted,
                                marginTop: 2,
                              }}
                            >
                              {format(new Date(entry.time), 'h:mm a')}
                              {' \u00B7 '}
                              {entry.payment_method === 'mixed' && entry.cash_amount != null
                                ? `MIXED (${formatCurrency(entry.cash_amount)} Cash · ${formatCurrency(entry.transfer_amount ?? 0)} Transfer${entry.bank_name ? ` [${entry.bank_name}]` : ''})`
                                : entry.bank_name
                                ? `${entry.payment_method.toUpperCase()} \u00B7 ${entry.bank_name}`
                                : entry.payment_method.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.success }}>
                            +{formatCurrency(entry.amount)}
                          </Text>
                        </View>
                        {index < salesEntries.length - 1 ? (
                          <View
                            style={{
                              height: StyleSheet.hairlineWidth,
                              backgroundColor: COLORS.borderSubtle,
                              marginHorizontal: 14,
                            }}
                          />
                        ) : null}
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              {repaymentEntries.length > 0 ? (
                <View>
                  <SectionHeader title={`Debt Payments Received (${repaymentEntries.length})`} />
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {repaymentEntries.map((entry, index) => (
                      <View key={entry.id}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 14,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                              {entry.description}
                            </Text>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 12,
                                color: COLORS.text.muted,
                                marginTop: 2,
                              }}
                            >
                              {format(new Date(entry.time), 'h:mm a')}
                              {' \u00B7 '}
                              {entry.payment_method === 'mixed' && entry.cash_amount != null
                                ? `MIXED (${formatCurrency(entry.cash_amount)} Cash · ${formatCurrency(entry.transfer_amount ?? 0)} Transfer${entry.bank_name ? ` [${entry.bank_name}]` : ''})`
                                : entry.bank_name
                                ? `${entry.payment_method.toUpperCase()} \u00B7 ${entry.bank_name}`
                                : entry.payment_method.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.accentDark }}>
                            +{formatCurrency(entry.amount)}
                          </Text>
                        </View>
                        {index < repaymentEntries.length - 1 ? (
                          <View
                            style={{
                              height: StyleSheet.hairlineWidth,
                              backgroundColor: COLORS.borderSubtle,
                              marginHorizontal: 14,
                            }}
                          />
                        ) : null}
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              {expenseEntries.length > 0 ? (
                <View>
                  <SectionHeader title={`Expenses (${expenseEntries.length})`} />
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {expenseEntries.map((entry, index) => (
                      <View key={entry.id}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 14,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                              {entry.description}
                            </Text>
                            <Text
                              style={{
                                fontFamily: FONT.regular,
                                fontSize: 12,
                                color: COLORS.text.muted,
                                marginTop: 2,
                              }}
                            >
                              {format(new Date(entry.time), 'h:mm a')}
                              {' · '}
                              {entry.payment_method.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger }}>
                            -{formatCurrency(Math.abs(entry.amount))}
                          </Text>
                        </View>
                        {index < expenseEntries.length - 1 ? (
                          <View
                            style={{
                              height: StyleSheet.hairlineWidth,
                              backgroundColor: COLORS.borderSubtle,
                              marginHorizontal: 14,
                            }}
                          />
                        ) : null}
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              {entries.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="No activity yet"
                  description="No sales, expenses, or debt payments were recorded for this day."
                />
              ) : null}

              {!isClosed ? (
                <Button
                  title={isToday ? 'Close and Balance Today' : 'Close and Balance Day'}
                  icon="check-square"
                  onPress={() => router.push('/(app)/close-day')}
                  size="lg"
                  variant="primary"
                />
              ) : null}

              {isClosed ? (
                <Button
                  title="Reopen Balance"
                  icon="rotate-ccw"
                  onPress={handleReopenDay}
                  loading={isSaving}
                  size="lg"
                  variant="secondary"
                />
              ) : null}

              {summary ? (
                <Button
                  title="Share Daily Report"
                  icon="share-2"
                  onPress={handleShareOwnerReport}
                  variant="secondary"
                  size="lg"
                />
              ) : null}

              {isClosed && summary?.notes ? (
                <Card style={{ backgroundColor: '#F9FAFB' }}>
                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 12,
                      color: COLORS.text.muted,
                      marginBottom: 4,
                    }}
                  >
                    Day Closing Notes
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 14,
                      color: COLORS.text.secondary,
                      fontStyle: 'italic',
                    }}
                  >
                    "{summary.notes}"
                  </Text>
                </Card>
              ) : null}

              <View style={{ height: 20 }} />
            </View>
          )}
        </ScrollView>

        {showPicker && (
          <DateTimePicker
            value={new Date(selectedDate)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
              setShowPicker(Platform.OS === 'ios');
              if (date) {
                setSelectedDate(format(date, 'yyyy-MM-dd'));
              }
            }}
            maximumDate={new Date()}
          />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: 12,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  modeToggleBtnActive: {
    backgroundColor: '#ffffff',
  },
  modeToggleText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  modeToggleTextActive: {
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
  filterTabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 4,
    marginTop: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  filterTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: COLORS.text.muted,
  },
  filterTabTextActive: {
    fontFamily: FONT.bold,
    color: COLORS.navy,
  },
});
