import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { addDays, format, subDays } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { shareDailyReport } from '@/lib/reports';
import { Badge, Button, Card, ConfirmDialog, EmptyState, LoadingScreen, SectionHeader } from '@/components/ui';
import { ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Math.abs(value).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function DailyBalanceScreen() {
  const { currentBusiness, currentBranch } = useAuthStore();
  const {
    summary,
    entries,
    isLoading,
    isSaving,
    selectedDate,
    setSelectedDate,
    fetchDailyBalance,
    reopenDay,
  } = useDailyBalanceStore();
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

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
      ...(currentBranch ? [{ table: 'expenses', filter: `branch_id=eq.${currentBranch.id}` }] : []),
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
  const touchStartX = useRef(0);

  const handleReopenDay = () => {
    if (!currentBusiness || !currentBranch || !summary?.is_closed) return;
    setShowReopenConfirm(true);
  };


  const discrepancy = summary ? (summary.cash_in_hand_actual ?? 0) - summary.cash_in_hand_expected : 0;
  const isClosed = summary?.is_closed ?? false;
  const salesEntries = entries.filter((entry) => entry.type === 'sale');
  const expenseEntries = entries.filter((entry) => entry.type === 'expense');
  const repaymentEntries = entries.filter((entry) => entry.type === 'debt_repayment');
  const repaymentTotal = repaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalRevenue = (summary?.total_sales ?? 0) + repaymentTotal;

  const discrepancyTone =
    discrepancy === 0 ? COLORS.success : discrepancy > 0 ? COLORS.accent : COLORS.danger;
  const discrepancyBg =
    discrepancy === 0 ? '#ECFDF3' : discrepancy > 0 ? '#EEF4FF' : '#FEF3F2';
  const discrepancyBorder =
    discrepancy === 0 ? '#BFD9CA' : discrepancy > 0 ? '#B7CADB' : '#DDAEA6';
  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Daily Balance"
          subtitle={format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          theme="dark"
          right={isClosed ? <Badge label="Closed" variant="success" /> : undefined}
        />

        <View style={{ backgroundColor: COLORS.ink, paddingHorizontal: 20, paddingBottom: 18 }}>
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
              backgroundColor: 'rgba(255,253,248,0.08)',
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: 'rgba(255,253,248,0.12)',
              padding: 12,
            }}
          >
            <TouchableOpacity onPress={() => changeDate(-1)} activeOpacity={0.8} style={{ padding: 4 }}>
              <Feather name="chevron-left" size={18} color={COLORS.text.inverse} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.text.inverse, fontFamily: FONT.bold, fontSize: 16 }}>
                {format(new Date(selectedDate), 'EEEE')}
              </Text>
              <Text style={{ fontFamily: FONT.regular, color: 'rgba(255,253,248,0.62)', fontSize: 13 }}>
                {format(new Date(selectedDate), 'MMMM d, yyyy')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => changeDate(1)}
              activeOpacity={0.8}
              style={{ padding: 4, opacity: isToday ? 0.35 : 1 }}
              disabled={isToday}
            >
              <Feather name="chevron-right" size={18} color={COLORS.text.inverse} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={COLORS.ink} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ padding: 20, gap: 20 }}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Card style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginBottom: 4 }}>Total Revenue</Text>
                  <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {formatCurrency(totalRevenue)}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                    {salesEntries.length + repaymentEntries.length} revenue entr{salesEntries.length + repaymentEntries.length === 1 ? 'y' : 'ies'}
                  </Text>
                </Card>
                <Card style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginBottom: 4 }}>Total Expenses</Text>
                  <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.danger }}>
                    {formatCurrency(summary?.total_expenses ?? 0)}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>
                    {expenseEntries.length} item{expenseEntries.length !== 1 ? 's' : ''}
                  </Text>
                </Card>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Card style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginBottom: 4 }}>Net Profit</Text>
                  <Text
                    style={{
                      fontSize: 20,
                      fontFamily: FONT.bold,
                      color: (summary?.net_profit ?? 0) >= 0 ? COLORS.success : COLORS.danger,
                    }}
                  >
                    {(summary?.net_profit ?? 0) < 0 ? '-' : ''}
                    {formatCurrency(summary?.net_profit ?? 0)}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>after all expenses</Text>
                </Card>
                <Card style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginBottom: 4 }}>Expected Cash</Text>
                  <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                    {formatCurrency(summary?.cash_in_hand_expected ?? 0)}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2 }}>cash on hand</Text>
                </Card>
              </View>

              {isClosed && summary?.cash_in_hand_actual !== undefined ? (
                <Card style={{ backgroundColor: discrepancyBg, borderColor: discrepancyBorder }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 8 }}>Cash Reconciliation</Text>
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        <View>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted }}>Expected</Text>
                          <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                            {formatCurrency(summary.cash_in_hand_expected)}
                          </Text>
                        </View>
                        <View>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted }}>Actual</Text>
                          <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                            {formatCurrency(summary.cash_in_hand_actual)}
                          </Text>
                        </View>
                        <View>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted }}>Difference</Text>
                          <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: discrepancyTone }}>
                            {discrepancy > 0 ? '+' : ''}
                            {formatCurrency(discrepancy)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Feather
                      name={discrepancy === 0 ? 'check-circle' : discrepancy > 0 ? 'trending-up' : 'alert-triangle'}
                      size={20}
                      color={discrepancyTone}
                    />
                  </View>
                </Card>
              ) : null}
            </View>

            {salesEntries.length > 0 ? (
              <View>
                <SectionHeader title={`Sales (${salesEntries.length})`} />
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {salesEntries.map((entry, index) => (
                    <View key={entry.id}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{entry.description}</Text>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                            {format(new Date(entry.time), 'h:mm a')}
                            {' \u00B7 '}
                            {entry.payment_method.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.success }}>+{formatCurrency(entry.amount)}</Text>
                      </View>
                      {index < salesEntries.length - 1 ? <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} /> : null}
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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{entry.description}</Text>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                            {format(new Date(entry.time), 'h:mm a')}
                            {' \u00B7 '}
                            {entry.payment_method.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.accent }}>+{formatCurrency(entry.amount)}</Text>
                      </View>
                      {index < repaymentEntries.length - 1 ? <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} /> : null}
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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{entry.description}</Text>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                            {format(new Date(entry.time), 'h:mm a')}
                            {' \u00B7 '}
                            {entry.payment_method.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger }}>
                          -{formatCurrency(Math.abs(entry.amount))}
                        </Text>
                      </View>
                      {index < expenseEntries.length - 1 ? <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} /> : null}
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
                onPress={() => {
                  if (!currentBusiness || !currentBranch || !summary) return;
                  shareDailyReport({
                    date: selectedDate,
                    business: currentBusiness,
                    branch: currentBranch,
                    totalSales: totalRevenue,
                    totalExpenses: summary.total_expenses,
                    grossProfit: summary.gross_profit,
                    netProfit: summary.net_profit,
                    totalTransactions: salesEntries.length + repaymentEntries.length,
                    cashExpected: summary.cash_in_hand_expected,
                    cashActual: summary.cash_in_hand_actual,
                    topProducts: [],
                    salesByMethod: Object.entries(
                      [...salesEntries, ...repaymentEntries].reduce((acc: Record<string, number>, entry) => {
                        acc[entry.payment_method] = (acc[entry.payment_method] || 0) + entry.amount;
                        return acc;
                      }, {}),
                    ).map(([method, amount]) => ({ method, amount })),
                    isClosed: summary.is_closed,
                  });
                }}
                variant="secondary"
                size="lg"
              />
            ) : null}

            {isClosed && summary?.notes ? (
              <Card style={{ backgroundColor: '#F9FAFB' }}>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>Day Closing Notes</Text>
                <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.text.secondary, fontStyle: 'italic' }}>
                  "{summary.notes}"
                </Text>
              </Card>
            ) : null}

            <View style={{ height: 20 }} />
          </View>
        </ScrollView>

        <ConfirmDialog
          visible={showReopenConfirm}
          title="Reopen balance?"
          message="This will unlock the daily balance so you can make updates and close it again."
          confirmLabel="Reopen"
          onConfirm={async () => {
            setShowReopenConfirm(false);
            if (!currentBusiness || !currentBranch) return;
            const success = await reopenDay(currentBusiness.id, currentBranch.id);
            if (!success) {
              Alert.alert('Error', 'Failed to reopen the balance. Please try again.');
            }
          }}
          onCancel={() => setShowReopenConfirm(false)}
          variant="primary"
        />
      </View>
    </ScreenShell>
  );
}
