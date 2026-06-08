import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Animated } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { useTabStore } from '@/store/tabStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { isDebtSettlementSale } from '@/lib/records';
import { useDashboardStore } from '@/store/dashboardStore';
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

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  // Use ID-only selectors — stable primitives that don't change reference on unrelated store updates
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const profileName = useAuthStore((s) => s.profile?.full_name);
  const getStockAlerts = useBusinessStore((s) => s.getStockAlerts);

  const stats = useDashboardStore((s) => s.stats);
  const recentActivities = useDashboardStore((s) => s.recentActivities);
  const recentDebts = useDashboardStore((s) => s.recentDebts);
  const fetchDashboardData = useDashboardStore((s) => s.fetchDashboardData);
  const [refreshing, setRefreshing] = useState(false);
  const [revenueVisible, setRevenueVisible] = useState(true);

  // Deps are stable primitives (IDs), so this callback only recreates when business/branch actually changes
  const fetchData = useCallback(async () => {
    if (!businessId || !branchId) return;
    await fetchDashboardData(businessId, branchId, getStockAlerts);
    setRefreshing(false);
  }, [businessId, branchId, getStockAlerts, fetchDashboardData]);

  const activeTab = useTabStore((s) => s.activeTab);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      import('react-native').then(({ InteractionManager }) => {
        InteractionManager.runAfterInteractions(() => {
          fetchData();
        });
      });
    }
  }, [activeTab, fetchData]);

  // Refetch handled by activeTab selector above — no focus listener needed

  useRealtimeRefresh({
    channelName: `dashboard-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'expenses', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'inventory', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'stock_movements', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
      ...(businessId ? [{ table: 'products', filter: `business_id=eq.${businessId}` }] : []),
      ...(businessId ? [{ table: 'customers', filter: `business_id=eq.${businessId}` }] : []),
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

  // Render instantly without blocking UI. RefreshControl will indicate background fetching.

  return (
    <SwipeableTabScreen name="dashboard">
    <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
      <ScreenHeader
        title={`${greeting()}`}
        subtitle={`${profileName?.split(' ')[0] ?? 'Boss'} · ${format(new Date(), 'EEE, MMM d')}`}
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
        {/* ── Minimalist Aura Hero ───────────────────────────────────────── */}
        <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 50, paddingHorizontal: SP.page }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Text style={{ ...TYPE.overline, color: 'rgba(239,239,208,0.3)', letterSpacing: 3 }}>
              TODAY'S REVENUE
            </Text>
            <TouchableOpacity onPress={() => setRevenueVisible(!revenueVisible)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name={revenueVisible ? 'eye-off' : 'eye'} size={14} color="rgba(239,239,208,0.3)" />
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontSize: 64,
              fontFamily: FONT.black,
              color: COLORS.accent,
              letterSpacing: -2,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {revenueVisible ? fmtFull(stats?.today_sales ?? 0) : '₦****'}
          </Text>
          {/* Glowing Aura Effect */}
          <View
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: 'rgba(255,107,53,0.1)',
              transform: [{ translateX: -100 }, { translateY: -100 }],
              zIndex: -1,
            }}
          />
        </View>

        {/* ── Quick Actions (Sleek Horizontal Pills) ────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: SP.page, paddingBottom: 30 }}>
          {[
            { icon: 'shopping-cart' as const, label: 'Record Sale', route: '/(app)/record-sale' },
            { icon: 'plus' as const, label: 'Add Stock', route: '/(app)/add-stock' },
            { icon: 'minus' as const, label: 'Expense', route: '/(app)/record-expense' },
            { icon: 'credit-card' as const, label: 'Record Debt', route: '/(app)/record-debt' },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: RADIUS.full,
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Feather name={action.icon} size={16} color={COLORS.text.inverse} />
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.inverse }}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Low stock alert ─────────────────────────────── */}
        {stockAlertMessages.length > 0 ? (
          <TouchableOpacity
            onPress={() => useTabStore.getState().setActiveTab('inventory')}
            activeOpacity={0.7}
            style={{
              marginHorizontal: SP.page,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: 'rgba(239, 68, 68, 0.2)',
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              padding: 14,
              marginBottom: 30,
            }}
          >
            <Feather name="alert-triangle" size={16} color={COLORS.danger} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.danger }}>
                Inventory alert
              </Text>
              {stockAlertMessages.map((message) => (
                <Text key={message} style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.danger }}>
                  {message}
                </Text>
              ))}
            </View>
            <Feather name="chevron-right" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        ) : null}

        {/* ── Ultra-Minimal Recent Activity ─────────────────── */}
        <View style={{ paddingHorizontal: SP.page, paddingBottom: 20 }}>
          <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 20 }}>
            RECENT ACTIVITY
          </Text>
          {recentActivities.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontFamily: FONT.regular, fontSize: 14 }}>No activity today.</Text>
          ) : (
            <View style={{ gap: 24 }}>
              {recentActivities.map((activity) => (
                <View key={`${activity.kind}-${activity.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={activity.kind === 'debt_repayment' ? 'refresh-ccw' : 'check'} size={18} color="rgba(255,255,255,0.7)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontFamily: FONT.medium, color: COLORS.text.inverse }}>
                        {activity.customer_name}
                      </Text>
                      {activity.items_summary ? (
                        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255,255,255,0.35)', marginTop: 3 }} numberOfLines={1}>
                          {activity.items_summary}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                        {format(new Date(activity.created_at), 'h:mm a')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.success }}>
                    +{fmt(activity.amount_paid)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(DashboardScreen);
