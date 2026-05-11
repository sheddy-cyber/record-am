import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { isDebtSettlementSale } from '@/lib/records';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useConfirmSignOut } from '@/hooks/useConfirmSignOut';
import { Badge, Card, EmptyState, LoadingScreen, SectionHeader, StatCard, PaymentSummary } from '@/components/ui';
import { BrandMark, ScreenShell, ScreenHeader, HeaderAction } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import { CustomerDebt, DashboardStats, RevenueActivity } from '@/types';

const fmt = (value: number) => `\u20A6${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, profile } = useAuthStore();
  const { getLowStockProducts } = useBusinessStore();
  const confirmSignOut = useConfirmSignOut();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RevenueActivity[]>([]);
  const [recentDebts, setRecentDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

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
          .select('total_amount, notes')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`),
        supabase
          .from('debt_repayments')
          .select('amount, debt:customer_debts!inner(business_id, branch_id)')
          .eq('debt.business_id', currentBusiness.id)
          .eq('debt.branch_id', currentBranch.id)
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`),
        supabase
          .from('expenses')
          .select('amount')
          .eq('business_id', currentBusiness.id)
          .eq('branch_id', currentBranch.id)
          .eq('expense_date', today),
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
        .reduce((sum, row) => sum + row.total_amount, 0) ?? 0;
      const totalRepayments = todayRepaymentsRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalExpenses = todayExpensesRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalDebts = debtsRes.data?.reduce((sum, row) => sum + row.balance, 0) ?? 0;
      const lowStock = await getLowStockProducts(currentBusiness.id, currentBranch.id);

      setStats({
        today_sales: totalSales + totalRepayments,
        today_profit: totalSales - totalExpenses,
        today_expenses: totalExpenses,
        total_products: productCountRes.count ?? 0,
        low_stock_count: lowStock.length,
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
  }, [currentBusiness, currentBranch, getLowStockProducts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (loading) return <LoadingScreen />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={`${greeting()}`}
        subtitle={`${profile?.full_name?.split(' ')[0] ?? 'Boss'} \u2022 ${format(new Date(), 'EEE, MMM d')}`}
        theme="dark"
        left={<BrandMark size={36} />}
        right={<HeaderAction icon="log-out" onPress={confirmSignOut} />}
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
        {/* ── Revenue Hero ──────────────────────────────────── */}
        <Card style={{ backgroundColor: COLORS.ink, borderColor: 'rgba(201,150,59,0.2)', padding: SP.lg }}>
          <Text style={{ ...TYPE.overline, color: 'rgba(248,250,252,0.5)' }}>Today&apos;s revenue</Text>
          <Text style={{ ...TYPE.big, color: COLORS.accent, marginTop: 8 }}>
            {fmt(stats?.today_sales ?? 0)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1, padding: 12, borderRadius: RADIUS.sm, backgroundColor: 'rgba(248,250,252,0.06)' }}>
              <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: 'rgba(248,250,252,0.45)' }}>Expenses</Text>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.inverse, marginTop: 4 }}>
                {fmt(stats?.today_expenses ?? 0)}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 12, borderRadius: RADIUS.sm, backgroundColor: 'rgba(248,250,252,0.06)' }}>
              <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: 'rgba(248,250,252,0.45)' }}>Net profit</Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: FONT.bold,
                  color: (stats?.today_profit ?? 0) >= 0 ? '#4ADE80' : '#FCA5A5',
                  marginTop: 4,
                }}
              >
                {fmt(stats?.today_profit ?? 0)}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── Low stock alert ─────────────────────────────── */}
        {(stats?.low_stock_count ?? 0) > 0 ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/(tabs)/inventory')}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: '#FDE68A',
              backgroundColor: COLORS.warningLight,
              padding: 14,
            }}
          >
            <Feather name="alert-triangle" size={16} color={COLORS.warning} />
            <Text style={{ flex: 1, fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
              {stats?.low_stock_count} product{stats?.low_stock_count === 1 ? '' : 's'} running low
            </Text>
            <Feather name="chevron-right" size={14} color={COLORS.warning} />
          </TouchableOpacity>
        ) : null}

        {/* ── Quick Actions ───────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { icon: 'shopping-cart' as const, label: 'Record Sale', route: '/(app)/(tabs)/sales?modal=record-sale', color: COLORS.accent },
            { icon: 'plus-square' as const, label: 'Add Stock', route: '/(app)/(tabs)/inventory', color: COLORS.info },
            { icon: 'minus-circle' as const, label: 'Expense', route: '/(app)/(tabs)/more?modal=expense', color: COLORS.warning },
            { icon: 'credit-card' as const, label: 'Record Debt', route: '/(app)/(tabs)/debts', color: COLORS.danger },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: COLORS.card,
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
            />
            <StatCard
              label="Customers"
              value={String(stats?.total_customers ?? 0)}
              icon="users"
              iconColor={COLORS.success}
              iconBg={COLORS.successLight}
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
            />
            <StatCard
              label="Low Stock"
              value={String(stats?.low_stock_count ?? 0)}
              icon="alert-circle"
              iconColor={COLORS.danger}
              iconBg={COLORS.dangerLight}
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
            <Card style={{ padding: 0 }}>
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
                        {activity.kind === 'debt_repayment' ? `Payment · ${activity.customer_name}` : activity.customer_name}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>
                        {activity.reference} \u2022 {format(new Date(activity.created_at), 'h:mm a')}
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
            <Card style={{ padding: 0 }}>
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
  );
}
