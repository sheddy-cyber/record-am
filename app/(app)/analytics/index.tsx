import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { useAuthStore } from '@/store/authStore';
import { DateRange, useAnalyticsStore } from '@/store/analyticsStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { BarChart, ChartLegend, DonutChart, LineChart } from '@/components/charts';
import { PermissionDenied, Pill, Skeleton } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from "@/constants";
import { Product } from '@/types';
import { format, subMonths } from 'date-fns';
import { useBusinessStore } from '@/store/businessStore';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';

const STATIC_RANGES: { key: DateRange; label: string }[] = [
  { key: '7days', label: 'Last 7 days' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: '30days', label: 'Last 30 days' },
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

const EXPENSE_COLORS = [...COLORS.chart, '#B5577A', '#4E9184'];

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

  const canViewAnalytics = hasPermission(userRole, 'analytics.view');

  const load = useCallback(async () => {
    if (canViewAnalytics && currentBusiness && currentBranch) {
      await fetchAnalytics(currentBusiness.id, currentBranch.id);
    }
  }, [canViewAnalytics, currentBusiness, currentBranch, fetchAnalytics]);

  // The pull-to-refresh spinner reflects only a pull, never background refreshes.
  const [pulling, setPulling] = useState(false);
  const onPull = useCallback(async () => {
    setPulling(true);
    try {
      await load();
    } finally {
      setPulling(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load, dateRange]);

  useRealtimeRefresh({
    channelName: `analytics-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(canViewAnalytics && currentBusiness && currentBranch),
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
  const totalDiscounts = summary?.total_discounts ?? 0;
  const totalTransactions = summary?.total_transactions ?? 0;
  const avgTransaction = summary?.avg_transaction_value ?? 0;
  const stockItems = summary?.historical_stock_items ?? 0;
  const stockValue = summary?.historical_stock_value ?? 0;

  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const expenseRatioPct = revenue > 0 ? (totalExpenses / revenue) * 100 : 0;
  const discountRatioPct = (revenue + totalDiscounts) > 0 ? (totalDiscounts / (revenue + totalDiscounts)) * 100 : 0;
  const isProfitable = netProfit >= 0;

  if (!canViewAnalytics) {
    return (
      <ScreenShell backgroundColor={COLORS.surface}>
        <ScreenHeader
          title="Analytics"
         
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Analytics is restricted"
          description="Sales trends, profit, and business insights are available to owners only."
        />
      </ScreenShell>
    );
  }

  const growth = summary?.revenue_growth;
  const isOwner = userRole === 'owner';

  return (
    <ScreenShell>
      <ScreenHeader
        title="Analytics"
        large
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        subtitle={currentBranch?.name ? `${currentBranch.name} branch` : undefined}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: SP.page, paddingBottom: 12 }}
      >
        {DATE_RANGES.map((range) => (
          <Pill key={range.key} label={range.label} active={dateRange === range.key} onPress={() => setDateRange(range.key)} />
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingTop: 8, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={COLORS.text.muted} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !summary ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Skeleton width={120} height={14} />
            <Skeleton width={220} height={40} radius={10} />
            <Skeleton width={180} height={14} />
            <Skeleton height={180} radius={18} style={{ marginTop: 20 }} />
          </View>
        ) : (
          <>
            {/* ── Revenue ─────────────────────────────────────────── */}
            <Text style={styles.label}>Revenue</Text>
            <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>
              {formatFullCurrency(revenue)}
            </Text>
            <View style={styles.heroMeta}>
              {growth !== undefined && growth !== 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon
                    name={growth >= 0 ? 'arrow-up-right' : 'arrow-down-right'}
                    size={14}
                    color={growth >= 0 ? COLORS.successText : COLORS.dangerText}
                    strokeWidth={2.2}
                  />
                  <Text style={[styles.metaText, { color: growth >= 0 ? COLORS.successText : COLORS.dangerText }]}>
                    {Math.abs(growth).toFixed(1)}% vs previous period
                  </Text>
                </View>
              ) : (
                <Text style={styles.metaText}>Cash collected from sales and debt payments</Text>
              )}
            </View>

            {/* ── Where the money went ────────────────────────────── */}
            <Text style={styles.section}>Where the money went</Text>
            <View style={styles.group}>
              <Row label="Gross profit" detail={`${grossMarginPct.toFixed(0)}% margin on goods sold`} value={formatFullCurrency(grossProfit)} />
              <Row
                label="Discounts given"
                detail={`${discountRatioPct.toFixed(0)}% of sales value`}
                value={totalDiscounts > 0 ? `−${formatFullCurrency(totalDiscounts)}` : formatFullCurrency(0)}
              />
              <Row
                label="Expenses"
                detail={`${expenseRatioPct.toFixed(0)}% of revenue`}
                value={totalExpenses > 0 ? `−${formatFullCurrency(totalExpenses)}` : formatFullCurrency(0)}
              />
              <Row
                label={isProfitable ? 'Net profit' : 'Net loss'}
                detail={`${netMarginPct.toFixed(1)}% of revenue`}
                value={formatFullCurrency(netProfit, { showSign: true })}
                tone={isProfitable ? 'good' : 'bad'}
                strong
                last
              />
            </View>

            {/* ── Activity ────────────────────────────────────────── */}
            <View style={[styles.group, { marginTop: 12 }]}>
              <Row
                label="Sales"
                detail={`Average ${formatFullCurrency(avgTransaction)} per sale`}
                value={formatFullCount(totalTransactions)}
                last={!isOwner}
              />
              {isOwner ? (
                <Row label="Stock on hand" detail={`${formatFullCount(stockItems)} units at selling price`} value={formatFullCurrency(stockValue)} last />
              ) : null}
            </View>

            {/* ── Trend ───────────────────────────────────────────── */}
            <Text style={styles.section}>Revenue and profit</Text>
            <View style={styles.card}>
              {salesTrend.length === 0 ? (
                <Text style={styles.empty}>No sales in this period.</Text>
              ) : (
                <>
                  <LineChart data={barData} showSecondary color={COLORS.ink} secondaryColor={COLORS.accent} />
                  <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                    <Legend color={COLORS.ink} label="Revenue" />
                    <Legend color={COLORS.accent} label="Profit" dashed />
                  </View>
                </>
              )}
            </View>

            <Text style={styles.section}>Sales per day</Text>
            <View style={styles.card}>
              {salesTrend.length === 0 ? (
                <Text style={styles.empty}>No sales in this period.</Text>
              ) : (
                <BarChart
                  data={salesTrend.map((point) => ({ label: point.label, value: point.transactions }))}
                  formatValue={(v) => Math.round(v).toString()}
                  color={COLORS.text.faint}
                />
              )}
            </View>

            {/* ── Best sellers ───────────────────────────────────── */}
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>Best sellers</Text>
              {topProducts.length > 0 ? (
                <Text style={styles.link} onPress={() => router.push('/(app)/analytics/products' as any)}>
                  All products
                </Text>
              ) : null}
            </View>
            <View style={styles.group}>
              {topProducts.length === 0 ? (
                <Text style={styles.empty}>Nothing sold in this period.</Text>
              ) : (
                topProducts.map((product, index) => {
                  const maxQty = topProducts[0].total_qty || 1;
                  return (
                    <View key={product.product_id} style={[styles.rankRow, index < topProducts.length - 1 && styles.divider]}>
                      <Text style={styles.rank}>{index + 1}</Text>
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                          <Text style={styles.rowLabel} numberOfLines={1}>
                            {product.product_name}
                          </Text>
                          <Text style={styles.rowValue}>{fmtCount(product.total_qty)} sold</Text>
                        </View>
                        <View style={styles.track}>
                          <View style={[styles.fill, { width: `${Math.max(4, (product.total_qty / maxQty) * 100)}%` }]} />
                        </View>
                        <Text style={styles.rowDetail}>
                          {fmt(product.total_revenue)} revenue · {fmt(product.total_profit)} profit
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* ── Expenses ────────────────────────────────────────── */}
            <Text style={styles.section}>Expenses by category</Text>
            <View style={styles.card}>
              {expenseBreakdown.length === 0 ? (
                <Text style={styles.empty}>No expenses in this period.</Text>
              ) : (
                <View style={{ alignItems: 'center', gap: 18 }}>
                  <DonutChart data={expensePieData} size={176} thickness={22} centerLabel={fmt(totalExpenses)} centerSubLabel="total" />
                  <View style={{ alignSelf: 'stretch' }}>
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
            </View>
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function Row({
  label,
  detail,
  value,
  tone,
  strong,
  last,
}: {
  label: string;
  detail?: string;
  value: string;
  tone?: 'good' | 'bad';
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.rowLabel, strong && { fontFamily: FONT.semiBold }]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Text
        style={[
          styles.rowValue,
          strong && { fontSize: 17 },
          tone === 'good' && { color: COLORS.successText },
          tone === 'bad' && { color: COLORS.dangerText },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.text.secondary }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary },
  hero: { fontSize: 44, lineHeight: 52, fontFamily: FONT.display, color: COLORS.text.primary, letterSpacing: -1.1, fontVariant: ['tabular-nums'] },
  heroMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  metaText: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.muted },
  section: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3, marginTop: 28, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 28, marginBottom: 10 },
  link: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.accentDark },
  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, minHeight: 58 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rowLabel: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.primary, flexShrink: 1 },
  rowDetail: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  rowValue: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  rankRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rank: { width: 18, fontSize: 15, fontFamily: FONT.display, color: COLORS.text.muted, textAlign: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: COLORS.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: COLORS.accent },
  empty: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center', paddingVertical: 22 },
});
