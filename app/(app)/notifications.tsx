import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, formatDistanceToNow } from 'date-fns';
import { useTabStore } from '@/store/tabStore';
import { useAuthStore } from '@/store/authStore';
import {
  InAppNotification,
  NotificationType,
  useNotificationStore,
} from '@/store/notificationStore';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { Card, EmptyState, confirmModal } from '@/components/ui';
import { COLORS, FONT, RADIUS, SP } from '@/constants';
import { dismissScreen } from '@/lib/navigation';

const TYPE_CONFIG: Record<
  NotificationType,
  {
    icon: keyof typeof Feather.glyphMap;
    bg: string;
    variant: 'danger' | 'warning' | 'info' | 'success' | 'neutral' | 'primary';
    label: string;
  }
> = {
  low_stock: {
    icon: 'package',
    bg: '#DC2626',
    variant: 'danger',
    label: 'Stock Alert',
  },
  mismatch: {
    icon: 'alert-triangle',
    bg: '#D97706',
    variant: 'warning',
    label: 'Sync Issue',
  },
  debt_reminder: {
    icon: 'credit-card',
    bg: '#004E89',
    variant: 'primary',
    label: 'Debt Notice',
  },
  daily_summary: {
    icon: 'pie-chart',
    bg: '#15803D',
    variant: 'success',
    label: 'Daily Balance',
  },
  system: {
    icon: 'bell',
    bg: '#475569',
    variant: 'neutral',
    label: 'Notice',
  },
};

