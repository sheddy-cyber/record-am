import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useSupplierStore } from '@/store/supplierStore';
import { useBusinessStore } from '@/store/businessStore';
import { LoadingScreen } from '@/components/ui';

import { useDebtStore } from '@/store/debtStore';
import { useSaleStore } from '@/store/saleStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';
import { readCachedRows, replaceCachedRows } from '@/lib/offlineStore';

function Bootloader({ children }: { children: React.ReactNode }) {
  const { currentBusiness, currentBranch, userRole } = useAuthStore();
  const [isBooted, setIsBooted] = useState(false);
  const hasShownAppRef = useRef(false);
  const canViewCosts = canViewFinancialData(userRole);
  const canViewPurchases = hasPermission(userRole, 'purchases.view');

  useEffect(() => {
    if (!currentBusiness) {
      // If there's no business yet, we can't boot data. 
      // But we must allow rendering so login/creation screens can show.
      setIsBooted(true);
      hasShownAppRef.current = false;
      return;
    }

    let active = true;
    // Re-hydrating for role/permission changes must not unmount the navigator (avoids
    // replaying the current modal route, e.g. record-sale, and spurious GO_BACK errors).
    if (!hasShownAppRef.current) {
      setIsBooted(false);
    }

    const boot = async () => {
      // 1. Hydrate stores synchronously from AsyncStorage cache (takes ~5-10ms)
      await Promise.all([
        useCustomerStore.getState().hydrateCache(currentBusiness.id),
        canViewPurchases
          ? useSupplierStore.getState().hydrateCache(currentBusiness.id)
          : (async () => {
              useSupplierStore.getState().reset();
              await replaceCachedRows({ businessId: currentBusiness.id }, 'suppliers', []);
            })(),
        useBusinessStore.getState().hydrateCache(currentBusiness.id, canViewCosts),
        canViewCosts
          ? Promise.resolve()
          : (async () => {
              const items = await readCachedRows<{ id: string; cost_price?: number }>(
                { businessId: currentBusiness.id },
                'sale_items',
              ).catch(() => []);
              if (items.some((item) => Number(item.cost_price ?? 0) > 0)) {
                await replaceCachedRows(
                  { businessId: currentBusiness.id },
                  'sale_items',
                  items.map((item) => ({ ...item, cost_price: 0 })),
                );
              }
            })(),
        currentBranch && useDebtStore.getState().hydrateCache(currentBusiness.id, currentBranch.id),
        useSaleStore.getState().loadPinnedProductIds(currentBusiness.id),
        useDashboardStore.getState().loadRevenueVisibility(currentBusiness.id),
      ]);
      
      // 2. Allow UI to render with fully loaded cache
      if (!active) return;
      hasShownAppRef.current = true;
      setIsBooted(true);

      // 3. Trigger background network syncs silently (these handle their own errors)
      useCustomerStore.getState().fetchCustomers(currentBusiness.id).catch(() => {});
      if (canViewPurchases) {
        useSupplierStore.getState().fetchSuppliers(currentBusiness.id).catch(() => {});
      }
      useBusinessStore.getState().fetchProducts(currentBusiness.id, canViewCosts).catch(() => {});
      if (currentBranch) {
        useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id).catch(() => {});
        useSaleStore.getState().loadSoldProductQuantities(currentBusiness.id, currentBranch.id).catch(() => {});
      }
    };

    boot();
    return () => {
      active = false;
    };
  }, [canViewCosts, canViewPurchases, currentBusiness, currentBranch]);

  if (!isBooted) {
    // Show nothing or a splash screen equivalent while cache reads (should be imperceptible)
    return <LoadingScreen message="" />;
  }

  return <>{children}</>;
}

export default function AppLayout() {
  const { session, currentBusiness, isInitialized } = useAuthStore();

  if (isInitialized && !session && !currentBusiness) {
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
