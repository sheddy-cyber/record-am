import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'record-am:offline-queue:v1';
const CONFLICTS_KEY = 'record-am:offline-conflicts:v1';

interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  updatePendingCount: () => Promise<void>;
  setLastSyncTime: (time: string | null) => void;
  setLastSyncError: (err: string | null) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  lastSyncTime: null,
  lastSyncError: null,
  setOnline: (online) => set({ isOnline: online }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  updatePendingCount: async () => {
    try {
      const [queueRaw, conflictsRaw] = await Promise.all([
        AsyncStorage.getItem(QUEUE_KEY),
        AsyncStorage.getItem(CONFLICTS_KEY),
      ]);
      const queueParsed = queueRaw ? JSON.parse(queueRaw) : [];
      const conflictsParsed = conflictsRaw ? JSON.parse(conflictsRaw) : [];
      const count = Array.isArray(queueParsed) ? queueParsed.length : 0;
      const conflictCount = Array.isArray(conflictsParsed) ? conflictsParsed.length : 0;
      const latestError =
        Array.isArray(queueParsed) && queueParsed.length > 0
          ? queueParsed.find((m: any) => m?.lastError)?.lastError ?? null
          : Array.isArray(conflictsParsed) && conflictsParsed.length > 0
            ? conflictsParsed[0]?.message ?? null
            : null;
      set({ pendingCount: count, conflictCount, lastSyncError: latestError });
    } catch {
      set({ pendingCount: 0, conflictCount: 0 });
    }
  },
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setLastSyncError: (err) => set({ lastSyncError: err }),
}));
