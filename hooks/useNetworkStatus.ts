import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { useOfflineStore } from '@/store/offlineStore';

export interface NetworkStatus {
  isOnline: boolean;
  isConnected: boolean | null;
  type: string | null;
  isInternetReachable: boolean | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: true,
    isConnected: null,
    type: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? false;
      setNetworkStatus({
        isOnline: online,
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable,
      });
      useOfflineStore.getState().setOnline(online);
      void useOfflineStore.getState().updatePendingCount();
    });

    NetInfo.fetch().then((state) => {
      const online = state.isConnected ?? false;
      setNetworkStatus({
        isOnline: online,
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable,
      });
      useOfflineStore.getState().setOnline(online);
      void useOfflineStore.getState().updatePendingCount();
    });

    return unsubscribe;
  }, []);

  return networkStatus;
}
