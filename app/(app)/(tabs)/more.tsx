import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { useConfirmSignOut } from '@/hooks/useConfirmSignOut';
import { Button, Card, ListRow, SectionHeader, IconBox } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { BrandMark, BrandWordmark, FlatSection, OverlayHeader, ScreenShell, ScreenHeader } from '@/components/layout';
import { APP_FOOTER_TEXT, BRAND, COLORS, FONT, RADIUS, SP, TYPE, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/constants';
import { PaymentMethod } from '@/types';

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

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ modal?: string }>();
  const { currentBusiness, currentBranch, profile, userRole } = useAuthStore();
  const confirmSignOut = useConfirmSignOut();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('rent');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    if (params.modal === 'expense') {
      setShowAddExpense(true);
    }
  }, [params.modal]);

  const clearExpenseRouteParam = () => {
    if (params.modal === 'expense') {
      router.replace('/(app)/(tabs)/more');
    }
  };

  const closeExpenseModal = () => {
    setShowAddExpense(false);
    clearExpenseRouteParam();
  };

  const handleAddExpense = async () => {
    if (!currentBusiness || !currentBranch) return;
    if (!expenseDescription.trim()) {
      Alert.alert('Description required', 'Enter a short description for this expense.');
      return;
    }
    if (!expenseAmount || parseFloat(expenseAmount) <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid expense amount.');
      return;
    }

    setSavingExpense(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        business_id: currentBusiness.id,
        branch_id: currentBranch.id,
        category: expenseCategory,
        description: expenseDescription.trim(),
        amount: parseFloat(expenseAmount),
        payment_method: expenseMethod,
        expense_date: expenseDate,
      });

      if (error) throw error;

      closeExpenseModal();
      setExpenseDescription('');
      setExpenseAmount('');
      setExpenseCategory('rent');
      setExpenseMethod('cash');
      Toast.show({
        type: 'success',
        text1: 'Expense recorded',
        text2: `${expenseDescription} \u2022 \u20A6${parseFloat(expenseAmount).toLocaleString()}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingExpense(false);
    }
  };

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
          onPress: () => setShowAddExpense(true),
          iconBg: COLORS.warningLight,
          iconColor: COLORS.warning,
        },
        {
          icon: 'truck',
          label: 'Record Purchase',
          subtitle: 'Restock from suppliers',
          onPress: () => router.push('/(app)/purchases'),
          iconBg: COLORS.successLight,
          iconColor: COLORS.success,
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
          label: 'Suppliers',
          subtitle: 'Contacts and purchase history',
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
          subtitle: profile?.full_name ?? 'Edit your details',
          onPress: () => router.push('/(app)/profile'),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
        {
          icon: 'settings',
          label: 'Business Settings',
          subtitle: currentBusiness?.name ?? 'Manage your setup',
          onPress: () => router.push('/(app)/settings'),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
        {
          icon: 'info',
          label: 'About Record Am',
          subtitle: 'Brand story and app information',
          onPress: () => setShowAbout(true),
          iconBg: COLORS.surface2,
          iconColor: COLORS.text.secondary,
        },
        {
          icon: 'log-out',
          label: 'Sign Out',
          subtitle: `Log out of ${BRAND.name}`,
          onPress: confirmSignOut,
          iconBg: COLORS.dangerLight,
          iconColor: COLORS.danger,
        },
      ],
    },
  ];

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="More"
        subtitle={profile?.full_name ?? 'User'}
        theme="dark"
        right={
          <View style={{ width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: '#FFFFFF' }}>
              {(profile?.full_name ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, gap: 24, paddingBottom: insets.bottom + 92 }}
        showsVerticalScrollIndicator={false}
      >
        <FlatSection style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <BrandMark size={42} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>{currentBusiness?.name}</Text>
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
              {currentBranch?.name} \u2022 {currentBusiness?.currency}
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
                  {index < section.items.length - 1 ? <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 70 }} /> : null}
                </View>
              ))}
            </Card>
          </View>
        ))}

        <Text style={{ textAlign: 'center', fontSize: 12, color: COLORS.text.muted }}>{APP_FOOTER_TEXT}</Text>
      </ScrollView>

      <Modal
        visible={showAddExpense}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeExpenseModal}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader title="Record Expense" onClose={closeExpenseModal} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
              <SelectField label="Category" value={expenseCategory} options={EXPENSE_CATEGORIES} onChange={setExpenseCategory} required />
              <InputField
                label="Description"
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                placeholder="e.g. March rent, generator fuel"
                required
              />
              <InputField
                label="Amount"
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder="0"
                keyboardType="numeric"
                prefix="\u20A6"
                required
              />
              <SelectField
                label="Payment Method"
                value={expenseMethod}
                options={PAYMENT_METHODS}
                onChange={(value) => setExpenseMethod(value as PaymentMethod)}
              />
              <InputField label="Date" value={expenseDate} onChangeText={setExpenseDate} placeholder="YYYY-MM-DD" />
              <Button title="Save Expense" onPress={handleAddExpense} loading={savingExpense} size="lg" />
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>

      <Modal
        visible={showAbout}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAbout(false)}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <OverlayHeader
            title={`About ${BRAND.name}`}
            onClose={() => setShowAbout(false)}
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
                { icon: 'truck', text: 'Record purchases and keep stock movement history clean.' },
              ].map((feature) => (
                <View key={feature.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <IconBox icon={feature.icon as keyof typeof Feather.glyphMap} bg={COLORS.surface2} color={COLORS.text.secondary} size={13} />
                  <Text style={{ flex: 1, fontSize: 14, color: COLORS.text.secondary, lineHeight: 20 }}>{feature.text}</Text>
                </View>
              ))}
            </Card>

            <FlatSection style={{ padding: 18 }}>
              <Text style={{ fontSize: 12, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Version</Text>
              <Text style={{ fontSize: 24, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 8 }}>1.0.0</Text>
              <Text style={{ fontSize: 13, color: COLORS.text.muted, marginTop: 6 }}>
                Designed for sharp record keeping, without the bookkeeping noise.
              </Text>
            </FlatSection>
          </ScrollView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
