import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_STORAGE_KEY = 'record-am:notifications:v1';

export type NotificationType =
  | 'mismatch'
  | 'low_stock'
  | 'debt_reminder'
  | 'daily_summary'
  | 'system';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
  actionRoute?: string;
}

interface NotificationState {
  notifications: InAppNotification[];
  isLoaded: boolean;

  // Actions
  loadNotifications: () => Promise<void>;
  addNotification: (
    item: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>
  ) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  getUnreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isLoaded: false,

  loadNotifications: async () => {
    try {
      const raw = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      const parsed: InAppNotification[] = raw ? JSON.parse(raw) : [];
      set({ notifications: parsed, isLoaded: true });
    } catch (err) {
      console.error('[notificationStore] loadNotifications failed:', err);
      set({ notifications: [], isLoaded: true });
    }
  },

  addNotification: async (item) => {
    try {
      const current = get().notifications;
      
      // Deduplicate recent notifications with same title and body within 1 minute
      const isDuplicate = current.some((n) => {
        const isSameContent = n.title === item.title && n.body === item.body;
        const isRecent =
          Date.now() - new Date(n.createdAt).getTime() < 60 * 1000;
        return isSameContent && isRecent;
      });

      if (isDuplicate) return;

      const newNotif: InAppNotification = {
        ...item,
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        read: false,
        createdAt: new Date().toISOString(),
      };

      const updated = [newNotif, ...current];
      set({ notifications: updated });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.error('[notificationStore] addNotification failed:', err);
    }
  },

  markAsRead: async (id) => {
    try {
      const updated = get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      set({ notifications: updated });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.error('[notificationStore] markAsRead failed:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      const updated = get().notifications.map((n) => ({ ...n, read: true }));
      set({ notifications: updated });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.error('[notificationStore] markAllAsRead failed:', err);
    }
  },

  deleteNotification: async (id) => {
    try {
      const updated = get().notifications.filter((n) => n.id !== id);
      set({ notifications: updated });
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.error('[notificationStore] deleteNotification failed:', err);
    }
  },

  clearAll: async () => {
    try {
      set({ notifications: [] });
      await AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    } catch (err) {
      console.error('[notificationStore] clearAll failed:', err);
    }
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },
}));
