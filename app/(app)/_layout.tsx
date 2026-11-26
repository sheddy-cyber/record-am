import { Redirect, Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useSupplierStore } from '@/store/supplierStore';
import { useBusinessStore } from '@/store/businessStore';
import { LoadingScreen } from '@/components/ui';
import { COLORS } from '@/constants';

import { useDebtStore } from '@/store/debtStore';
import { useSaleStore } from '@/store/saleStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useNotificationStore } from '@/store/notificationStore';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';
import { readCachedRows, replaceCachedRows } from '@/lib/offlineStore';

function Bootloader({ children }: { children: React.ReactNode }) {
  // Subscribe to IDs only: the auth refresh on launch replaces these objects with
  // equal copies, which used to re-run the whole boot (and every fetch) for nothing.
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const userRole = useAuthStore((s) => s.userRole);
  const userId = useAuthStore((s) => s.user?.id);
  const [isBooted, setIsBooted] = useState(false);
  const hasShownAppRef = useRef(false);
  const canViewCosts = canViewFinancialData(userRole);
  const canViewPurchases = hasPermission(userRole, 'purchases.view');

  useEffect(() => {
    if (!businessId) {
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
        useCustomerStore.getState().hydrateCache(businessId),
        canViewPurchases
          ? useSupplierStore.getState().hydrateCache(businessId)
          : (async () => {
              useSupplierStore.getState().reset();
              await replaceCachedRows({ businessId: businessId }, 'suppliers', []);
            })(),
        useBusinessStore.getState().hydrateCache(businessId, canViewCosts),
        canViewCosts
          ? Promise.resolve()
          : (async () => {
              const items = await readCachedRows<{ id: string; cost_price?: number }>(
                { businessId: businessId },
                'sale_items',
              ).catch(() => []);
              if (items.some((item) => Number(item.cost_price ?? 0) > 0)) {
                await replaceCachedRows(
                  { businessId: businessId },
                  'sale_items',
                  items.map((item) => ({ ...item, cost_price: 0 })),
                );
              }
            })(),
        branchId && useDebtStore.getState().hydrateCache(businessId, branchId),
        // Home's figures and recent activity for this branch, so the first
        // frame (and the first frame after a branch switch) is complete.
        branchId ? useDashboardStore.getState().refreshFromCache(businessId, branchId) : Promise.resolve(),
        userId ? useNotificationStore.getState().loadNotifications(userId) : Promise.resolve(),
        useSaleStore.getState().loadPinnedProductIds(businessId),
        useDashboardStore.getState().loadRevenueVisibility(businessId),
      ]);
      
      // 2. Allow UI to render with fully loaded cache
      if (!active) return;
      hasShownAppRef.current = true;
      setIsBooted(true);

      // 3. Trigger background network syncs silently (these handle their own errors)
      useBusinessStore.getState().fetchBranches(businessId).catch(() => {});
      useCustomerStore.getState().fetchCustomers(businessId).catch(() => {});
      if (canViewPurchases) {
        useSupplierStore.getState().fetchSuppliers(businessId).catch(() => {});
      }
      useBusinessStore.getState().fetchProducts(businessId, canViewCosts).catch(() => {});
      useBusinessStore.getState().fetchCategories(businessId).catch(() => {});
      if (branchId) {
        useDebtStore.getState().fetchDebts(businessId, branchId).catch(() => {});
        useSaleStore.getState().loadSoldProductQuantities(businessId, branchId).catch(() => {});
      }
    };

    boot();
    return () => {
      active = false;
    };
  }, [canViewCosts, canViewPurchases, businessId, branchId, userId]);

  if (!isBooted) {
    // Show nothing or a splash screen equivalent while cache reads (should be imperceptible)
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

export default function AppLayout() {
  const hasSession = useAuthStore((s) => Boolean(s.session));
  const hasBusiness = useAuthStore((s) => Boolean(s.currentBusiness));
  const isInitialized = useAuthStore((s) => s.isInitialized);

  if (isInitialized && !hasSession && !hasBusiness) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Bootloader>
        <Stack
          screenOptions={{
            headerShown: false,
            // Native push on iOS (with swipe-back); a quick fade-up on Android.
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            animationDuration: 220,
            gestureEnabled: true,
            contentStyle: { backgroundColor: COLORS.surface },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="record-sale" />
          <Stack.Screen name="add-stock" />
          <Stack.Screen name="rapid-add-stock" />
          <Stack.Screen name="import-stock" />
          <Stack.Screen name="import-sales" />
          <Stack.Screen name="branches/index" />
          <Stack.Screen name="record-expense" />
          <Stack.Screen name="debts" />
          <Stack.Screen name="record-debt" />
          <Stack.Screen name="update-stock" />
          <Stack.Screen name="record-payment" />
          <Stack.Screen name="record-purchase" />
          <Stack.Screen name="close-day" />
          <Stack.Screen name="record-damage" />
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
