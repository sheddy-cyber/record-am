import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { LoadingScreen } from '@/components/ui';

export default function Index() {
  const { session, currentBusiness, isInitialized, isLoading } = useAuthStore();

  if (!isInitialized || isLoading) {
    return <LoadingScreen message="" />;
  }

  if (!session && !currentBusiness) return <Redirect href="/(auth)/login" />;
  if (!currentBusiness) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(app)/(tabs)" />;
}
