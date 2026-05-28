import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Animated } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { isDebtSettlementSale } from '@/lib/records';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Badge, Card, EmptyState, LoadingScreen, SectionHeader, StatCard, PaymentSummary } from '@/components/ui';
import { BrandMark, ScreenShell, ScreenHeader, HeaderAction } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { CustomerDebt, DashboardStats, RevenueActivity } from '@/types';

// Formats with 2 decimal places for the hero number
const fmtFull = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Compact format for secondary stats
const fmt = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, profile } = useAuthStore();
  const { getStockAlerts } = useBusinessStore();
  const navigation = useNavigation();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RevenueActivity[]>([]);
  const [recentDebts, setRecentDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revenueVisible, setRevenueVisible] = useState(true);

  const fetchData = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const todayDate = format(new Date(), 'yyyy-MM-dd');
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const [
        todaySalesRes,
        todayRepaymentsRes,
        todayExpensesRes,
        debtsRes,
        productCountRes,
        customerCountRes,
        debtListRes,
        recentRevenueRes,
      ] = await Promise.all([
        supabase
          .from('sales')
          .select('amount_paid, notes')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),
        supabase
          .from('debt_repayments')
          .select('amount, debt:customer_debts!inner(business_id, branch_id)')
          .eq('debt.business_id', currentBusiness.id)
          .eq('debt.branch_id', currentBranch.id)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),
        supabase
          .from('expenses')
          .select('amount')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .eq('expense_date', todayDate),
        supabase
          .from('customer_debts')
          .select('balance')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .neq('status', 'settled'),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', currentBusiness.id)
          .eq('is_active', true),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', currentBusiness.id)
          .eq('is_active', true),
        supabase
          .from('customer_debts')
          .select('*')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .neq('status', 'settled')
          .order('created_at', { ascending: false })
          .limit(3),
        fetchRevenueActivities(currentBusiness.id, currentBranch.id, 4),
      ]);

      const totalSales = todaySalesRes.data
        ?.filter((row) => !isDebtSettlementSale(row.notes))
        .reduce((sum, row) => sum + row.amount_paid, 0) ?? 0;
      const totalRepayments = todayRepaymentsRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalExpenses = todayExpensesRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalDebts = debtsRes.data?.reduce((sum, row) => sum + row.balance, 0) ?? 0;
      const stockAlerts = await getStockAlerts(currentBusiness.id, currentBranch.id);

      setStats({
        today_sales: totalSales + totalRepayments,
        today_profit: totalSales - totalExpenses,
        today_expenses: totalExpenses,
        total_products: productCountRes.count ?? 0,
        low_stock_count: stockAlerts.lowStockProducts.length,
        out_of_stock_count: stockAlerts.outOfStockProducts.length,
        outstanding_debts: totalDebts,
        total_customers: customerCountRes.count ?? 0,
      });

      setRecentActivities(recentRevenueRes);
      setRecentDebts((debtListRes.data as CustomerDebt[]) ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBusiness, currentBranch, getStockAlerts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation, fetchData]);

  useRealtimeRefresh({
    channelName: `dashboard-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id],
    tables: [
      ...(currentBranch ? [{ table: 'sales', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'expenses', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'customer_debts', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'inventory', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'stock_movements', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      { table: 'debt_repayments' },
      ...(currentBusiness ? [{ table: 'products', filter: `business_id=eq.${currentBusiness.id}` }] : []),
      ...(currentBusiness ? [{ table: 'customers', filter: `business_id=eq.${currentBusiness.id}` }] : []),
    ],
    onRefresh: fetchData,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Derive a simple visual trend direction for profit
  const profitPositive = (stats?.today_profit ?? 0) >= 0;
  const profitRatio =
    (stats?.today_sales ?? 0) > 0
      ? Math.min(((stats?.today_profit ?? 0) / (stats?.today_sales ?? 1)) * 100, 100)
      : 0;
  const stockAlertMessages = [
    (stats?.out_of_stock_count ?? 0) > 0
      ? `${stats?.out_of_stock_count} product${stats?.out_of_stock_count === 1 ? ' is' : 's are'} out of stock`
      : null,
    (stats?.low_stock_count ?? 0) > 0
      ? `${stats?.low_stock_count} product${stats?.low_stock_count === 1 ? ' is' : 's are'} running low`
      : null,
  ].filter((message): message is string => Boolean(message));

  if (loading) return <LoadingScreen />;

  return (
    <SwipeableTabScreen name="dashboard">
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={`${greeting()}`}
        subtitle={`${profile?.full_name?.split(' ')[0] ?? 'Boss'} \u00B7 ${format(new Date(), 'EEE, MMM d')}`}
        theme="dark"
        left={<BrandMark size={36} />}
        right={
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              minHeight: 38,
              minWidth: 38,
              borderRadius: RADIUS.md,
              backgroundColor: 'rgba(239,239,208,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="bell" size={18} color={COLORS.text.inverse} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SP.page, gap: 20, paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            tintColor={COLORS.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Revenue Hero ─────────────────────────────────────────────────── */}
        {/* Deep ink card with a layered gradient effect using nested views.
            The tangerine accent bleeds through as a colour accent strip and
            the large number becomes the undeniable focal point. */}
        <View
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          <View
            style={{
              borderRadius: RADIUS['2xl'],
              overflow: 'hidden',
              // Subtle elevation through layered border, not box shadow
              borderWidth: 1,
              borderColor: 'rgba(255,107,53,0.18)',
            }}
          >
            {/* Deep background */}
            <View style={{ backgroundColor: COLORS.ink, padding: SP.lg, paddingBottom: 0 }}>
              {/* Top row: label + visibility toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* Live indicator dot */}
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: COLORS.success,
                    }}
                  />
                  <Text style={{ ...TYPE.overline, color: 'rgba(239,239,208,0.50)', letterSpacing: 1.2 }}>
                    TODAY&apos;S REVENUE
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRevenueVisible((v) => !v)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: RADIUS.sm,
                    backgroundColor: 'rgba(239,239,208,0.07)',
                  }}
                >
                  <Feather
                    name={revenueVisible ? 'eye' : 'eye-off'}
                    size={12}
                    color="rgba(239,239,208,0.4)"
                  />
                  <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: 'rgba(239,239,208,0.35)', letterSpacing: 0.5 }}>
                    {revenueVisible ? 'HIDE' : 'SHOW'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Primary revenue number — large, commanding */}
              {revenueVisible ? (
                <View style={{ marginTop: 6, marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 44,
                      fontFamily: FONT.black,
                      color: COLORS.accent,
                      letterSpacing: -1.5,
                      lineHeight: 52,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {fmtFull(stats?.today_sales ?? 0)}
                  </Text>

                  {/* Profit trend pill */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.full,
                        backgroundColor: profitPositive
                          ? 'rgba(46,204,113,0.15)'
                          : 'rgba(231,76,60,0.15)',
                        borderWidth: 1,
                        borderColor: profitPositive
                          ? 'rgba(46,204,113,0.25)'
                          : 'rgba(231,76,60,0.25)',
                      }}
                    >
                      <Feather
                        name={profitPositive ? 'trending-up' : 'trending-down'}
                        size={11}
                        color={profitPositive ? COLORS.success : COLORS.danger}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.medium,
                          color: profitPositive ? COLORS.success : COLORS.danger,
                        }}
                      >
                        {profitPositive ? '+' : ''}{profitRatio.toFixed(1)}% margin
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(239,239,208,0.35)' }}>
                      {format(new Date(), 'MMM d, yyyy')}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 6, marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 44,
                      fontFamily: FONT.black,
                      color: 'rgba(239,239,208,0.15)',
                      letterSpacing: 8,
                      lineHeight: 52,
                    }}
                  >
                    ••••••••
                  </Text>
                  <View style={{ marginTop: 8, height: 22 }} />
                </View>
              )}
            </View>

            {/* Accent divider strip — a razor-thin tangerine line */}
            <View
              style={{
                height: 2,
                backgroundColor: COLORS.ink,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,107,53,0.35)',
              }}
            />

            {/* Secondary stats row — slightly lighter ink for depth layering */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(0,38,68,1)',
                borderBottomLeftRadius: RADIUS['2xl'] - 1,
                borderBottomRightRadius: RADIUS['2xl'] - 1,
              }}
            >
              {/* Expenses */}
              <View
                style={{
                  flex: 1,
                  padding: SP.md,
                  paddingVertical: 14,
                  borderRightWidth: 1,
                  borderRightColor: 'rgba(255,255,255,0.06)',
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <Feather name="arrow-down-circle" size={11} color="rgba(239,239,208,0.35)" />
                  <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: 'rgba(239,239,208,0.35)', letterSpacing: 0.8 }}>
                    EXPENSES
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: FONT.bold,
                    color: revenueVisible ? 'rgba(239,239,208,0.85)' : 'rgba(239,239,208,0.2)',
                    letterSpacing: -0.3,
                  }}
                >
                  {revenueVisible ? fmt(stats?.today_expenses ?? 0) : '••••'}
                </Text>
              </View>

              {/* Net Profit */}
              <View
                style={{
                  flex: 1,
                  padding: SP.md,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <Feather name="bar-chart-2" size={11} color="rgba(239,239,208,0.35)" />
                  <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: 'rgba(239,239,208,0.35)', letterSpacing: 0.8 }}>
                    NET PROFIT
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: FONT.bold,
                    letterSpacing: -0.3,
                    color: revenueVisible
                      ? profitPositive
                        ? COLORS.success
                        : COLORS.danger
                      : 'rgba(239,239,208,0.2)',
                  }}
                >
                  {revenueVisible
                    ? `${profitPositive ? '' : '-'}${fmt(Math.abs(stats?.today_profit ?? 0))}`
                    : '••••'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Low stock alert ─────────────────────────────── */}
        {stockAlertMessages.length > 0 ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/(tabs)/inventory')}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: COLORS.warning,
              backgroundColor: COLORS.warningLight,
              padding: 14,
            }}
          >
            <Feather name="alert-triangle" size={16} color={COLORS.warning} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.warning }}>
                Inventory alert
              </Text>
              {stockAlertMessages.map((message) => (
                <Text key={message} style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
                  {message}
                </Text>
              ))}
            </View>
            <Feather name="chevron-right" size={14} color={COLORS.warning} />
          </TouchableOpacity>
        ) : null}

        {/* ── Quick Actions ───────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { icon: 'shopping-cart' as const, label: 'Record Sale', route: '/(app)/record-sale', color: COLORS.accent },
            { icon: 'plus-square' as const, label: 'Add Stock', route: '/(app)/add-stock', color: COLORS.info },
            { icon: 'minus-circle' as const, label: 'Expense', route: '/(app)/record-expense', color: COLORS.warning },
            { icon: 'credit-card' as const, label: 'Record Debt', route: '/(app)/record-debt', color: COLORS.danger },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: '#F9FAFB',
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: RADIUS.md,
                paddingVertical: 16,
                paddingHorizontal: 10,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: action.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={action.icon} size={15} color={action.color} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'center' }}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Overview Stats ──────────────────────────────── */}
        <View>
          <SectionHeader title="Overview" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <StatCard
              label="Products"
              value={String(stats?.total_products ?? 0)}
              icon="package"
              iconColor={COLORS.info}
              iconBg={COLORS.infoLight}
              onPress={() => router.push('/(app)/(tabs)/inventory')}
              style={{ backgroundColor: '#F9FAFB' }}
            />
            <StatCard
              label="Customers"
              value={String(stats?.total_customers ?? 0)}
              icon="users"
              iconColor={COLORS.success}
              iconBg={COLORS.successLight}
              onPress={() => router.push('/(app)/customers')}
              style={{ backgroundColor: '#F9FAFB' }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard
              label="Debts Owed"
              value={fmt(stats?.outstanding_debts ?? 0)}
              icon="credit-card"
              iconColor={COLORS.warning}
              iconBg={COLORS.warningLight}
              onPress={() => router.push('/(app)/(tabs)/debts')}
              style={{ backgroundColor: '#F9FAFB' }}
            />
            <StatCard
              label="Low Stock"
              value={String(stats?.low_stock_count ?? 0)}
              icon="alert-circle"
              iconColor={COLORS.danger}
              iconBg={COLORS.dangerLight}
              onPress={() => router.push('/(app)/(tabs)/inventory')}
              style={{ backgroundColor: '#F9FAFB' }}
            />
          </View>
        </View>

        {/* ── Recent Sales ────────────────────────────────── */}
        <View>
          <SectionHeader
            title="Recent Activity"
            action={{ label: 'See all', onPress: () => router.push('/(app)/(tabs)/sales') }}
          />
          {recentActivities.length === 0 ? (
            <EmptyState
              icon="shopping-bag"
              title="No activity yet"
              description="Sales and collections will appear here."
            />
          ) : (
            <Card style={{ padding: 0, backgroundColor: '#F9FAFB' }}>
              {recentActivities.map((activity, index) => (
                <View key={`${activity.kind}-${activity.id}`}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      paddingHorizontal: SP.card,
                      paddingVertical: 14,
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                        {activity.kind === 'debt_repayment' ? `Payment \u00B7 ${activity.customer_name}` : activity.customer_name}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>
                        {activity.reference}
                        {" \u00B7 "}
                        {format(new Date(activity.created_at), 'h:mm a')}
                      </Text>
                    </View>
                    <PaymentSummary
                      totalAmount={activity.total_amount}
                      amountPaid={activity.amount_paid}
                      amountOwed={activity.amount_owed}
                      tone="sales"
                    />
                  </View>
                  {index < recentActivities.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: SP.card }} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* ── Outstanding Debts ───────────────────────────── */}
        {recentDebts.length > 0 ? (
          <View>
            <SectionHeader title="Outstanding Debts" action={{ label: 'See all', onPress: () => router.push('/(app)/(tabs)/debts') }} />
            <Card style={{ padding: 0, backgroundColor: '#F9FAFB' }}>
              {recentDebts.map((debt, index) => (
                <View key={debt.id}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: SP.card,
                      paddingVertical: 14,
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{debt.customer_name}</Text>
                      {debt.customer_phone ? (
                        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>{debt.customer_phone}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger }}>{fmt(debt.balance)}</Text>
                  </View>
                  {index < recentDebts.length - 1 ? <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: SP.card }} /> : null}
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
    </SwipeableTabScreen>
  );
}
