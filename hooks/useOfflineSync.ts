import { useEffect } from 'react';
import { AppState } from 'react-native';
import { flushOfflineQueue, scheduleOfflineSync } from '@/lib/offlineStore';
import { useNetworkStatus } from './useNetworkStatus';

export function useOfflineSync(enabled = true) {
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;

    const sync = () => {
      if (!active || !isOnline) return;
      void flushOfflineQueue();
    };

    if (isOnline) {
      void flushOfflineQueue();
    }

    const interval = setInterval(sync, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isOnline) {
        void flushOfflineQueue();
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, isOnline]);
}
