import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Animated, Pressable, InteractionManager, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { canViewFinancialData } from '@/lib/permissions';
import { useOfflineStore } from '@/store/offlineStore';
import { useTabStore } from '@/store/tabStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { isDebtSettlementSale } from '@/lib/records';
import { useDashboardStore } from '@/store/dashboardStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Badge, Card, EmptyState, LoadingScreen, SectionHeader, StatCard, PaymentSummary, SmartChip, PressableScale } from '@/components/ui';
import { BrandMark, ScreenShell, ScreenHeader, HeaderAction, BusinessAvatar } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { useNotificationStore } from '@/store/notificationStore';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW, SP, TYPE } from '@/constants';
import { CustomerDebt, DashboardStats, RevenueActivity } from '@/types';

// Formats with 2 decimal places for the hero number
const fmtFull = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Compact format for secondary stats
const fmt = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  // Use ID-only selectors — stable primitives that don't change reference on unrelated store updates
  const userId = useAuthStore((s) => s.user?.id);
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name) ?? 'My Business';
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const userRole = useAuthStore((s) => s.userRole);
  const canViewCosts = canViewFinancialData(userRole);
  const profileName = useAuthStore((s) => s.profile?.full_name);
  const getStockAlerts = useBusinessStore((s) => s.getStockAlerts);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (userId) {
      useNotificationStore.getState().loadNotifications(userId);
    }
  }, [userId]);

  const stats = useDashboardStore((s) => s.stats);
  const recentActivities = useDashboardStore((s) => s.recentActivities);
  const recentDebts = useDashboardStore((s) => s.recentDebts);
  const fetchDashboardData = useDashboardStore((s) => s.fetchDashboardData);
  const revenueVisible = useDashboardStore((s) => s.revenueVisible);
  const toggleRevenueVisibility = useDashboardStore((s) => s.toggleRevenueVisibility);
  const [refreshing, setRefreshing] = useState(false);

  const isOnline = useOfflineStore((s) => s.isOnline);

  useEffect(() => {
    useDashboardStore.getState().loadRevenueVisibility(businessId);
  }, [businessId]);

  // Deps are stable primitives (IDs), so this callback only recreates when business/branch actually changes
  const fetchData = useCallback(async () => {
    if (!businessId || !branchId) return;
    await fetchDashboardData(businessId, branchId, getStockAlerts);
    setRefreshing(false);
  }, [businessId, branchId, getStockAlerts, fetchDashboardData]);

  // Refetch when the dashboard tab becomes active — without subscribing to activeTab
  // (subscribing would re-render this entire heavy component on EVERY tab switch)
  useEffect(() => {
    let fetchTimeout: ReturnType<typeof setTimeout>;
    const unsub = useTabStore.subscribe(
      (state) => state.activeTab,
      (activeTab, prevActiveTab) => {
        // Clear any pending fetch from a previous rapid tap
        clearTimeout(fetchTimeout);
        if (activeTab === 'dashboard' && prevActiveTab !== 'dashboard') {
          // Debounce: wait 150ms before fetching, so rapid tapping through
          // the dashboard tab doesn't queue up multiple network requests
          fetchTimeout = setTimeout(() => {
            InteractionManager.runAfterInteractions(() => {
              fetchData();
            });
          }, 150);
        }
      }
    );
    // Also fetch on initial mount
    InteractionManager.runAfterInteractions(() => {
      fetchData();
    });
    return () => {
      clearTimeout(fetchTimeout);
      unsub();
    };
  }, [fetchData]);

  // Refetch handled by subscribe above — no focus listener needed

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
  const outOfStockCount = stats?.out_of_stock_count ?? 0;
  const lowStockCount = stats?.low_stock_count ?? 0;
  const hasStockAlerts = outOfStockCount > 0 || lowStockCount > 0;

  const todaySalesCount = Math.max(
    stats?.today_sales_count ?? 0,
    recentActivities.filter((a) => {
      try {
        return format(new Date(a.created_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      } catch {
        return false;
      }
    }).length
  );

  // ─── Micro-animations ───────────────────────────────────────────────────────
  const revenueAnim = useRef(new Animated.Value(1)).current;
  const alertAnim = useRef(new Animated.Value(hasStockAlerts ? 1 : 0)).current;

  // Revenue privacy toggle transition
  const isFirstRevenueMount = useRef(true);
  useEffect(() => {
    if (isFirstRevenueMount.current) {
      isFirstRevenueMount.current = false;
      return;
    }
    revenueAnim.setValue(0.8);
    Animated.spring(revenueAnim, {
      toValue: 1,
      speed: 28,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [revenueVisible, revenueAnim]);

  // Stock alert slide entrance
  useEffect(() => {
    if (hasStockAlerts) {
      Animated.spring(alertAnim, {
        toValue: 1,
        bounciness: 6,
        speed: 18,
        useNativeDriver: true,
      }).start();
    } else {
      alertAnim.setValue(0);
    }
  }, [hasStockAlerts, alertAnim]);

  // Render instantly without blocking UI. RefreshControl will indicate background fetching.

  return (
    <SwipeableTabScreen name="dashboard">
      <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
        <ScreenHeader
          title={`${greeting()}`}
          titleStyle={{ fontSize: 21, fontFamily: FONT.bold, letterSpacing: -0.3 }}
          subtitle={`${profileName?.split(' ')[0] ?? 'Boss'} · ${format(new Date(), 'EEE, d MMM')}`}
          theme="dark"
          left={
            <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/(app)/settings')}>
              <BusinessAvatar name={businessName} size={38} />
            </TouchableOpacity>
          }
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!isOnline ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/(app)/settings')}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: RADIUS.full,
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  }}
                >
                  <Feather name="wifi-off" size={15} color={COLORS.danger} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => router.push('/(app)/notifications')}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: RADIUS.full,
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <Feather name="bell" size={17} color="#FFFFFF" />
                {unreadCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      backgroundColor: COLORS.danger,
                      borderRadius: RADIUS.full,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 3,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: COLORS.ink,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 9.5,
                        fontFamily: FONT.bold,
                      }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          }
        />

        <ScrollView
          style={{ flex: 1, backgroundColor: COLORS.surface }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 92 }}
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
          {/* Top overscroll background filler so pulling/bouncing down never exposes a white gap */}
          <View
            style={{
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
              height: 1002,
              backgroundColor: COLORS.ink,
            }}
          />

          {/* ── Executive Hero Card ───────────────────────────────────────── */}
          <View
            style={{
              backgroundColor: COLORS.ink,
              paddingHorizontal: SP.page,
              paddingTop: 8,
              paddingBottom: 24,
              borderBottomLeftRadius: RADIUS.xl,
              borderBottomRightRadius: RADIUS.xl,
            }}
          >
            {/* Balance Card Container */}
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderRadius: RADIUS.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255, 255, 255, 0.12)',
                padding: 20,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ ...TYPE.overline, color: 'rgba(255, 255, 255, 0.65)', letterSpacing: 1.2 }}>
                  TODAY'S REVENUE
                </Text>
                <TouchableOpacity
                  onPress={() => toggleRevenueVisibility(businessId)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: RADIUS.full,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Feather name={revenueVisible ? 'eye' : 'eye-off'} size={12} color="rgba(255, 255, 255, 0.8)" />
                  <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: 'rgba(255, 255, 255, 0.8)' }}>
                    {revenueVisible ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Animated.View style={{ opacity: revenueAnim, transform: [{ scale: revenueAnim }] }}>
                <Text
                  style={{
                    fontSize: 38,
                    fontFamily: FONT.black,
                    color: COLORS.gold,
                    letterSpacing: -1,
                    marginVertical: 4,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {revenueVisible ? (
                    <>
                      {fmtFull(stats?.today_sales ?? 0).split('.')[0]}
                      <Text style={{ fontSize: 24, fontFamily: FONT.bold, letterSpacing: 0, opacity: 0.85 }}>
                        .{fmtFull(stats?.today_sales ?? 0).split('.')[1]}
                      </Text>
                    </>
                  ) : (
                    '₦••••••'
                  )}
                </Text>
              </Animated.View>

              {/* Sub-pulse KPIs */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255, 255, 255, 0.08)',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="shopping-bag" size={13} color="rgba(255, 255, 255, 0.7)" />
                  <Text style={{ fontSize: 12.5, fontFamily: FONT.medium, color: 'rgba(255, 255, 255, 0.85)' }}>
                    {todaySalesCount} {todaySalesCount === 1 ? 'sale' : 'sales'} today
                  </Text>
                </View>

                {canViewCosts && stats?.today_profit !== undefined ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather
                      name={profitPositive ? 'trending-up' : 'trending-down'}
                      size={13}
                      color={profitPositive ? COLORS.success : COLORS.danger}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontFamily: FONT.bold,
                        color: profitPositive ? '#34d399' : '#f87171',
                      }}
                    >
                      {revenueVisible ? `${profitPositive ? '+' : ''}${fmt(stats.today_profit)} profit` : '•••• profit'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* ── Quick Actions Grid ────────────────────── */}
            <View style={{ marginTop: 18, gap: 10 }}>
              {[
                [
                  { icon: 'shopping-cart' as const, label: 'Record Sale', route: '/(app)/record-sale', primary: true },
                  { icon: 'plus-circle' as const, label: 'Add Stock', route: '/(app)/add-stock', primary: false },
                ],
                [
                  { icon: 'minus-circle' as const, label: 'Record Expense', route: '/(app)/record-expense', primary: false },
                  { icon: 'credit-card' as const, label: 'Record Debt', route: '/(app)/record-debt', primary: false },
                ],
              ].map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: 10 }}>
                  {row.map((action) => (
                    <PressableScale
                      key={action.label}
                      onPress={() => router.push(action.route as any)}
                      activeScale={0.95}
                      containerStyle={{ flex: 1 }}
                      style={{
                        flex: 1,
                        width: '100%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 13,
                        paddingHorizontal: 12,
                        borderRadius: RADIUS.md,
                        backgroundColor: action.primary ? COLORS.accent : 'rgba(255, 255, 255, 0.08)',
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: action.primary ? COLORS.accent : 'rgba(255, 255, 255, 0.12)',
                      }}
                    >
                      <Feather name={action.icon} size={15} color={action.primary ? '#000000' : '#FFFFFF'} />
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: FONT.bold,
                          color: action.primary ? '#000000' : '#FFFFFF',
                          letterSpacing: -0.1,
                        }}
                        numberOfLines={1}
                      >
                        {action.label}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              ))}
            </View>
          </View>

          {/* ── Lower Section on Crisp Surface ───────────────────────────── */}
          <View style={{ paddingHorizontal: SP.page, paddingTop: 20 }}>
            {/* ── Inventory Alert / Stock Notice ── */}
            {hasStockAlerts ? (
              <Animated.View
                style={{
                  opacity: alertAnim,
                  transform: [
                    {
                      translateY: alertAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                  ],
                }}
              >
                <PressableScale
                  onPress={() => useTabStore.getState().setActiveTab('inventory')}
                  activeScale={0.97}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    borderRadius: RADIUS.lg,
                    backgroundColor: COLORS.dangerLight,
                    borderWidth: 1,
                    borderColor: '#fecaca',
                    paddingHorizontal: 15,
                    paddingVertical: 13,
                    marginBottom: 18,
                    shadowColor: COLORS.danger,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 6,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: RADIUS.full,
                      backgroundColor: COLORS.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="alert-triangle" size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontSize: 10.5, fontFamily: FONT.bold, color: '#b91c1c', letterSpacing: 0.5 }}>
                      {outOfStockCount > 0 && lowStockCount > 0
                        ? 'STOCK REMINDER'
                        : outOfStockCount > 0
                          ? 'RESTOCK REMINDER'
                          : 'LOW STOCK NOTICE'}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.primary }} numberOfLines={1}>
                      {outOfStockCount > 0 && lowStockCount > 0
                        ? `${outOfStockCount} out of stock · ${lowStockCount} running low`
                        : outOfStockCount > 0
                          ? `${outOfStockCount} product${outOfStockCount === 1 ? ' is' : 's are'} out of stock`
                          : `${lowStockCount} product${lowStockCount === 1 ? ' is' : 's are'} running low`}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                      Tap to review and reorder
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      backgroundColor: '#fee2e2',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: '#fecaca',
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: RADIUS.full,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: '#b91c1c' }}>Restock</Text>
                    <Feather name="arrow-right" size={12} color="#b91c1c" />
                  </View>
                </PressableScale>
              </Animated.View>
            ) : null}

            {/* ── Recent Activity Ledger ─────────────────── */}
            <SectionHeader
              title="Recent Activity"
              action={
                recentActivities.length > 0
                  ? { label: 'View all sales', onPress: () => useTabStore.getState().setActiveTab('sales') }
                  : undefined
              }
            />

            {recentActivities.length === 0 ? (
              <Card style={{ paddingVertical: 28, alignItems: 'center', gap: 8 }}>
                <Feather name="clock" size={24} color={COLORS.text.muted} />
                <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                  No activity recorded today
                </Text>
                <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
                  Transactions and debt settlements made today will appear here in real time.
                </Text>
              </Card>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {recentActivities.map((activity, index) => {
                  const isRepayment = activity.kind === 'debt_repayment';
                  const initials = (activity.customer_name || 'C').charAt(0).toUpperCase();
                  const formattedMethod =
                    activity.payment_method === 'mixed'
                      ? 'Mixed'
                      : activity.payment_method?.replace('_', ' ') || 'Cash';

                  return (
                    <View key={`${activity.kind}-${activity.id}`}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          gap: 12,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: RADIUS.full,
                              backgroundColor: isRepayment ? COLORS.successLight : COLORS.navyLight,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontFamily: FONT.bold,
                                color: isRepayment ? COLORS.success : COLORS.ink,
                              }}
                            >
                              {initials}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text
                                style={{ fontSize: 14.5, fontFamily: FONT.bold, color: COLORS.text.primary, letterSpacing: -0.1 }}
                                numberOfLines={1}
                              >
                                {activity.customer_name}
                              </Text>
                              {isRepayment ? (
                                <View
                                  style={{
                                    backgroundColor: COLORS.successLight,
                                    paddingHorizontal: 5,
                                    paddingVertical: 1.5,
                                    borderRadius: RADIUS.xs,
                                  }}
                                >
                                  <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.success }}>Settlement</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text
                              style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}
                              numberOfLines={1}
                            >
                              {activity.items_summary || (isRepayment ? 'Debt settlement' : 'General sale')}
                              {' · '}
                              {format(new Date(activity.created_at), 'h:mm a')}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: FONT.bold,
                              color: isRepayment ? COLORS.success : COLORS.text.primary,
                              letterSpacing: -0.2,
                            }}
                          >
                            +{fmt(activity.amount_paid)}
                          </Text>
                          {activity.amount_owed > 0 ? (
                            <SmartChip
                              label={`Owes ${fmt(activity.amount_owed)}`}
                              deep
                              variant="danger"
                              size="xs"
                            />
                          ) : (
                            <SmartChip
                              label={formattedMethod}
                              variant="neutral"
                              size="xs"
                            />
                          )}
                        </View>
                      </View>
                      {index < recentActivities.length - 1 ? (
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderSubtle, marginLeft: 66 }} />
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        </ScrollView>
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(DashboardScreen);
