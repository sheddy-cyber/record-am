import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENCY_SYMBOL } from '@/constants';
import { supabase } from './supabase';

import { useNotificationStore, NotificationType } from '@/store/notificationStore';
import { useBusinessStore } from '@/store/businessStore';

// ─────────────────────────────────────────────────────────────────
// EXPO GO GUARD
// expo-notifications does not fully work in Expo Go.
// All functions check this flag and silently skip if true.
// ─────────────────────────────────────────────────────────────────
function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

// Configure foreground notification appearance
// Only set this up if not in Expo Go
if (!isExpoGo()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────
// CHANNEL & PERMISSION SETUP
// ─────────────────────────────────────────────────────────────────
export async function ensureNotificationChannel(): Promise<void> {
  if (isExpoGo() || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('record-am', {
      name: 'Record Am Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E2C75B',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  } catch (err) {
    console.log('[notifications] failed to set channel:', err);
  }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (isExpoGo() || !Device.isDevice) return false;

  try {
    await ensureNotificationChannel();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.log('[notifications] permission check failed:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// PERMISSION + TOKEN REGISTRATION
// ─────────────────────────────────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo() || !Device.isDevice) return null;

  try {
    const granted = await ensureNotificationPermissions();
    if (!granted) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    // Silently ignore remote token registration error
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// SCHEDULE LOCAL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────
export async function scheduleDailySummaryNotification(hour = 20, minute = 0) {
  if (isExpoGo()) return;
  try {
    await ensureNotificationPermissions();
    await cancelDailySummaryNotification();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Summary Ready',
        body: "Time to close your books. Tap to review today's balance.",
        data: { type: 'daily_summary', actionRoute: '/(app)/close-day' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: 'record-am',
      },
    });
  } catch (err) {
    console.log('[notifications] scheduleDailySummaryNotification failed:', err);
  }
}

export async function cancelDailySummaryNotification() {
  if (isExpoGo()) return;
  await cancelNotificationsByTag('daily_summary');
}

export async function scheduleLowStockNotification(
  productName: string,
  currentStock: number,
  unit: string,
  productId?: string,
) {
  const isOutOfStock = currentStock <= 0;
  const title = isOutOfStock ? 'Out of Stock Alert' : 'Low Stock Alert';
  const body = isOutOfStock
    ? `${productName} is now out of stock (0 ${unit}).`
    : `${productName} is running low — only ${currentStock} ${unit}(s) left.`;

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type: 'low_stock',
      actionRoute: '/(app)/(tabs)/_inventory',
      data: { product: productName, productId, currentStock },
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'low_stock',
          product: productName,
          productId,
          currentStock,
          actionRoute: '/(app)/(tabs)/_inventory',
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'record-am' } : null,
    });
  } catch (err) {}
}

export async function scheduleDebtReminderNotification(
  customerName: string,
  balance: number,
  daysOverdue: number,
  debtId?: string,
  customerId?: string,
) {
  const fmt = (n: number) => `${CURRENCY_SYMBOL}${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  const title = 'Overdue Debt';
  const body = `${customerName} owes ${fmt(balance)} — ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue.`;

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type: 'debt_reminder',
      actionRoute: '/(app)/(tabs)/_debts',
      data: { customer: customerName, debtId, customerId, type: 'debt_reminder' },
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'debt_reminder',
          customer: customerName,
          debtId,
          customerId,
          actionRoute: '/(app)/(tabs)/_debts',
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'record-am' } : null,
    });
  } catch (err) {}
}

export async function sendImmediateNotification(title: string, body: string, data?: Record<string, unknown>, actionRoute?: string) {
  let type: NotificationType = (data?.type as NotificationType) || 'system';
  if ((data?.type as string) === 'sync_mismatch') {
    type = 'mismatch';
  }

  let route = actionRoute || (data?.actionRoute as string);
  if (!route) {
    if (type === 'mismatch') route = '/(app)/(tabs)/_inventory';
    else if (type === 'low_stock') route = '/(app)/(tabs)/_inventory';
    else if (type === 'debt_reminder') route = '/(app)/(tabs)/_debts';
    else if (type === 'daily_summary') route = '/(app)/close-day';
  }

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type,
      actionRoute: route,
      data,
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...data, type, actionRoute: route },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'record-am' } : null,
    });
  } catch (err) {}
}

// ─────────────────────────────────────────────────────────────────
// CANCEL HELPERS
// ─────────────────────────────────────────────────────────────────
async function cancelNotificationsByTag(tag: string) {
  if (isExpoGo()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if ((notif.content.data as any)?.type === tag) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (err) {
    // Silently ignore
  }
}

export async function cancelAllNotifications() {
  if (isExpoGo()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    // Silently ignore
  }
}

// ─────────────────────────────────────────────────────────────────
// BACKGROUND CHECKS (called on app open)
// ─────────────────────────────────────────────────────────────────
let isCheckingLowStock = false;
let pendingLowStockCheckAgain = false;

export async function checkAndNotifyLowStock(businessId: string, branchId: string) {
  if (!businessId || !branchId) return;

  if (isCheckingLowStock) {
    pendingLowStockCheckAgain = true;
    return;
  }

  isCheckingLowStock = true;
  try {
    await performLowStockCheck(businessId, branchId);
    while (pendingLowStockCheckAgain) {
      pendingLowStockCheckAgain = false;
      await performLowStockCheck(businessId, branchId);
    }
  } finally {
    isCheckingLowStock = false;
    pendingLowStockCheckAgain = false;
  }
}

async function performLowStockCheck(businessId: string, branchId: string) {
  try {
    const storageKey = `record-am:last-low-stock-alert:${businessId}:${branchId}`;
    let alertMap: Record<string, number> = {};
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        alertMap = JSON.parse(raw);
      }
    } catch (_) {
      alertMap = {};
    }

    // Inspect memory store first, fallback to Supabase query, fallback to offline cache
    let products: Array<{
      id: string;
      name: string;
      unit: string;
      reorder_level: number;
      is_active?: boolean;
      is_service?: boolean;
      inventory?: Array<{ quantity: number; branch_id: string }>;
    }> = [];

    const memoryProducts = useBusinessStore
      .getState()
      .products.filter(
        (p) => p.business_id === businessId && p.is_active && !p.is_service,
      );

    if (memoryProducts.length > 0) {
      products = memoryProducts;
    } else {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, unit, reorder_level, is_active, is_service, inventory(quantity, branch_id)')
          .eq('business_id', businessId)
          .eq('is_active', true)
          .eq('is_service', false);

        if (data && data.length > 0) {
          products = data as any;
        }
      } catch (_) {}

      if (products.length === 0) {
        try {
          const { readCachedProducts } = await import('@/lib/offlineStore');
          const cached = await readCachedProducts(businessId);
          products = cached.filter((p) => p.is_active && !p.is_service);
        } catch (_) {}
      }
    }

    if (!products || products.length === 0) return;

    let hasChanged = false;

    for (const product of products) {
      if (product.is_service || product.is_active === false) {
        if (alertMap[product.id] !== undefined) {
          delete alertMap[product.id];
          hasChanged = true;
        }
        continue;
      }

      const inv = (product.inventory as any[])?.find(
        (i: any) => i.branch_id === branchId,
      );
      const qty = inv?.quantity ?? 0;
      const reorderLevel = typeof product.reorder_level === 'number' ? product.reorder_level : 5;
      const lastAlertedQty = alertMap[product.id];

      if (qty <= reorderLevel) {
        if (lastAlertedQty === undefined) {
          // Initial alert: hits low or out of stock for the first time
          await scheduleLowStockNotification(product.name, qty, product.unit, product.id);
          alertMap[product.id] = qty;
          hasChanged = true;
        } else if (qty < lastAlertedQty) {
          // Stock has further depleted!
          await scheduleLowStockNotification(product.name, qty, product.unit, product.id);
          alertMap[product.id] = qty;
          hasChanged = true;
        } else if (qty > lastAlertedQty) {
          // Partially restocked, but still <= reorderLevel
          // Update tracking silently without chiming
          alertMap[product.id] = qty;
          hasChanged = true;
        }
        // If qty === lastAlertedQty: do nothing (SILENT, no chime)
      } else {
        // Healthy stock (above reorder level). Reset alert state
        if (lastAlertedQty !== undefined) {
          delete alertMap[product.id];
          hasChanged = true;
        }
        // Action taken to restock or resolve low stock: mark notification as read
        await useNotificationStore.getState().markLowStockAsRead(product.id, product.name);
      }
    }

    if (hasChanged) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(alertMap));
    }
  } catch (err) {
    console.log('[notifications] checkAndNotifyLowStock error:', err);
  }
}

export async function checkAndNotifyOverdueDebts(businessId: string) {
  if (isExpoGo()) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: debts } = await supabase
      .from('customer_debts')
      .select('id, customer_name, customer_id, balance, due_date')
      .eq('business_id', businessId)
      .neq('status', 'settled')
      .lt('due_date', today)
      .limit(5);

    if (!debts) return;

    const overdueDebtIds = new Set(debts.map((d: any) => d.id));
    const overdueCustomerNames = new Set(
      debts.map((d: any) => d.customer_name?.trim().toLowerCase()).filter(Boolean),
    );

    for (const debt of debts) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(debt.due_date!).getTime()) / 86400000
      );
      await scheduleDebtReminderNotification(
        debt.customer_name,
        debt.balance,
        daysOverdue,
        debt.id,
        debt.customer_id,
      );
    }

    // Auto-resolve unread debt reminders if the customer or debt is no longer overdue
    const unreadDebtNotifs = useNotificationStore.getState().notifications.filter(
      (n) => n.type === 'debt_reminder' && !n.read,
    );
    for (const notif of unreadDebtNotifs) {
      const custName = notif.data?.customer?.trim().toLowerCase();
      const notifDebtId = notif.data?.debtId;
      if (
        (notifDebtId && !overdueDebtIds.has(notifDebtId)) ||
        (custName && !overdueCustomerNames.has(custName))
      ) {
        await useNotificationStore.getState().markAsRead(notif.id);
      }
    }
  } catch (err) {
    // Silently ignore
  }
}

export async function checkAndNotifyDailySummary(businessId: string, branchId: string) {
  try {
    const { getAppSettings, getTimeParts } = await import('@/lib/appSettings');
    const settings = await getAppSettings();
    if (!settings.dailySummaryEnabled) return;

    const reminder = getTimeParts(settings.dailySummaryTime, '20:00');
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setHours(reminder.hour, reminder.minute, 0, 0);

    // Only proceed if current time has reached or passed reminder time
    if (now < scheduledAt) return;

    const targetDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Check if the balance snapshot for today is already closed
    const { getDailyBalanceSnapshot } = await import('@/lib/dailyBalance');
    const snapshot = await getDailyBalanceSnapshot(businessId, branchId, targetDate);
    if (snapshot.summary?.is_closed) {
      // Books are already closed: auto-resolve any daily summary notification for this date
      await useNotificationStore.getState().markDailySummaryAsRead(targetDate);
      return;
    }

    // Check if we have already posted a daily summary notification for today in the store
    const notifications = useNotificationStore.getState().notifications;
    const alreadyNotified = notifications.some((n) => {
      if (n.type !== 'daily_summary') return false;
      if (n.data?.targetDate === targetDate) return true;
      return n.createdAt.slice(0, 10) === targetDate;
    });

    if (alreadyNotified) return;

    await useNotificationStore.getState().addNotification({
      title: 'Daily Summary Ready',
      body: "Time to close your books. Tap to review today's balance.",
      type: 'daily_summary',
      actionRoute: '/(app)/close-day',
      data: {
        type: 'daily_summary',
        targetDate,
      },
    });
  } catch (err) {
    console.log('[notifications] checkAndNotifyDailySummary error:', err);
  }
}
