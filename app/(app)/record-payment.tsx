import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDebtStore } from '@/store/debtStore';
import { supabase } from '@/lib/supabase';
import { recordRepaymentOffline } from '@/lib/offlineRecords';
import { readCachedCustomerDebts } from '@/lib/offlineStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { FlatSection, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, PAYMENT_METHODS } from '@/constants';
import { CustomerDebt, PaymentMethod } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function RecordPaymentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ debtId?: string | string[] }>();
  const debtId = Array.isArray(params.debtId) ? params.debtId[0] : params.debtId;
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const fetchDebts = useDebtStore((s) => s.fetchDebts);
  const [refreshing, setRefreshing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');
  const [repayNotes, setRepayNotes] = useState('');
  const [savingRepay, setSavingRepay] = useState(false);

  const closeScreen = () => router.back();

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    setRefreshing(true);
    try {
      await fetchDebts(currentBusiness.id, currentBranch.id);
      if (debtId) {
        const debt = useDebtStore.getState().debts.find(d => d.id === debtId);
        if (debt) setSelectedDebt(debt);
      }
    } catch (_) {}
    setRefreshing(false);
  }, [currentBranch, currentBusiness, debtId, fetchDebts]);

  useEffect(() => {
    if (debtId) {
      const debt = useDebtStore.getState().debts.find(d => d.id === debtId);
      if (debt) {
        setSelectedDebt(debt);
      }
    }
  }, [debtId]);

  const handleRepayment = async () => {
    if (!selectedDebt || !user || !currentBusiness || !currentBranch) return;

    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
      return;
    }
    if (amount > selectedDebt.balance) {
      Alert.alert('Amount too high', `This payment exceeds the current balance of ${formatCurrency(selectedDebt.balance)}.`);
      return;
    }

    setSavingRepay(true);
    setSavingRepay(true);
    Toast.show({
      type: 'success',
      text1: 'Payment recorded',
      text2: `${formatCurrency(amount)} queued for sync.`,
    });
    closeScreen();
    
    void recordRepaymentOffline({
      businessId: currentBusiness.id,
      branchId: currentBranch.id,
      userId: user.id,
      debt: selectedDebt,
      amount,
      paymentMethod: repayMethod,
      notes: repayNotes.trim() || undefined,
    }).then(({ debt }) => {
      void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id);
    }).catch((err: any) => {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message,
      });
    }).finally(() => {
      setSavingRepay(false);
    });
  };


  if (!selectedDebt) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Record Payment"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="credit-card"
          title="Debt not found"
          description="This debt record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Payment"
        subtitle={selectedDebt.customer_name}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
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
          <FlatSection style={{ padding: 16, marginBottom: 20 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>Balance remaining</Text>
            <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.danger, marginTop: 6 }}>
              {formatCurrency(selectedDebt.balance)}
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
              Track repayments here. Settled debts get added to sales automatically.
            </Text>
          </FlatSection>

          <InputField
            label="Amount Being Paid"
            value={repayAmount}
            onChangeText={setRepayAmount}
            placeholder="0"
            keyboardType="numeric"
            prefix={CURRENCY_SYMBOL}
            required
          />
          <SelectField
            label="Payment Method"
            value={repayMethod}
            options={PAYMENT_METHODS}
            onChange={(value) => setRepayMethod(value as PaymentMethod)}
          />
          <InputField
            label="Notes"
            value={repayNotes}
            onChangeText={setRepayNotes}
            placeholder="Optional note for this payment"
            multiline
            numberOfLines={3}
          />
          <Button title="Confirm Payment" onPress={handleRepayment} loading={savingRepay} size="lg" />
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
