import { useCallback } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { confirmModal } from '@/components/ui';

export function useConfirmSignOut() {
  const { signOut } = useAuthStore();

  return useCallback(async () => {
    const confirmed = await confirmModal({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your account?',
      confirmText: 'Sign Out',
      cancelText: 'Cancel',
      type: 'danger',
      icon: 'log-out',
    });

    if (confirmed) {
      await signOut();
      router.replace('/(auth)/login');
    }
  }, [signOut]);
}

