import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, InteractionManager, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';
import { Icon, IconName } from '@/components/icons';
import { Avatar, IconButton, PressableScale, Skeleton } from '@/components/ui';
import { BusinessAvatar } from '@/components/layout';
import { BranchPill, BranchSwitcherSheet } from '@/components/branches/BranchSwitcher';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { canViewFinancialData } from '@/lib/permissions';
import { flushOfflineQueue, retryAllSyncConflicts } from '@/lib/offlineStore';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineStore } from '@/store/offlineStore';
import { useTabStore } from '@/store/tabStore';
import { COLORS, CURRENCY_SYMBOL, FONT, SP, TYPE } from '@/constants';
import { RevenueActivity } from '@/types';

const money = (value: number, decimals = 0) =>
  `${CURRENCY_SYMBOL}${Math.abs(value).toLocaleString('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const QUICK_ACTIONS: { icon: IconName; label: string; route: string; primary?: boolean }[] = [
  { icon: 'receipt', label: 'Sell', route: '/(app)/record-sale', primary: true },
  { icon: 'box', label: 'Add stock', route: '/(app)/add-stock' },
  { icon: 'cash', label: 'Expense', route: '/(app)/record-expense' },
  { icon: 'user', label: 'Debt', route: '/(app)/record-debt' },
];

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name) ?? 'My Business';
  const businessLogoUrl = useAuthStore((s) => s.currentBusiness?.logo_url);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const userRole = useAuthStore((s) => s.userRole);
  const canViewCosts = canViewFinancialData(userRole);
  const firstName = useAuthStore((s) => s.profile?.full_name?.trim().split(/\s+/)[0]);
  const getStockAlerts = useBusinessStore((s) => s.getStockAlerts);

  const unreadCount = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);

  const stats = useDashboardStore((s) => s.stats);
  const recentActivities = useDashboardStore((s) => s.recentActivities);
  const recentDebts = useDashboardStore((s) => s.recentDebts);
  const fetchDashboardData = useDashboardStore((s) => s.fetchDashboardData);
  const revenueVisible = useDashboardStore((s) => s.revenueVisible);
  const toggleRevenueVisibility = useDashboardStore((s) => s.toggleRevenueVisibility);

  const isOnline = useOfflineStore((s) => s.isOnline);
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const conflictCount = useOfflineStore((s) => s.conflictCount);

  const [refreshing, setRefreshing] = useState(false);
  const [branchSheet, setBranchSheet] = useState(false);

  useEffect(() => {
    if (userId) useNotificationStore.getState().loadNotifications(userId);
  }, [userId]);

  useEffect(() => {
    useDashboardStore.getState().loadRevenueVisibility(businessId);
  }, [businessId]);

  const fetchData = useCallback(async () => {
    if (!businessId || !branchId) return;
    await fetchDashboardData(businessId, branchId, getStockAlerts);
    setRefreshing(false);
  }, [businessId, branchId, getStockAlerts, fetchDashboardData]);

  // Refetch when Home becomes the active tab, on mount, and on app resume.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useTabStore.subscribe(
      (state) => state.activeTab,
      (activeTab, prev) => {
        clearTimeout(timer);
        if (activeTab === 'dashboard' && prev !== 'dashboard') {
          timer = setTimeout(() => InteractionManager.runAfterInteractions(() => fetchData()), 150);
        }
      },
    );
    InteractionManager.runAfterInteractions(() => fetchData());
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchData();
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      unsub();
    };
  }, [fetchData]);

  useRealtimeRefresh({
    channelName: `dashboard-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId, canViewCosts],
    tables: [
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'expenses', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'inventory', filter: `branch_id=eq.${branchId}` }] : []),
      ...(canViewCosts && branchId ? [{ table: 'stock_movements', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
      ...(canViewCosts && businessId ? [{ table: 'products', filter: `business_id=eq.${businessId}` }] : []),
      ...(businessId ? [{ table: 'customers', filter: `business_id=eq.${businessId}` }] : []),
    ],
    debounceMs: 500,
    onRefresh: fetchData,
  });

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todaySalesCount = useMemo(
    () =>
      Math.max(
        stats?.today_sales_count ?? 0,
        recentActivities.filter((a) => {
          try {
            return format(new Date(a.created_at), 'yyyy-MM-dd') === todayKey;
          } catch {
            return false;
          }
        }).length,
      ),
    [stats?.today_sales_count, recentActivities, todayKey],
  );

  const outOfStock = stats?.out_of_stock_count ?? 0;
  const lowStock = stats?.low_stock_count ?? 0;
  const outstanding = stats?.outstanding_debts ?? 0;
  const unsynced = pendingCount + conflictCount;
  const overdueDebts = useMemo(
    () => recentDebts.filter((d) => d.due_date && new Date(d.due_date) < new Date() && d.status !== 'settled').length,
    [recentDebts],
  );

  const retrySync = async () => {
    if (conflictCount > 0) await retryAllSyncConflicts();
    await flushOfflineQueue();
    await fetchData();
  };

  // ── Attention list: only what genuinely needs a decision ───────────────────
  const attention: { key: string; icon: IconName; tone: 'danger' | 'warning' | 'neutral'; title: string; detail: string; onPress: () => void }[] = [];
  if (unsynced > 0) {
    attention.push({
      key: 'sync',
      icon: isSyncing ? 'refresh-cw' : 'upload-cloud',
      tone: conflictCount > 0 ? 'danger' : 'neutral',
      title: isSyncing ? 'Syncing your records…' : `${unsynced} ${unsynced === 1 ? 'record' : 'records'} not yet synced`,
      detail: isOnline ? 'Tap to sync now' : 'Will sync when you are back online',
      onPress: retrySync,
    });
  }
  if (outOfStock > 0) {
    attention.push({
      key: 'out',
      icon: 'alert-circle',
      tone: 'danger',
      title: `${outOfStock} ${outOfStock === 1 ? 'product is' : 'products are'} out of stock`,
      detail: 'Restock before customers ask',
      onPress: () => useTabStore.getState().setActiveTab('inventory'),
    });
  }
  if (lowStock > 0) {
    attention.push({
      key: 'low',
      icon: 'box',
      tone: 'warning',
      title: `${lowStock} running low`,
      detail: 'Review stock levels',
      onPress: () => useTabStore.getState().setActiveTab('inventory'),
    });
  }
  if (overdueDebts > 0 || outstanding > 0) {
    attention.push({
      key: 'debts',
      icon: 'clock',
      tone: overdueDebts > 0 ? 'warning' : 'neutral',
      title: overdueDebts > 0 ? `${overdueDebts} overdue ${overdueDebts === 1 ? 'debt' : 'debts'}` : 'Money owed to you',
      detail: revenueVisible ? `${money(outstanding)} outstanding` : 'Outstanding balance hidden',
      onPress: () => router.push('/(app)/debts' as any),
    });
  }

  const todaySales = stats?.today_sales ?? 0;
  const [whole, cents] = money(todaySales, 2).split('.');
  const profit = stats?.today_profit ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            tintColor={COLORS.text.muted}
            colors={[COLORS.accent]}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{format(new Date(), 'EEEE, d MMMM')}</Text>
            <Text style={styles.greeting} numberOfLines={2}>
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 }}>
            {!isOnline ? (
              <IconButton icon="wifi-off" variant="tinted" color={COLORS.danger} onPress={() => router.push('/(app)/settings')} accessibilityLabel="Offline" />
            ) : null}
            <IconButton
              icon="bell"
              variant="outline"
              badge={unreadCount > 0 ? unreadCount : undefined}
              onPress={() => router.push('/(app)/notifications')}
              accessibilityLabel="Notifications"
            />
            <PressableScale onPress={() => router.push('/(app)/settings')} activeScale={0.92} accessibilityLabel="Business settings">
              <BusinessAvatar name={businessName} logoUrl={businessLogoUrl} size={38} />
            </PressableScale>
          </View>
        </View>

        <View style={{ paddingHorizontal: SP.page, marginTop: 10 }}>
          <BranchPill onPress={() => setBranchSheet(true)} />
        </View>

        {/* ── Today ──────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.heroLabel}>Sales today</Text>
            <Pressable
              onPress={() => toggleRevenueVisibility(businessId)}
              hitSlop={12}
              style={({ pressed }) => [styles.eye, pressed && { opacity: 0.6 }]}
              accessibilityLabel={revenueVisible ? 'Hide amounts' : 'Show amounts'}
            >
              <Icon name={revenueVisible ? 'eye' : 'eye-off'} size={17} color={COLORS.text.muted} />
            </Pressable>
          </View>

          {stats === null ? (
            <Skeleton width={190} height={44} radius={10} style={{ marginTop: 10 }} />
          ) : (
            <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
              {revenueVisible ? (
                <>
                  {whole}
                  <Text style={styles.heroCents}>.{cents}</Text>
                </>
              ) : (
                `${CURRENCY_SYMBOL} ••••••`
              )}
            </Text>
          )}

          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText}>
              {todaySalesCount} {todaySalesCount === 1 ? 'sale' : 'sales'}
            </Text>
            {canViewCosts && stats ? (
              <>
                <View style={styles.dot} />
                <Text style={[styles.heroMetaText, { color: profit >= 0 ? COLORS.successText : COLORS.dangerText }]}>
                  {revenueVisible ? `${profit >= 0 ? '+' : '−'}${money(profit)} profit` : '•••• profit'}
                </Text>
              </>
            ) : null}
            {canViewCosts && (stats?.today_expenses ?? 0) > 0 ? (
              <>
                <View style={styles.dot} />
                <Text style={styles.heroMetaText}>
                  {revenueVisible ? `${money(stats?.today_expenses ?? 0)} spent` : '•••• spent'}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ── Quick actions ──────────────────────────────────────────── */}
        <View style={styles.actions}>
          {QUICK_ACTIONS.map((a) => (
            <PressableScale
              key={a.label}
              onPress={() => router.push(a.route as any)}
              activeScale={0.94}
              haptic
              containerStyle={{ flex: 1 }}
              style={[styles.action, a.primary && styles.actionPrimary]}
              accessibilityLabel={a.label}
            >
              <Icon name={a.icon} size={22} color={a.primary ? '#FFFFFF' : COLORS.text.primary} />
              <Text style={[styles.actionLabel, a.primary && { color: '#FFFFFF' }]} numberOfLines={1}>
                {a.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {/* ── Needs attention ────────────────────────────────────────── */}
        {attention.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <View style={styles.group}>
              {attention.map((item, i) => {
                const tint =
                  item.tone === 'danger' ? COLORS.dangerLight : item.tone === 'warning' ? COLORS.warningLight : COLORS.surface2;
                const fg = item.tone === 'danger' ? COLORS.danger : item.tone === 'warning' ? COLORS.warning : COLORS.text.secondary;
                return (
                  <Pressable
                    key={item.key}
                    onPress={item.onPress}
                    style={({ pressed }) => [styles.row, i < attention.length - 1 && styles.rowDivider, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: tint }]}>
                      <Icon name={item.icon} size={17} color={fg} backgroundColor={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.rowDetail} numberOfLines={1}>
                        {item.detail}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={COLORS.text.faint} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ── Recent activity ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            {recentActivities.length > 0 ? (
              <Pressable hitSlop={10} onPress={() => useTabStore.getState().setActiveTab('sales')}>
                {({ pressed }) => <Text style={[styles.link, pressed && { opacity: 0.5 }]}>See all</Text>}
              </Pressable>
            ) : null}
          </View>

          {recentActivities.length === 0 ? (
            <View style={[styles.group, styles.empty]}>
              <Icon name="receipt" size={22} color={COLORS.text.faint} />
              <Text style={styles.emptyTitle}>No sales yet today</Text>
              <Text style={styles.emptyText}>When you record a sale or a customer pays a debt, it shows up here.</Text>
            </View>
          ) : (
            <View style={styles.group}>
              {recentActivities.slice(0, 8).map((activity, i, list) => (
                <ActivityRow key={`${activity.kind}-${activity.id}`} activity={activity} hidden={!revenueVisible} last={i === list.length - 1} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <BranchSwitcherSheet visible={branchSheet} onClose={() => setBranchSheet(false)} />
    </View>
  );
}

const ActivityRow = React.memo(function ActivityRow({
  activity,
  hidden,
  last,
}: {
  activity: RevenueActivity;
  hidden: boolean;
  last: boolean;
}) {
  const isRepayment = activity.kind === 'debt_repayment';
  const method =
    activity.payment_method === 'mixed'
      ? 'Split payment'
      : activity.payment_method === 'pos'
      ? 'POS'
      : (activity.payment_method?.replace('_', ' ') || 'cash').replace(/^\w/, (c) => c.toUpperCase());
  let time = '';
  try {
    time = format(new Date(activity.created_at), 'h:mm a');
  } catch {}

  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Avatar name={activity.customer_name || 'Walk-in'} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {activity.customer_name || 'Walk-in customer'}
        </Text>
        <Text style={styles.rowDetail} numberOfLines={1}>
          {isRepayment ? 'Debt payment' : activity.items_summary || 'Sale'} · {time}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[styles.amount, isRepayment && { color: COLORS.successText }]}>
          {hidden ? '••••' : `+${money(activity.amount_paid)}`}
        </Text>
        <Text style={[styles.rowDetail, activity.amount_owed > 0 && { color: COLORS.dangerText }]} numberOfLines={1}>
          {activity.amount_owed > 0 ? (hidden ? 'Owes ••••' : `Owes ${money(activity.amount_owed)}`) : method}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SP.page, gap: 12 },
  date: { ...TYPE.footnote, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 4 },
  greeting: { ...TYPE.largeTitle, fontSize: 30, lineHeight: 36, color: COLORS.text.primary },

  hero: { marginTop: 22, marginHorizontal: SP.page },
  heroLabel: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary },
  eye: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  heroAmount: {
    fontSize: 46,
    lineHeight: 54,
    fontFamily: FONT.display,
    color: COLORS.text.primary,
    letterSpacing: -1.2,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  heroCents: { fontSize: 26, color: COLORS.text.muted, letterSpacing: -0.4 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  heroMetaText: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary, fontVariant: ['tabular-nums'] },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.text.faint },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: SP.page, marginTop: 24 },
  action: {
    height: 84,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  actionPrimary: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  actionLabel: { fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.2 },

  section: { marginTop: 28, paddingHorizontal: SP.page },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3, marginBottom: 10 },
  link: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.accentDark },

  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rowPressed: { backgroundColor: COLORS.surface2 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.15 },
  rowDetail: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  amount: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },

  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 28, gap: 6 },
  emptyTitle: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, marginTop: 4 },
  emptyText: { ...TYPE.callout, color: COLORS.text.muted, textAlign: 'center' },
});

export default React.memo(DashboardScreen);
