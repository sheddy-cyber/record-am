import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'record-am:offline-queue:v1';

interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  updatePendingCount: () => Promise<void>;
  setLastSyncTime: (time: string | null) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncTime: null,
  setOnline: (online) => set({ isOnline: online }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  updatePendingCount: async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) {
        set({ pendingCount: 0 });
        return;
      }
      const parsed = JSON.parse(raw);
      const count = Array.isArray(parsed) ? parsed.length : 0;
      set({ pendingCount: count });
    } catch {
      set({ pendingCount: 0 });
    }
  },
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
}));
