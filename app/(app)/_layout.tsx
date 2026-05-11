import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AppLayout() {
  const { session, isInitialized } = useAuthStore();

  if (isInitialized && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