const getActionLabel = (item: InAppNotification) => {
  const type = (item.type || item.data?.type) as string;
  if (item.actionRoute?.includes('inventory') || type === 'low_stock' || type === 'mismatch' || type === 'sync_mismatch') {
    return 'View Inventory';
  }
  if (item.actionRoute?.includes('debts') || type === 'debt_reminder' || type === 'debt') {
    return 'View Debts';
  }
  if (type === 'daily_summary' || type === 'close_day') {
    return 'Balance Day';
  }
  if (item.data?.customerId) {
    return 'View Customer';
  }
  if (item.data?.supplierId) {
    return 'View Supplier';
  }
  return 'View Details';
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const userId = useAuthStore((s) => s.user?.id);
  const {
    notifications,
    isLoaded,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotificationStore();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNotifications(userId);
    } catch (_) {}
    setRefreshing(false);
  }, [loadNotifications, userId]);

  useEffect(() => {
    loadNotifications(userId);
  }, [loadNotifications, userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [filter, notifications]);

  const handleNotificationPress = async (item: InAppNotification) => {
    if (!item.read) {
      await markAsRead(item.id, userId);
    }

    const type = (item.type || item.data?.type) as string;

    const navigateToTab = (tabKey: 'dashboard' | 'inventory' | 'sales' | 'debts' | 'more', path: string) => {
      useTabStore.getState().setActiveTab(tabKey);
      router.push(path as any);
    };

    if (item.actionRoute) {
      if (item.actionRoute.includes('_inventory')) {
        navigateToTab('inventory', item.actionRoute);
      } else if (item.actionRoute.includes('_debts')) {
        navigateToTab('debts', item.actionRoute);
      } else if (item.actionRoute.includes('_sales')) {
        navigateToTab('sales', item.actionRoute);
      } else if (item.actionRoute.includes('_dashboard')) {
        navigateToTab('dashboard', item.actionRoute);
      } else {
        router.push(item.actionRoute as any);
      }
      return;
    }

    // Fallback navigation based on notification payload/type
    if (type === 'mismatch' || type === 'sync_mismatch') {
      navigateToTab('inventory', '/(app)/(tabs)/_inventory');
    } else if (type === 'low_stock') {
      navigateToTab('inventory', '/(app)/(tabs)/_inventory');
    } else if (type === 'debt_reminder' || type === 'debt') {
      navigateToTab('debts', '/(app)/(tabs)/_debts');
    } else if (type === 'daily_summary' || type === 'close_day') {
      router.push('/(app)/close-day');
    } else if (item.data?.customerId) {
      router.push({ pathname: '/(app)/customer-detail', params: { customerId: String(item.data.customerId) } } as any);
    } else if (item.data?.supplierId) {
      router.push({ pathname: '/(app)/supplier-detail', params: { supplierId: String(item.data.supplierId) } } as any);
    } else if (item.data?.productId) {
      navigateToTab('inventory', '/(app)/(tabs)/_inventory');
    }
  };

  const handleClearAll = async () => {
    const confirmed = await confirmModal({
      title: 'Clear Notifications',
      message: 'Are you sure you want to clear all notifications from your list?',
      confirmText: 'Clear All',
      type: 'danger',
    });
    if (confirmed) {
      await clearAll(userId);
    }
  };

  const getTimeLabel = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        const distance = formatDistanceToNow(date, { addSuffix: true });
        if (distance.toLowerCase().includes('less than a minute')) {
          return 'just now';
        }
        return distance.replace(/^about\s+/i, '').replace(/^almost\s+/i, '');
      }
      return format(date, 'MMM d, h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => markAllAsRead(userId)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: RADIUS.full,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Feather name="check" size={13} color="#FFFFFF" />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: FONT.medium,
                  color: '#FFFFFF',
                }}
              >
                Mark all read
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: SP.page,
          gap: 14,
          paddingBottom: insets.bottom + 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {/* Filter Segmented Pills & Clear Action */}
        {notifications.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 2,
              marginBottom: 4,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setFilter('all')}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 14,
                  height: 32,
                  borderRadius: RADIUS.full,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: filter === 'all' ? COLORS.navy : COLORS.card,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: filter === 'all' ? COLORS.navy : COLORS.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: filter === 'all' ? FONT.bold : FONT.medium,
                    color: filter === 'all' ? '#FFFFFF' : COLORS.text.secondary,
                  }}
                >
                  All ({notifications.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilter('unread')}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 14,
                  height: 32,
                  borderRadius: RADIUS.full,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: filter === 'unread' ? COLORS.navy : COLORS.card,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: filter === 'unread' ? COLORS.navy : COLORS.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: filter === 'unread' ? FONT.bold : FONT.medium,
                      color: filter === 'unread' ? '#FFFFFF' : COLORS.text.secondary,
                    }}
                  >
                    Unread ({unreadCount})
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleClearAll}
              activeOpacity={0.7}
              style={{ paddingVertical: 6, paddingHorizontal: 6 }}
            >
              <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.muted }}>
                Clear all
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Notifications List / Empty States */}
        {!isLoaded ? null : notifications.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon="bell-off"
              title="All caught up"
              description="No notifications yet. Stock alerts, sync warnings, and daily reminders will appear here."
            />
          </View>
        ) : filter === 'unread' && unreadCount === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon="check-circle"
              title="No unread notifications"
              description="You have reviewed all your recent activity and alerts."
              action={{
                label: 'View All Notifications',
                onPress: () => setFilter('all'),
              }}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filteredNotifications.map((item) => {
              const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleNotificationPress(item)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <View
                    style={{
                      backgroundColor: COLORS.card,
                      borderRadius: RADIUS.lg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: item.read ? COLORS.border : COLORS.ink + '35',
                      padding: 15,
                      gap: 12,
                    }}
                  >
                    {/* Top Section: Deep Icon, Title, Indicator & Time */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: RADIUS.md,
                          backgroundColor: config.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name={config.icon} size={18} color="#FFFFFF" />
                      </View>

                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 14.5,
                                fontFamily: item.read ? FONT.medium : FONT.bold,
                                color: COLORS.text.primary,
                                letterSpacing: -0.2,
                              }}
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>
                            {!item.read ? (
                              <View
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 3.5,
                                  backgroundColor: COLORS.accent,
                                }}
                              />
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                            {getTimeLabel(item.createdAt)}
                          </Text>
                        </View>

                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: FONT.regular,
                            color: COLORS.text.secondary,
                            lineHeight: 18,
                          }}
                        >
                          {item.body}
                        </Text>
                      </View>
                    </View>

                    {/* Bottom Row: Action Prompt and Delete Button */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: COLORS.borderSubtle,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={{ fontSize: 11.5, fontFamily: FONT.semiBold, color: COLORS.accentDark }}>
                          {getActionLabel(item)}
                        </Text>
                        <Feather name="arrow-right" size={11} color={COLORS.accentDark} />
                      </View>

                      <TouchableOpacity
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={(e) => {
                          e.stopPropagation();
                          deleteNotification(item.id, userId);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={13} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}
