import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Purge legacy unscoped notifications once
AsyncStorage.removeItem('record-am:notifications:v1').catch(() => {});

const getNotificationStorageKey = (userId?: string | null): string | null => {
  return userId ? `record-am:notifications:${userId}:v2` : null;
};

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
  activeUserId: string | null;
  isLoaded: boolean;

  // Actions
  loadNotifications: (userId?: string) => Promise<void>;
  addNotification: (
    item: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>,
    userId?: string
  ) => Promise<void>;
  markAsRead: (id: string, userId?: string) => Promise<void>;
  markMismatchAsRead: (mismatchId: string, productId?: string, userId?: string) => Promise<void>;
  markAllAsRead: (userId?: string) => Promise<void>;
  deleteNotification: (id: string, userId?: string) => Promise<void>;
  clearAll: (userId?: string) => Promise<void>;
  reset: () => void;
  getUnreadCount: () => number;
}

async function resolveUserId(explicitUserId?: unknown, currentActiveId?: string | null): Promise<string | null> {
  if (typeof explicitUserId === 'string' && explicitUserId) return explicitUserId;
  if (currentActiveId) return currentActiveId;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  activeUserId: null,
  isLoaded: false,

  loadNotifications: async (userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      set({ activeUserId: resolvedId });

      const storageKey = getNotificationStorageKey(resolvedId);
      if (!storageKey) {
        set({ notifications: [], isLoaded: true });
        return;
      }

      const raw = await AsyncStorage.getItem(storageKey);
      const parsed: InAppNotification[] = raw ? JSON.parse(raw) : [];
      set({ notifications: parsed, isLoaded: true });
    } catch (err) {
      console.error('[notificationStore] loadNotifications failed:', err);
      set({ notifications: [], isLoaded: true });
    }
  },

  addNotification: async (item, userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      if (resolvedId && !get().activeUserId) {
        set({ activeUserId: resolvedId });
      }

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

      const storageKey = getNotificationStorageKey(resolvedId);
      if (storageKey) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[notificationStore] addNotification failed:', err);
    }
  },

  markAsRead: async (id, userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      const updated = get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      set({ notifications: updated });

      const storageKey = getNotificationStorageKey(resolvedId);
      if (storageKey) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[notificationStore] markAsRead failed:', err);
    }
  },

  markMismatchAsRead: async (mismatchId: string, productId?: string, userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      const storageKey = getNotificationStorageKey(resolvedId);

      let current = get().notifications;
      if (!get().isLoaded && storageKey) {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) current = JSON.parse(raw);
      }

      let hasChanges = false;
      const updated = current.map((n) => {
        const isTargetMismatch =
          n.data?.mismatchId === mismatchId ||
          (Boolean(productId) && n.type === 'mismatch' && n.data?.productId === productId);

        if (isTargetMismatch && !n.read) {
          hasChanges = true;
          return { ...n, read: true };
        }
        return n;
      });

      if (hasChanges || !get().isLoaded) {
        set({ notifications: updated, isLoaded: true });
        if (storageKey) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        }
      }
    } catch (err) {
      console.error('[notificationStore] markMismatchAsRead failed:', err);
    }
  },

  markAllAsRead: async (userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      const updated = get().notifications.map((n) => ({ ...n, read: true }));
      set({ notifications: updated });

      const storageKey = getNotificationStorageKey(resolvedId);
      if (storageKey) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[notificationStore] markAllAsRead failed:', err);
    }
  },

  deleteNotification: async (id, userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      const updated = get().notifications.filter((n) => n.id !== id);
      set({ notifications: updated });

      const storageKey = getNotificationStorageKey(resolvedId);
      if (storageKey) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[notificationStore] deleteNotification failed:', err);
    }
  },

  clearAll: async (userId?: string) => {
    try {
      const resolvedId = await resolveUserId(userId, get().activeUserId);
      set({ notifications: [] });

      const storageKey = getNotificationStorageKey(resolvedId);
      if (storageKey) {
        await AsyncStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.error('[notificationStore] clearAll failed:', err);
    }
  },

  reset: () => {
    set({ notifications: [], activeUserId: null, isLoaded: false });
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },
}));
