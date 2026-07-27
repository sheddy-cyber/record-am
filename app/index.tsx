import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const { session, currentBusiness } = useAuthStore();

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!currentBusiness) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(app)/(tabs)" />;
}
