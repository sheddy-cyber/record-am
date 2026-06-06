import { useEffect } from 'react';
import { AppState } from 'react-native';
import { flushOfflineQueue, scheduleOfflineSync } from '@/lib/offlineStore';

export function useOfflineSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;

    const sync = () => {
      if (!active) return;
      void flushOfflineQueue();
    };

    scheduleOfflineSync(300);
    const interval = setInterval(sync, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        scheduleOfflineSync(300);
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled]);
}
