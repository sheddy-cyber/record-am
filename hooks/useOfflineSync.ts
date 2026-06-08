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
      scheduleOfflineSync(300);
    }

    const interval = setInterval(sync, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isOnline) {
        scheduleOfflineSync(300);
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, isOnline]);
}
