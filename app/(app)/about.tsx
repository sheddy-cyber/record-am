import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, IconBox } from '@/components/ui';
import { BrandMark, BrandWordmark, FlatSection, ScreenHeader, ScreenShell, HeaderAction } from '@/components/layout';
import { BRAND, COLORS, FONT } from '@/constants';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={`About ${BRAND.name}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 32 }}>
        <FlatSection style={{ padding: 24, backgroundColor: COLORS.ink, borderColor: COLORS.ink, alignItems: 'center', gap: 16 }}>
          <BrandMark size={64} />
          <BrandWordmark invert size={34} />
        </FlatSection>

        <Card>
          <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 10 }}>What is {BRAND.name}?</Text>
          <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 22 }}>
            {BRAND.name} is a business record app built for everyday Nigerian trade. It helps you manage stock, record sales,
            track debt, log expenses, and close each business day with a cleaner picture of cash and movement.
          </Text>
        </Card>

        <Card>
          <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 12 }}>What it helps you do</Text>
          {[
            { icon: 'package', text: 'Manage inventory and catch low-stock items early.' },
            { icon: 'shopping-cart', text: 'Record sales quickly with cart, quantity, and discount control.' },
            { icon: 'credit-card', text: 'Track customer debts and convert settled debts into sales records.' },
            { icon: 'bar-chart-2', text: 'Understand trends with analytics, daily balance, and summaries.' },
            { icon: 'truck', text: 'Track suppliers, goods bought, and balances in one place.' },
          ].map((feature) => (
            <View key={feature.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <IconBox icon={feature.icon as keyof typeof Feather.glyphMap} bg={COLORS.surface2} color={COLORS.text.secondary} size={13} />
              <Text style={{ fontFamily: FONT.regular, flex: 1, fontSize: 14, color: COLORS.text.secondary, lineHeight: 20 }}>{feature.text}</Text>
            </View>
          ))}
        </Card>

        <FlatSection style={{ padding: 18 }}>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Version</Text>
          <Text style={{ fontSize: 24, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 8 }}>1.0.0</Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted, marginTop: 6 }}>
            Designed for sharp record keeping, without the bookkeeping noise.
          </Text>
        </FlatSection>
      </ScrollView>
    </ScreenShell>
  );
}
