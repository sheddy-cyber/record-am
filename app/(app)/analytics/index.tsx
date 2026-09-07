import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { DateRange, useAnalyticsStore } from '@/store/analyticsStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { BarChart, ChartLegend, DonutChart, LineChart, MetricCard } from '@/components/charts';
import { RoleGate } from '@/components/ui';
import { Card, SectionHeader } from '@/components/ui';
import { ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from "@/constants";
import { Product } from '@/types';
import { format, subMonths } from 'date-fns';
import { useBusinessStore } from '@/store/businessStore';

const STATIC_RANGES: { key: DateRange; label: string }[] = [
  { key: '7days', label: '7 Days' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: '30days', label: '30 Days' },
];

const generateDateRanges = () => {
  const ranges = [...STATIC_RANGES];
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = subMonths(now, i);
    ranges.push({
      key: format(d, 'yyyy-MM'),
      label: format(d, 'MMM yyyy'),
    });
  }
  return ranges;
};

const DATE_RANGES = generateDateRanges();

const EXPENSE_COLORS = [
  COLORS.accent,
  COLORS.danger,
  COLORS.warning,
  COLORS.success,
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${CURRENCY_SYMBOL}${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${CURRENCY_SYMBOL}${(n / 1_000).toFixed(0)}k`
      : `${CURRENCY_SYMBOL}${n.toFixed(0)}`;

const fmtCount = (n: number) => n.toLocaleString();

export default function AnalyticsScreen() {
  const { currentBusiness, currentBranch, userRole } = useAuthStore();
  const { products } = useBusinessStore();
  const {
    summary,
    salesTrend,
    allProducts,
    topProducts,
    expenseBreakdown,
    isLoading,
    dateRange,
    setDateRange,
    fetchAnalytics,
  } = useAnalyticsStore();

  // Redirect staff away — analytics is owner-only
  useEffect(() => {
    if (userRole && userRole !== 'owner') {
      router.replace('/(app)/(tabs)');
    }
  }, [userRole]);

  const load = useCallback(() => {
    if (currentBusiness && currentBranch) {
      fetchAnalytics(currentBusiness.id, currentBranch.id);
    }
  }, [currentBusiness, currentBranch, fetchAnalytics]);

  useEffect(() => {
    load();
  }, [load, dateRange]);

  useRealtimeRefresh({
    channelName: `analytics-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id, dateRange],
    tables: [
      ...(currentBranch ? [{ table: 'sales', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'expenses', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'customer_debts', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      { table: 'debt_repayments' },
      ...(currentBranch ? [{ table: 'sale_items' }] : []),
    ],
    onRefresh: load,
  });

  const barData = salesTrend.map((point) => ({
    label: point.label,
    value: point.revenue,
    secondaryValue: point.profit,
  }));

  const expensePieData = expenseBreakdown.map((item, index) => ({
    label: item.category.charAt(0).toUpperCase() + item.category.slice(1),
    value: item.total,
    color: EXPENSE_COLORS[index % EXPENSE_COLORS.length],
  }));

  const totalExpenses = summary?.total_expenses ?? 0;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Analytics"
        subtitle={[currentBusiness?.name, currentBranch?.name].filter(Boolean).join(" \u00B7 ")}
        theme="dark"
      />

      <View
        style={{
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: 20,
          paddingVertical: 14,
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DATE_RANGES.map((range) => {
              const active = dateRange === range.key;
              return (
                <TouchableOpacity
                  key={range.key}
                  onPress={() => setDateRange(range.key)}
                  activeOpacity={0.8}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: active ? COLORS.ink : COLORS.border,
                    backgroundColor: active ? COLORS.ink : COLORS.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: FONT.medium,
                      color: active ? COLORS.text.inverse : COLORS.text.secondary,
                    }}
                  >
                    {range.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={COLORS.ink} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !summary ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <ActivityIndicator size="large" color={COLORS.ink} />
            <Text style={{ fontFamily: FONT.regular, marginTop: 12, color: COLORS.text.muted }}>Loading analytics...</Text>
          </View>
        ) : (
          <View style={{ padding: 20, gap: 24 }}>
            <View style={{ gap: 8 }}>
              <SectionHeader title="Financial Overview" />
              <Card style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.ink + '14', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="dollar-sign" size={14} color={COLORS.ink} />
                      </View>
                      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.secondary }}>Total Revenue</Text>
                    </View>
                    <Text style={{ fontSize: 32, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 4 }}>
                      {fmt(summary?.total_revenue ?? 0)}
                    </Text>
                  </View>
                  {summary?.revenue_growth !== undefined && summary.revenue_growth !== 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: summary.revenue_growth >= 0 ? COLORS.successLight : COLORS.dangerLight,
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        gap: 2,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: summary.revenue_growth >= 0 ? COLORS.success : COLORS.danger }}>
                        {summary.revenue_growth >= 0 ? '+' : ''}{summary.revenue_growth.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 8 }}>
                  Total cash collected from sales
                </Text>

                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 16 }} />

                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Expenses</Text>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                      {fmt(summary?.total_expenses ?? 0)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                      Total money spent
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <View style={{ flex: 1, paddingHorizontal: 8 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Gross Profit</Text>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.accent, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                      {fmt(summary?.gross_profit ?? 0)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                      Rev. minus goods cost
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <View style={{ flex: 1, paddingLeft: 8 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Net Profit</Text>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.success, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                      {fmt(summary?.net_profit ?? 0)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                      After all expenses
                    </Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 16 }} />
                
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Transactions</Text>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.warning, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                      {String(summary?.total_transactions ?? 0)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                      Avg: {fmt(summary?.avg_transaction_value ?? 0)}
                    </Text>
                  </View>
                  
                  <RoleGate allowedRoles={['owner']}>
                    <React.Fragment>
                      <View style={{ width: 1, backgroundColor: COLORS.border }} />
                      <View style={{ flex: 1, paddingHorizontal: 8 }}>
                        <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Stock Items</Text>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.ink, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                          {fmtCount(summary?.historical_stock_items ?? 0)}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                          Total quantity
                        </Text>
                      </View>
                      <View style={{ width: 1, backgroundColor: COLORS.border }} />
                      <View style={{ flex: 1, paddingLeft: 8 }}>
                        <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.secondary }}>Net Worth</Text>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.accent, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                          {fmt(summary?.historical_stock_value ?? 0)}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: COLORS.text.muted, lineHeight: 14 }}>
                          Est. stock value
                        </Text>
                      </View>
                    </React.Fragment>
                  </RoleGate>
                </View>
              </Card>
            </View>

            <Card>
              <SectionHeader title="Revenue And Profit Trend" />
              {salesTrend.length === 0 ? (
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, paddingVertical: 20, textAlign: 'center' }}>
                  No sales data for this period
                </Text>
              ) : (
                <>
                  <LineChart
                    data={barData}
                    showSecondary
                    color={COLORS.ink}
                    secondaryColor={COLORS.success}
                  />
                  <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 12, height: 3, backgroundColor: COLORS.ink }} />
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary }}>Revenue</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View
                        style={{
                          width: 12,
                          height: 2,
                          backgroundColor: COLORS.success,
                          borderStyle: 'dashed',
                        }}
                      />
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary }}>Profit</Text>
                    </View>
                  </View>
                </>
              )}
            </Card>

            <Card>
              <SectionHeader title="Daily Sales Volume" />
              {salesTrend.length === 0 ? (
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, paddingVertical: 20, textAlign: 'center' }}>
                  No sales data for this period
                </Text>
              ) : (
                <BarChart
                  data={salesTrend.map((point) => ({ label: point.label, value: point.transactions }))}
                  formatValue={(v) => Math.round(v).toString()}
                  color={COLORS.ink}
                />
              )}
            </Card>

            <Card>
              <SectionHeader title="Top Selling Products" />
              {topProducts.length === 0 ? (
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, paddingVertical: 12, textAlign: 'center' }}>
                  No product sales in this period
                </Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {topProducts.map((product, index) => {
                    const maxQty = topProducts[0].total_qty;
                    const pct = maxQty > 0 ? product.total_qty / maxQty : 0;

                    return (
                      <View key={product.product_id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderWidth: 1,
                                borderRadius: RADIUS.md,
                                borderColor: COLORS.border,
                                backgroundColor: COLORS.accent + '18',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: COLORS.ink }}>{index + 1}</Text>
                            </View>
                            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1 }} numberOfLines={1}>
                              {product.product_name}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                              {fmtCount(product.total_qty)} sold
                            </Text>
                            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>
                              {fmt(product.total_revenue)} rev • {fmt(product.total_profit)} profit
                            </Text>
                          </View>
                        </View>
                        <View style={{ height: 6, backgroundColor: '#F3F4F6' }}>
                          <View
                            style={{
                              height: 6,
                              backgroundColor: COLORS.ink,
                              width: `${pct * 100}%`,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => router.push('/(app)/analytics/products' as any)}
                    style={{
                      marginTop: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      backgroundColor: COLORS.surface,
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.ink }}>
                      View Product Analytics
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>

            <Card>
              <SectionHeader title="Expense Breakdown" />
              {expenseBreakdown.length === 0 ? (
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, paddingVertical: 12, textAlign: 'center' }}>
                  No expenses recorded in this period
                </Text>
              ) : (
                <View style={{ flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                  <DonutChart data={expensePieData} size={180} thickness={32} centerLabel={fmt(totalExpenses)} centerSubLabel="Total" />
                  <View style={{ width: '100%' }}>
                    <ChartLegend
                      items={expensePieData.map((item) => ({
                        label: item.label,
                        color: item.color,
                        value: `${expenseBreakdown.find((entry) => entry.category === item.label.toLowerCase())?.percentage.toFixed(0)}%`,
                      }))}
                    />
                  </View>
                </View>
              )}
            </Card>

            {summary && summary.total_revenue > 0 ? (
              <Card>
                <SectionHeader title="Business Health" />
                <View style={{ gap: 20 }}>
                  {[
                    {
                      label: 'Profit Margin',
                      description: 'The percentage of revenue you keep as pure profit after all costs.',
                      value: `${((summary.net_profit / summary.total_revenue) * 100).toFixed(1)}%`,
                      pct: summary.net_profit / summary.total_revenue,
                      color: COLORS.success,
                      good: summary.net_profit / summary.total_revenue > 0.15,
                    },
                    {
                      label: 'Expense Ratio',
                      description: 'The percentage of your revenue that gets consumed by running expenses.',
                      value: `${((summary.total_expenses / summary.total_revenue) * 100).toFixed(1)}%`,
                      pct: summary.total_expenses / summary.total_revenue,
                      color: COLORS.danger,
                      good: summary.total_expenses / summary.total_revenue < 0.4,
                    },
                  ].map((metric) => (
                    <View key={metric.label}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.primary }}>{metric.label}</Text>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 2, lineHeight: 16 }}>
                            {metric.description}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>{metric.value}</Text>
                          <Feather
                            name={metric.good ? 'check-circle' : 'alert-triangle'}
                            size={12}
                            color={metric.good ? COLORS.success : COLORS.warning}
                          />
                        </View>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                        <View
                          style={{
                            height: 8,
                            backgroundColor: metric.color,
                            width: `${Math.min(100, Math.abs(metric.pct) * 100)}%`,
                            borderRadius: 4,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            <View style={{ height: 20 }} />
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}
