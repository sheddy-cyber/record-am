import React, { useState, useCallback } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Linking, Alert, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { Badge, Button, Card, IconBox, ListRow, SectionHeader } from '@/components/ui';
import { BrandMark, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { APP_VERSION, BRAND, COLORS, FONT, RADIUS, SP } from '@/constants';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';

type MenuSection = {
  title: string;
  items: {
    icon: keyof typeof Feather.glyphMap;
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
  const businessCurrency = useAuthStore((s) => s.currentBusiness?.currency);
  const branchName = useAuthStore((s) => s.currentBranch?.name);
  const userRole = useAuthStore((s) => s.userRole);
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
          icon: 'bar-chart-2' as keyof typeof Feather.glyphMap,
          label: 'Analytics',
          subtitle: 'Sales trends, profit, and top products',
          onPress: () => router.push('/(app)/analytics'),
          iconBg: '#0284C7',
          iconColor: '#FFFFFF',
        }] : []),
        {
          icon: 'sliders' as keyof typeof Feather.glyphMap,
          label: 'Daily Balance',
          subtitle: canViewFinancials
            ? 'Cash reconciliation, profit, and day close'
            : 'End of day register and sales reconciliation',
          onPress: () => router.push('/(app)/balance'),
          iconBg: '#15803D',
          iconColor: '#FFFFFF',
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          icon: 'minus-circle',
          label: 'Expenses',
          subtitle: 'Track, record and manage operational costs',
          onPress: () => router.push('/(app)/record-expense'),
          iconBg: '#D97706',
          iconColor: '#FFFFFF',
        },
        {
          icon: 'shopping-cart' as keyof typeof Feather.glyphMap,
          label: 'Market List & Requests',
          subtitle: 'Items requested by customers to buy at market',
          onPress: () => router.push('/(app)/market-list'),
          iconBg: '#059669',
          iconColor: '#FFFFFF',
        },
        ...(canManageInventory ? [{
          icon: 'alert-octagon' as keyof typeof Feather.glyphMap,
          label: 'Damaged Goods',
          subtitle: 'Log broken or spoilt stock and write off loss',
          onPress: () => router.push('/(app)/record-damage'),
          iconBg: '#DC2626',
          iconColor: '#FFFFFF',
        }] : []),
        ...(canViewStockHistory ? [{
          icon: 'list' as keyof typeof Feather.glyphMap,
          label: 'Stock History',
          subtitle: 'Inventory movement audit trail',
          onPress: () => router.push('/(app)/stock-history'),
          iconBg: '#4F46E5',
          iconColor: '#FFFFFF',
        }] : []),
      ],
    },
    {
      title: 'People',
      items: [
        {
          icon: 'users',
          label: 'Customers',
          subtitle: 'Profiles, history, and debts',
          onPress: () => router.push('/(app)/customers'),
          iconBg: '#004E89',
          iconColor: '#FFFFFF',
        },
        ...(canViewPurchases ? [{
          icon: 'package' as keyof typeof Feather.glyphMap,
          label: 'Suppliers & Purchases',
          subtitle: 'Contacts, goods bought, and balances',
          onPress: () => router.push('/(app)/suppliers'),
          iconBg: '#0D9488',
          iconColor: '#FFFFFF',
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
          iconBg: '#2563EB',
          iconColor: '#FFFFFF',
        },
        ...(hasPermission(userRole, 'business-settings.manage') ? [{
          icon: 'users' as any,
          label: 'Team & Staff',
          subtitle: 'Manage your staff and roles',
          onPress: () => router.push('/(app)/team' as any),
          iconBg: '#7C3AED',
          iconColor: '#FFFFFF',
        },
        {
          icon: 'settings' as any,
          label: 'Business Settings',
          subtitle: businessName ?? 'Manage your setup',
          onPress: () => router.push('/(app)/settings' as any),
          iconBg: '#334155',
          iconColor: '#FFFFFF',
        }] : []),
        {
          icon: 'info',
          label: 'About Record Am',
          subtitle: 'Brand story and app information',
          onPress: () => router.push('/(app)/about'),
          iconBg: COLORS.accent,
          iconColor: COLORS.onAccent,
        },
        {
          icon: 'log-out',
          label: 'Sign Out',
          subtitle: (
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted }}>
              Log out of <Text style={{ fontStyle: 'italic' }}>{BRAND.name}</Text>
            </Text>
          ),
          onPress: () => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out?',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Sign Out', 
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/(auth)/login');
                  }
                }
              ]
            );
          },
          iconBg: '#DC2626',
          iconColor: '#FFFFFF',
        },
      ],
    },
  ];

  return (
    <SwipeableTabScreen name="more">
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="More"
        subtitle={profileName ?? 'User'}
        theme="dark"
        right={
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: RADIUS.full,
              backgroundColor: COLORS.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.onAccent }}>
              {(profileName ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, gap: 24, paddingBottom: insets.bottom + 92 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16 }}>
          <BrandMark size={52} badge badgeBg={COLORS.surface2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary, letterSpacing: -0.2 }} numberOfLines={1}>
              {businessName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Badge label={userRole?.toUpperCase() ?? 'OWNER'} variant="accent" />
              <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                {branchName} · {businessCurrency}
              </Text>
            </View>
          </View>
        </Card>

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
                    left={<IconBox icon={item.icon} bg={item.iconBg} color={item.iconColor} />}
                  />
                  {index < section.items.length - 1 ? (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderSubtle, marginLeft: 66 }} />
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
