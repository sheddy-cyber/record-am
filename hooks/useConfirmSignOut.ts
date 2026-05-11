import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export function useConfirmSignOut() {
  const { signOut } = useAuthStore();

  return useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }, [signOut]);
}
