import React, { useState, useCallback } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Linking, Alert, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { IconName } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useDebtStore } from '@/store/debtStore';
import { useBusinessStore } from '@/store/businessStore';
import { useOfflineStore } from '@/store/offlineStore';
import { flushOfflineQueue, retryAllSyncConflicts } from '@/lib/offlineStore';
import { Button, Card, ListRow, SectionHeader } from '@/components/ui';
import { BusinessAvatar, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { APP_VERSION, BRAND, COLORS, FONT, RADIUS, SP } from '@/constants';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';

type MenuSection = {
  title: string;
  items: {
    icon: IconName;
    label: string;
    subtitle: string | React.ReactNode;
    onPress: () => void;
    iconBg?: string;
    iconColor?: string;
  }[];
};

function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const initialize = useAuthStore((s) => s.initialize);
  const profileName = useAuthStore((s) => s.profile?.full_name);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const businessLogoUrl = useAuthStore((s) => s.currentBusiness?.logo_url);
  const businessCurrency = useAuthStore((s) => s.currentBusiness?.currency);
  const branchName = useAuthStore((s) => s.currentBranch?.name);
  const userRole = useAuthStore((s) => s.userRole);
  const staffId = useAuthStore((s) => s.staffId);
  const branches = useBusinessStore((s) => s.branches);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const conflictCount = useOfflineStore((s) => s.conflictCount);
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const debts = useDebtStore((s) => s.debts);
  const signOut = useAuthStore((s) => s.signOut);
  const canViewPurchases = hasPermission(userRole, 'purchases.view');
  const canViewStockHistory = hasPermission(userRole, 'stock-history.view');
  const canManageInventory = hasPermission(userRole, 'inventory.manage');
  const canViewFinancials = canViewFinancialData(userRole);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await initialize();
    } catch (_) {}
    setRefreshing(false);
  }, [initialize]);

  const sections: MenuSection[] = [
    {
      title: 'Reports & Insights',
      items: [
        ...(hasPermission(userRole, 'analytics.view') ? [{
          icon: 'bar-chart-2' as IconName,
          label: 'Analytics',
          subtitle: 'Trends, profit and best sellers',
          onPress: () => router.push('/(app)/analytics'),
        }] : []),
        {
          icon: 'sliders' as IconName,
          label: 'Daily Balance',
          subtitle: canViewFinancials
            ? 'Cash reconciliation, profit, and day close'
            : 'End of day register and sales reconciliation',
          onPress: () => router.push('/(app)/balance'),
        },
        {
          icon: 'file-text' as IconName,
          label: 'Import Sales',
          subtitle: 'Bring in past sales from Excel or CSV',
          onPress: () => router.push('/(app)/import-sales' as any),
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          icon: 'credit-card' as IconName,
          label: 'Customer Debts',
          subtitle: debts.length > 0
            ? `${debts.length} debtor${debts.length === 1 ? '' : 's'} with unpaid balances`
            : 'Track customer balances, settlements & reminders',
          onPress: () => router.push('/(app)/debts'),
        },
        {
          icon: 'minus-circle',
          label: 'Expenses',
          subtitle: 'Rent, transport, salaries and more',
          onPress: () => router.push('/(app)/record-expense'),
        },
        {
          icon: 'shopping-cart' as IconName,
          label: 'Market List',
          subtitle: 'What customers asked you to stock',
          onPress: () => router.push('/(app)/market-list'),
        },
        ...(canManageInventory ? [{
          icon: 'alert-octagon' as IconName,
          label: 'Damaged Goods',
          subtitle: 'Broken, spoilt or expired stock',
          onPress: () => router.push('/(app)/record-damage'),
        }] : []),
        ...(canViewStockHistory ? [{
          icon: 'list' as IconName,
          label: 'Stock History',
          subtitle: 'Every stock movement, in order',
          onPress: () => router.push('/(app)/stock-history'),
        }] : []),
      ],
    },
    {
      title: 'People',
      items: [
        {
          icon: 'users',
          label: 'Customers',
          subtitle: 'Contacts, purchases and balances',
          onPress: () => router.push('/(app)/customers'),
        },
        ...(canViewPurchases ? [{
          icon: 'package' as IconName,
          label: 'Suppliers & Purchases',
          subtitle: 'Who you buy from and what you owe',
          onPress: () => router.push('/(app)/suppliers'),
        }] : []),
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'user',
          label: 'My Profile',
          subtitle: profileName ?? 'Edit your details',
          onPress: () => router.push('/(app)/profile'),
        },
        ...(userRole === 'owner' ? [{
          icon: 'map-pin' as any,
          label: 'Branches',
          subtitle: `${branches.length || 1} ${branches.length === 1 ? 'branch' : 'branches'} · Working in ${branchName ?? 'Main branch'}`,
          onPress: () => router.push('/(app)/branches' as any),
        }] : []),
        ...(hasPermission(userRole, 'business-settings.manage') ? [{
          icon: 'users' as any,
          label: 'Team',
          subtitle: 'Roles, staff IDs and branches',
          onPress: () => router.push('/(app)/team' as any),
        },
        {
          icon: 'settings' as any,
          label: 'Business Settings',
          subtitle: businessName ?? 'Manage your setup',
          onPress: () => router.push('/(app)/settings' as any),
        }] : []),
        {
          icon: 'info',
          label: 'About Record Am',
          subtitle: 'Version and credits',
          onPress: () => router.push('/(app)/about'),
        },
        {
          icon: 'log-out',
          label: 'Sign out',
          subtitle: undefined,
          onPress: () => {
            Alert.alert(
              'Sign out?',
              'Records you made offline will finish syncing first.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Sign out', 
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/(auth)/login');
                  }
                }
              ]
            );
          },
        },
      ],
    },
  ];

  return (
    <SwipeableTabScreen name="more">
    <ScreenShell>
      <ScreenHeader title="More" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingTop: 4, gap: 24, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.text.muted}
            colors={[COLORS.accent]}
          />
        }
      >
        <Card onPress={hasPermission(userRole, 'business-settings.manage') ? () => router.push('/(app)/settings' as any) : undefined} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14 }}>
          <BusinessAvatar name={businessName ?? 'Business'} logoUrl={businessLogoUrl} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3 }} numberOfLines={1}>
              {businessName}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }} numberOfLines={1}>
              {profileName ? `${profileName} · ` : ''}
              {(userRole ?? 'owner').replace(/^\w/, (c) => c.toUpperCase())}
              {staffId ? ` · ${staffId}` : ''}
              {branchName ? ` · ${branchName}` : ''}
            </Text>
          </View>
        </Card>

        {(pendingCount > 0 || conflictCount > 0) && (
          <Card
            style={{
              backgroundColor: conflictCount > 0 ? COLORS.dangerLight : COLORS.card,
              borderColor: conflictCount > 0 ? '#EECAC2' : COLORS.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.bold, fontSize: 13.5, color: conflictCount > 0 ? COLORS.dangerText : COLORS.text.primary }}>
                {isSyncing
                  ? 'Syncing…'
                  : `${pendingCount + conflictCount} ${pendingCount + conflictCount === 1 ? 'record' : 'records'} waiting to sync`}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>
                They are safe on this phone and will upload when you are online.
              </Text>
            </View>
            <Button
              title={isSyncing ? 'Syncing' : 'Sync now'}
              size="sm"
              loading={isSyncing}
              onPress={async () => {
                if (conflictCount > 0) await retryAllSyncConflicts();
                await flushOfflineQueue();
              }}
            />
          </Card>
        )}

        {sections.filter((section) => section.items.length > 0).map((section) => (
          <View key={section.title}>
            <SectionHeader title={section.title} />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {section.items.map((item, index) => (
                <View key={item.label}>
                  <ListRow
                    title={item.label}
                    subtitle={item.subtitle}
                    onPress={item.onPress}
                    icon={item.icon}
                    destructive={item.label === 'Sign out'}
                    showChevron={item.label !== 'Sign out'}
                  />
                  {index < section.items.length - 1 ? (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 58 }} />
                  ) : null}
                </View>
              ))}
            </Card>
          </View>
        ))}

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
            v{APP_VERSION} · Created by{' '}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://krisshedrach.dev')}>
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 12, color: COLORS.ink }}>
              Kris Shedrach
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(MoreScreen);
