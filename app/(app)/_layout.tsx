import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useSupplierStore } from '@/store/supplierStore';
import { useBusinessStore } from '@/store/businessStore';
import { LoadingScreen } from '@/components/ui';

import { useDebtStore } from '@/store/debtStore';
import { useSaleStore } from '@/store/saleStore';

function Bootloader({ children }: { children: React.ReactNode }) {
  const { currentBusiness, currentBranch } = useAuthStore();
  const [isBooted, setIsBooted] = useState(false);

  useEffect(() => {
    if (!currentBusiness) {
      // If there's no business yet, we can't boot data. 
      // But we must allow rendering so login/creation screens can show.
      setIsBooted(true);
      return;
    }

    const boot = async () => {
      // 1. Hydrate stores synchronously from AsyncStorage cache (takes ~5-10ms)
      await Promise.all([
        useCustomerStore.getState().hydrateCache(currentBusiness.id),
        useSupplierStore.getState().hydrateCache(currentBusiness.id),
        useBusinessStore.getState().hydrateCache(currentBusiness.id),
        currentBranch && useDebtStore.getState().hydrateCache(currentBusiness.id, currentBranch.id),
        useSaleStore.getState().loadPinnedProductIds(currentBusiness.id),
      ]);
      
      // 2. Allow UI to render with fully loaded cache
      setIsBooted(true);

      // 3. Trigger background network syncs silently (these handle their own errors)
      useCustomerStore.getState().fetchCustomers(currentBusiness.id).catch(() => {});
      useSupplierStore.getState().fetchSuppliers(currentBusiness.id).catch(() => {});
      useBusinessStore.getState().fetchProducts(currentBusiness.id).catch(() => {});
      if (currentBranch) {
        useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id).catch(() => {});
        useSaleStore.getState().loadSoldProductQuantities(currentBusiness.id, currentBranch.id).catch(() => {});
      }
    };

    boot();
  }, [currentBusiness, currentBranch]);

  if (!isBooted) {
    // Show nothing or a splash screen equivalent while cache reads (should be imperceptible)
    return <LoadingScreen message="" />;
  }

  return <>{children}</>;
}

export default function AppLayout() {
  const { session, isInitialized } = useAuthStore();

  if (isInitialized && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Bootloader>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 150 }}>
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
      </Bootloader>
    </View>
  );
}
