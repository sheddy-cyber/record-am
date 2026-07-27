import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, formatDistanceToNow } from 'date-fns';
import { useTabStore } from '@/store/tabStore';
import {
  InAppNotification,
  NotificationType,
  useNotificationStore,
} from '@/store/notificationStore';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { Card, IconBox, EmptyState } from '@/components/ui';
import { COLORS, FONT, RADIUS, SP } from '@/constants';

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: keyof typeof Feather.glyphMap; bg: string; color: string }
> = {
  mismatch: {
    icon: 'alert-triangle',
    bg: COLORS.warningLight,
    color: COLORS.warning,
  },
  low_stock: {
    icon: 'package',
    bg: 'rgba(231, 76, 60, 0.12)',
    color: COLORS.danger,
  },
  debt_reminder: {
    icon: 'credit-card',
    bg: 'rgba(241, 196, 15, 0.12)',
    color: '#D4AC0D',
  },
  daily_summary: {
    icon: 'pie-chart',
    bg: 'rgba(0, 78, 137, 0.1)',
    color: COLORS.ink,
  },
  system: {
    icon: 'bell',
    bg: COLORS.surface2,
    color: COLORS.text.secondary,
  },
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
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
      await loadNotifications();
    } catch (_) {}
    setRefreshing(false);
  }, [loadNotifications]);

  useEffect(() => {
    loadNotifications();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationPress = async (item: InAppNotification) => {
    if (!item.read) {
      await markAsRead(item.id);
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

  const getTimeLabel = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        return formatDistanceToNow(date, { addSuffix: true });
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
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
        right={
          notifications.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={markAllAsRead}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: RADIUS.sm,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: FONT.medium,
                  color: COLORS.text.inverse,
                }}
              >
                Read All
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: SP.page,
          gap: 16,
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
        {/* Header summary bar */}
        {notifications.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: FONT.medium,
                color: COLORS.text.muted,
              }}
            >
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'All notifications read'}
            </Text>

            <TouchableOpacity activeOpacity={0.7} onPress={clearAll}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONT.medium,
                  color: COLORS.danger,
                }}
              >
                Clear all
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Notifications List */}
        {!isLoaded ? null : notifications.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon="bell-off"
              title="No Notifications"
              description="You have no notifications yet. Stock alerts, mismatch warnings, and reminders will appear here."
            />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {notifications.map((item) => {
              const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleNotificationPress(item)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Card
                    style={{
                      padding: 16,
                      backgroundColor: item.read
                        ? COLORS.card
                        : 'rgba(255, 107, 53, 0.04)',
                      borderColor: item.read
                        ? COLORS.border
                        : 'rgba(255, 107, 53, 0.3)',
                      borderWidth: item.read ? 1 : 1.5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          backgroundColor: config.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 2,
                        }}
                      >
                        <Feather
                          name={config.icon}
                          size={20}
                          color={config.color}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: item.read ? FONT.medium : FONT.bold,
                              color: COLORS.text.primary,
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            {item.title}
                          </Text>

                          {!item.read ? (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: COLORS.accent,
                              }}
                            />
                          ) : null}
                        </View>

                        <Text
                          style={{
                            fontSize: 14,
                            fontFamily: FONT.regular,
                            color: COLORS.text.secondary,
                            lineHeight: 20,
                            marginBottom: 8,
                          }}
                        >
                          {item.body}
                        </Text>

                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: FONT.regular,
                              color: COLORS.text.muted,
                            }}
                          >
                            {getTimeLabel(item.createdAt)}
                          </Text>

                          <TouchableOpacity
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            onPress={() => deleteNotification(item.id)}
                          >
                            <Feather
                              name="trash-2"
                              size={14}
                              color={COLORS.text.muted}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}
