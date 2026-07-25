import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, BrandWordmark, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { APP_VERSION, BRAND, COLORS, FONT, RADIUS } from '@/constants';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  const features = [
    { icon: 'package', title: 'Inventory & Stock', desc: 'Track stock levels, record restocks, and get early low-stock alerts.' },
    { icon: 'shopping-cart', title: 'Sales Recording', desc: 'Record cash, transfer, and POS sales with discounts and receipts.' },
    { icon: 'credit-card', title: 'Debt Management', desc: 'Keep tabs on customer debts, partial payments, and settlements.' },
    { icon: 'bar-chart-2', title: 'Daily Balance & Insights', desc: 'Understand daily cashflow, total revenue, expenses, and net profit.' },
    { icon: 'truck', title: 'Supplier Purchases', desc: 'Log supplier orders, goods received, and pending payables in one place.' },
    { icon: 'wifi-off', title: 'Offline-First Sync', desc: 'Works seamlessly without internet. Your records sync automatically when back online.' },
  ];

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={`About ${BRAND.name}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* Hero Brand Section */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: '#efefd0',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              shadowColor: COLORS.ink,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <BrandMark size={56} badge={false} />
          </View>

          <BrandWordmark size={30} />

          <Text
            style={{
              fontSize: 14,
              fontFamily: FONT.medium,
              color: COLORS.text.muted,
              marginTop: 6,
              textAlign: 'center',
            }}
          >
            Sales, stocks, expenses? <Text style={{ fontStyle: 'italic' }}>Record am</Text>.
          </Text>

          <View
            style={{
              marginTop: 14,
              backgroundColor: COLORS.ink,
              paddingHorizontal: 14,
              paddingVertical: 5,
              borderRadius: RADIUS.full,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.text.inverse }}>
              Version {APP_VERSION}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 32 }} />

        {/* Mission Statement */}
        <View style={{ marginBottom: 36 }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: FONT.bold,
              color: COLORS.accent,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            OUR PURPOSE
          </Text>
          <Text
            style={{
              fontSize: 15,
              fontFamily: FONT.regular,
              color: COLORS.text.primary,
              lineHeight: 25,
            }}
          >
            <Text style={{ fontStyle: 'italic' }}>{BRAND.name}</Text> is a modern business recording app built specifically for everyday Nigerian trade. It helps you manage stock, record sales, track debts, log expenses, and close each business day with total clarity.
          </Text>
        </View>

        {/* Features List Section */}
        <Text
          style={{
            fontSize: 12,
            fontFamily: FONT.bold,
            color: COLORS.accent,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 20,
          }}
        >
          WHAT IT HELPS YOU DO
        </Text>

        <View style={{ gap: 20, marginBottom: 36 }}>
          {features.map((item, index) => (
            <View
              key={item.title}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 16,
                paddingBottom: index < features.length - 1 ? 20 : 0,
                borderBottomWidth: index < features.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.06)',
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: 'rgba(0, 78, 137, 0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <Feather name={item.icon as keyof typeof Feather.glyphMap} size={20} color={COLORS.ink} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 4 }}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, lineHeight: 20 }}>
                  {item.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View
          style={{
            alignItems: 'center',
            paddingTop: 24,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: FONT.regular,
              color: COLORS.text.muted,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            Designed for sharp record keeping, without the bookkeeping noise.
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontFamily: FONT.medium,
              color: COLORS.text.muted,
              marginTop: 8,
            }}
          >
            © {new Date().getFullYear()} {BRAND.name}
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
