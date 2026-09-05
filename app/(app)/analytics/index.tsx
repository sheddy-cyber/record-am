import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
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
  const { currentBusiness, currentBranch } = useAuthStore();
  const { products } = useBusinessStore();
  const {
    summary,
    salesTrend,
    topProducts,
    bottomProducts,
    expenseBreakdown,
    isLoading,
    dateRange,
    setDateRange,
    fetchAnalytics,
  } = useAnalyticsStore();

  const getProductStock = useCallback((product: Product, branchId?: string) => {
    if (!product.inventory) return 0;
    return product.inventory
      .filter((inv) => !branchId || inv.branch_id === branchId)
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }, []);

  const totalStockValue = React.useMemo(() => {
    return products.reduce((total, product) => {
      if (product.is_service) return total;
      const stock = getProductStock(product, currentBranch?.id);
      if (stock > 0) {
        return total + (stock * product.selling_price);
      }
      return total;
    }, 0);
  }, [products, currentBranch?.id, getProductStock]);

  const totalStockItems = React.useMemo(() => {
    return products.reduce((total, product) => {
      if (product.is_service) return total;
      return total + getProductStock(product, currentBranch?.id);
    }, 0);
  }, [products, currentBranch?.id, getProductStock]);

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
            <View>
              <SectionHeader title="Key Metrics" />
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <MetricCard
                  label="Revenue"
                  value={fmt(summary?.total_revenue ?? 0)}
                  growth={summary?.revenue_growth}
                  icon="dollar-sign"
                  color={COLORS.ink}
                  subtext="vs previous period"
                />
                <MetricCard
                  label="Net Profit"
                  value={fmt(summary?.total_profit ?? 0)}
                  growth={summary?.profit_growth}
                  icon="trending-up"
                  color={COLORS.success}
                  subtext="after expenses"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <MetricCard
                  label="Expenses"
                  value={fmt(summary?.total_expenses ?? 0)}
                  icon="credit-card"
                  color={COLORS.danger}
                />
                <MetricCard
                  label="Transactions"
                  value={String(summary?.total_transactions ?? 0)}
                  icon="shopping-bag"
                  color={COLORS.warning}
                  subtext={`Avg ${fmt(summary?.avg_transaction_value ?? 0)}`}
                />
              </View>
              <RoleGate allowedRoles={['owner']}>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                  <MetricCard
                    label="Business Net Worth"
                    value={fmt(totalStockValue)}
                    icon="briefcase"
                    color={COLORS.accent}
                    subtext="Total selling prices of all stock"
                  />
                  <MetricCard
                    label="Stock Items"
                    value={fmtCount(totalStockItems)}
                    icon="package"
                    color={COLORS.info}
                    subtext="Total items in inventory"
                  />
                </View>
              </RoleGate>
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
                    formatValue={fmt}
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
                  data={salesTrend.map((point) => ({ label: point.label, value: point.revenue }))}
                  formatValue={fmt}
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
                              {fmt(product.total_revenue)} revenue
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
                </View>
              )}
            </Card>

            {bottomProducts.length > 0 ? (
              <Card>
                <SectionHeader title="Slow Moving Products" />
                <View style={{ gap: 10 }}>
                  {bottomProducts.map((product) => (
                    <View
                      key={product.product_id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary, flex: 1 }} numberOfLines={1}>
                        {product.product_name}
                      </Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
                          {fmtCount(product.total_qty)} sold
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>
                          {fmt(product.total_revenue)} revenue
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            <Card>
              <SectionHeader title="Expense Breakdown" />
              {expenseBreakdown.length === 0 ? (
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, paddingVertical: 12, textAlign: 'center' }}>
                  No expenses recorded in this period
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                  <DonutChart data={expensePieData} centerLabel={fmt(totalExpenses)} centerSubLabel="Total" />
                  <View style={{ flex: 1 }}>
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
                <View style={{ gap: 14 }}>
                  {[
                    {
                      label: 'Profit Margin',
                      value: `${((summary.total_profit / summary.total_revenue) * 100).toFixed(1)}%`,
                      pct: summary.total_profit / summary.total_revenue,
                      color: COLORS.success,
                      good: summary.total_profit / summary.total_revenue > 0.15,
                    },
                    {
                      label: 'Expense Ratio',
                      value: `${((summary.total_expenses / summary.total_revenue) * 100).toFixed(1)}%`,
                      pct: summary.total_expenses / summary.total_revenue,
                      color: COLORS.danger,
                      good: summary.total_expenses / summary.total_revenue < 0.4,
                    },
                  ].map((metric) => (
                    <View key={metric.label}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{metric.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>{metric.value}</Text>
                          <Feather
                            name={metric.good ? 'check-circle' : 'alert-triangle'}
                            size={12}
                            color={metric.good ? COLORS.success : COLORS.warning}
                          />
                        </View>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#F3F4F6' }}>
                        <View
                          style={{
                            height: 8,
                            backgroundColor: metric.color,
                            width: `${Math.min(100, Math.abs(metric.pct) * 100)}%`,
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
