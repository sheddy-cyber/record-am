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
      <Stack.Screen name="record-sale" />
      <Stack.Screen name="add-stock" />
      <Stack.Screen name="record-expense" />
      <Stack.Screen name="record-debt" />
      <Stack.Screen name="update-stock" />
      <Stack.Screen name="record-payment" />
      <Stack.Screen name="record-purchase" />
      <Stack.Screen name="close-day" />
      <Stack.Screen name="customer-create" />
      <Stack.Screen name="customer-edit" />
      <Stack.Screen name="customer-detail" />
      <Stack.Screen name="supplier-create" />
      <Stack.Screen name="supplier-edit" />
      <Stack.Screen name="supplier-detail" />
    </Stack>
  );
}
