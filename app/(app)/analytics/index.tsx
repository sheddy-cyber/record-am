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

const formatFullCurrency = (val: number, options?: { showSign?: boolean }) => {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (isNegative) {
    return `-${CURRENCY_SYMBOL}${formatted}`;
  }
  if (options?.showSign && val > 0) {
    return `+${CURRENCY_SYMBOL}${formatted}`;
  }
  return `${CURRENCY_SYMBOL}${formatted}`;
};

const formatFullCount = (val: number) => {
  const rounded = Math.round(val);
  return rounded.toLocaleString('en-NG');
};

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

  const revenue = summary?.total_revenue ?? 0;
  const grossProfit = summary?.gross_profit ?? 0;
  const netProfit = summary?.net_profit ?? 0;
  const totalExpenses = summary?.total_expenses ?? 0;
  const totalTransactions = summary?.total_transactions ?? 0;
  const avgTransaction = summary?.avg_transaction_value ?? 0;
  const stockItems = summary?.historical_stock_items ?? 0;
  const stockValue = summary?.historical_stock_value ?? 0;

  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const expenseRatioPct = revenue > 0 ? (totalExpenses / revenue) * 100 : 0;
  const isProfitable = netProfit >= 0;

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
            <View style={{ gap: 14 }}>
              <SectionHeader
                title="Financial Overview"
                color={COLORS.text.secondary}
                style={{ fontFamily: FONT.bold }}
              />

              {/* Master Hero Card: Total Revenue & Net Profit */}
              <Card style={{ padding: 20 }}>
                {/* Revenue Header & Figure */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          backgroundColor: COLORS.ink + '12',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="trending-up" size={13} color={COLORS.ink} />
                      </View>
                      <Text
                        style={{
                          fontFamily: FONT.bold,
                          fontSize: 11,
                          letterSpacing: 0.8,
                          color: COLORS.text.secondary,
                          textTransform: 'uppercase',
                        }}
                      >
                        Total Revenue
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 28,
                        fontFamily: FONT.bold,
                        color: COLORS.text.primary,
                        letterSpacing: -0.5,
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatFullCurrency(revenue)}
                    </Text>

                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                      Gross cash collected from completed sales
                    </Text>
                  </View>

                  {summary?.revenue_growth !== undefined && summary.revenue_growth !== 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: summary.revenue_growth >= 0 ? '#EAFBF1' : '#FEF3F2',
                        borderColor: summary.revenue_growth >= 0 ? '#A6F4C5' : '#FECDCA',
                        borderWidth: 1,
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        gap: 4,
                      }}
                    >
                      <Feather
                        name={summary.revenue_growth >= 0 ? 'arrow-up-right' : 'arrow-down-right'}
                        size={12}
                        color={summary.revenue_growth >= 0 ? '#027A48' : '#B42318'}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.bold,
                          color: summary.revenue_growth >= 0 ? '#027A48' : '#B42318',
                        }}
                      >
                        {summary.revenue_growth >= 0 ? '+' : ''}{summary.revenue_growth.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>

                {/* Net Profit Spotlight Banner */}
                <View
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: RADIUS.md,
                    backgroundColor: isProfitable ? '#F0FDF4' : '#FEF2F2',
                    borderWidth: 1,
                    borderColor: isProfitable ? '#BBF7D0' : '#FECACA',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather
                        name={isProfitable ? 'check-circle' : 'alert-circle'}
                        size={14}
                        color={isProfitable ? '#16A34A' : '#DC2626'}
                      />
                      <Text
                        style={{
                          fontFamily: FONT.bold,
                          fontSize: 11,
                          color: isProfitable ? '#15803D' : '#B91C1C',
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                        }}
                      >
                        {isProfitable ? 'Net Profit' : 'Net Deficit'}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.full,
                        backgroundColor: isProfitable ? '#DCFCE7' : '#FEE2E2',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.bold,
                          color: isProfitable ? '#15803D' : '#B91C1C',
                        }}
                      >
                        {netMarginPct.toFixed(1)}% net margin
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={{
                      fontSize: 22,
                      fontFamily: FONT.bold,
                      color: isProfitable ? '#15803D' : '#DC2626',
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatFullCurrency(netProfit, { showSign: true })}
                  </Text>

                  <Text
                    style={{
                      fontFamily: FONT.regular,
                      fontSize: 11,
                      color: isProfitable ? '#166534' : '#991B1B',
                      marginTop: 2,
                    }}
                  >
                    {isProfitable
                      ? 'Clear take-home earnings after product costs & operating expenses'
                      : 'Total product costs and business expenses exceeded sales revenue'}
                  </Text>
                </View>
              </Card>

              {/* Breakdown Card: Gross Profit & Operating Expenses */}
              <Card style={{ padding: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      backgroundColor: COLORS.ink + '12',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="sliders" size={13} color={COLORS.ink} />
                  </View>
                  <Text
                    style={{
                      fontFamily: FONT.bold,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      color: COLORS.text.secondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Cost & Profit Flow
                  </Text>
                </View>

                {/* Gross Profit Item */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: COLORS.accent + '15',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="pie-chart" size={17} color={COLORS.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>
                        Gross Profit
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                        Revenue minus goods cost
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.text.primary }}
                      numberOfLines={1}
                    >
                      {formatFullCurrency(grossProfit)}
                    </Text>
                    <View
                      style={{
                        backgroundColor: COLORS.accentLight,
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        marginTop: 2,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 10, color: COLORS.accentMuted }}>
                        {grossMarginPct.toFixed(0)}% gross margin
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 14 }} />

                {/* Operating Expenses Item */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: COLORS.danger + '14',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="arrow-down-left" size={17} color={COLORS.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>
                        Operating Expenses
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                        Overhead, bills & running costs
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.danger }}
                      numberOfLines={1}
                    >
                      {formatFullCurrency(totalExpenses)}
                    </Text>
                    <View
                      style={{
                        backgroundColor: COLORS.dangerLight,
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        marginTop: 2,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 10, color: COLORS.danger }}>
                        {expenseRatioPct.toFixed(0)}% of revenue
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Activity & Valuation Card */}
              <Card style={{ padding: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      backgroundColor: COLORS.ink + '12',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="layers" size={13} color={COLORS.ink} />
                  </View>
                  <Text
                    style={{
                      fontFamily: FONT.bold,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      color: COLORS.text.secondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Activity & Valuation
                  </Text>
                </View>

                {/* Sales Transactions Item */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: COLORS.ink + '12',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="shopping-bag" size={17} color={COLORS.ink} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>
                        Total Transactions
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                        Avg ticket: {formatFullCurrency(avgTransaction)} / sale
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.text.primary }} numberOfLines={1}>
                      {formatFullCount(totalTransactions)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                      sale{totalTransactions === 1 ? '' : 's'} recorded
                    </Text>
                  </View>
                </View>

                <RoleGate allowedRoles={['owner']}>
                  <React.Fragment>
                    <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 14 }} />

                    {/* Stock Valuation Item */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            backgroundColor: COLORS.warning + '16',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="package" size={17} color={COLORS.warning} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>
                            Stock Net Worth
                          </Text>
                          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                            {formatFullCount(stockItems)} total items in stock
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.text.primary }}
                          numberOfLines={1}
                        >
                          {formatFullCurrency(stockValue)}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 1 }}>
                          est. catalog value
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                </RoleGate>
              </Card>
            </View>

            <Card style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: COLORS.ink + '12',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="trending-up" size={13} color={COLORS.ink} />
                </View>
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: COLORS.text.secondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Revenue And Profit Trend
                </Text>
              </View>
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

            <Card style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: COLORS.ink + '12',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="bar-chart-2" size={13} color={COLORS.ink} />
                </View>
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: COLORS.text.secondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Daily Sales Volume
                </Text>
              </View>
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

            <Card style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: COLORS.ink + '12',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="award" size={13} color={COLORS.ink} />
                </View>
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: COLORS.text.secondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Top Selling Products
                </Text>
              </View>
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
                                borderColor: COLORS.ink + '20',
                                backgroundColor: COLORS.ink + '12',
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

            <Card style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: COLORS.ink + '12',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="pie-chart" size={13} color={COLORS.ink} />
                </View>
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: COLORS.text.secondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Expense Breakdown
                </Text>
              </View>
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
              <Card style={{ padding: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      backgroundColor: COLORS.ink + '12',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="activity" size={13} color={COLORS.ink} />
                  </View>
                  <Text
                    style={{
                      fontFamily: FONT.bold,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      color: COLORS.text.secondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Business Health
                  </Text>
                </View>
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
