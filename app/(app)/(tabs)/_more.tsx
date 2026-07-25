import React, { useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Linking, Alert } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { Button, Card, IconBox, ListRow, SectionHeader } from '@/components/ui';
import { BrandMark, FlatSection, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { APP_VERSION, BRAND, COLORS, FONT, RADIUS, SP } from '@/constants';

type MenuSection = {
  title: string;
  items: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    subtitle: string;
    onPress: () => void;
    iconBg?: string;
    iconColor?: string;
  }[];
};

function MoreScreen() {
  const insets = useSafeAreaInsets();
  const profileName = useAuthStore((s) => s.profile?.full_name);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const businessCurrency = useAuthStore((s) => s.currentBusiness?.currency);
  const branchName = useAuthStore((s) => s.currentBranch?.name);
  const signOut = useAuthStore((s) => s.signOut);

  const sections: MenuSection[] = [
    {
      title: 'Reports & Insights',
      items: [
        {
          icon: 'bar-chart-2',
          label: 'Analytics',
          subtitle: 'Sales trends, profit, and top products',
          onPress: () => router.push('/(app)/analytics'),
          iconBg: COLORS.infoLight,
          iconColor: COLORS.info,
        },
        {
          icon: 'sliders',
          label: 'Daily Balance',
          subtitle: 'Cash reconciliation and day close',
          onPress: () => router.push('/(app)/balance'),
          iconBg: COLORS.successLight,
          iconColor: COLORS.success,
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          icon: 'minus-circle',
          label: 'Record Expense',
          subtitle: 'Rent, electricity, transport, and more',
          onPress: () => router.push('/(app)/record-expense'),
          iconBg: COLORS.warningLight,
          iconColor: COLORS.warning,
        },
        {
          icon: 'list',
          label: 'Stock History',
          subtitle: 'Inventory movement audit trail',
          onPress: () => router.push('/(app)/stock-history'),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
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
          iconBg: COLORS.infoLight,
          iconColor: COLORS.info,
        },
        {
          icon: 'package',
          label: 'Suppliers & Purchases',
          subtitle: 'Contacts, goods bought, and balances',
          onPress: () => router.push('/(app)/suppliers'),
          iconBg: COLORS.warningLight,
          iconColor: COLORS.warning,
        },
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
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
        {
          icon: 'settings',
          label: 'Business Settings',
          subtitle: businessName ?? 'Manage your setup',
          onPress: () => router.push('/(app)/settings'),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
        {
          icon: 'info',
          label: 'About Record Am',
          subtitle: 'Brand story and app information',
          onPress: () => router.push('/(app)/about'),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
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
          iconBg: COLORS.dangerLight,
          iconColor: COLORS.danger,
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
            <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: '#FFFFFF' }}>
              {(profileName ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, gap: 24, paddingBottom: insets.bottom + 92 }}
        showsVerticalScrollIndicator={false}
        delaysContentTouches={false}
      >
        <FlatSection style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <BrandMark size={42} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
              {businessName}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
              {branchName}
              {' · '}
              {businessCurrency}
            </Text>
          </View>
        </FlatSection>

        {sections.map((section) => (
          <View key={section.title}>
            <SectionHeader title={section.title} />
            <Card style={{ padding: 0 }}>
              {section.items.map((item, index) => (
                <View key={item.label}>
                  <ListRow
                    title={item.label}
                    subtitle={item.subtitle}
                    onPress={item.onPress}
                    left={<IconBox icon={item.icon} bg={item.iconBg} color={item.iconColor} />}
                  />
                  {index < section.items.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 70 }} />
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
            <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: COLORS.accent }}>
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
