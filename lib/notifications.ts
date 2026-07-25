import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { CURRENCY_SYMBOL } from '@/constants';
import { supabase } from './supabase';

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
// PERMISSION + TOKEN REGISTRATION
// ─────────────────────────────────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo()) {

    return null;
  }

  if (!Device.isDevice) {

    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {

      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('record-am', {
        name: 'Record Am Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E2C75B',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    // Silently ignore
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// SCHEDULE LOCAL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────
export async function scheduleDailySummaryNotification(hour = 20, minute = 0) {
  if (isExpoGo()) return;
  try {
    await cancelDailySummaryNotification();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Summary Ready',
        body: "Time to close your books. Tap to review today's balance.",
        data: { type: 'daily_summary' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (err) {
    // Silently ignore
  }
}

export async function cancelDailySummaryNotification() {
  if (isExpoGo()) return;
  await cancelNotificationsByTag('daily_summary');
}

import { useNotificationStore, NotificationType } from '@/store/notificationStore';

export async function scheduleLowStockNotification(productName: string, currentStock: number, unit: string) {
  const title = 'Low Stock Alert';
  const body = `${productName} is running low — only ${currentStock} ${unit}(s) left.`;

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type: 'low_stock',
      actionRoute: '/(app)/(tabs)/_inventory',
      data: { product: productName },
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'low_stock', product: productName },
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {}
}

export async function scheduleDebtReminderNotification(customerName: string, balance: number, daysOverdue: number) {
  const fmt = (n: number) => `${CURRENCY_SYMBOL}${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  const title = 'Overdue Debt';
  const body = `${customerName} owes ${fmt(balance)} — ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue.`;

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type: 'debt_reminder',
      actionRoute: '/(app)/(tabs)/_debts',
      data: { customer: customerName },
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'debt_reminder', customer: customerName },
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {}
}

export async function sendImmediateNotification(title: string, body: string, data?: Record<string, unknown>, actionRoute?: string) {
  const type: NotificationType = (data?.type as NotificationType) || 'system';

  try {
    await useNotificationStore.getState().addNotification({
      title,
      body,
      type,
      actionRoute: actionRoute || (data?.actionRoute as string) || undefined,
      data,
    });
  } catch (_) {}

  if (isExpoGo()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
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
export async function checkAndNotifyLowStock(businessId: string, branchId: string) {
  if (isExpoGo()) return;
  try {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, unit, reorder_level, inventory(quantity, branch_id)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('is_service', false);

    if (!products) return;

    for (const product of products) {
      const inv = (product.inventory as any[])?.find((i: any) => i.branch_id === branchId);
      const qty = inv?.quantity ?? 0;
      if (qty <= product.reorder_level && qty > 0) {
        await scheduleLowStockNotification(product.name, qty, product.unit);
      }
    }
  } catch (err) {
    // Silently ignore
  }
}

export async function checkAndNotifyOverdueDebts(businessId: string) {
  if (isExpoGo()) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: debts } = await supabase
      .from('customer_debts')
      .select('customer_name, balance, due_date')
      .eq('business_id', businessId)
      .neq('status', 'settled')
      .lt('due_date', today)
      .limit(5);

    if (!debts) return;

    for (const debt of debts) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(debt.due_date!).getTime()) / 86400000
      );
      await scheduleDebtReminderNotification(debt.customer_name, debt.balance, daysOverdue);
    }
  } catch (err) {
    // Silently ignore
  }
}
