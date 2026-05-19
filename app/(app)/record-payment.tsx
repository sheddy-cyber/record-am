import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
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

  const [loading, setLoading] = useState(true);
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');
  const [repayNotes, setRepayNotes] = useState('');
  const [savingRepay, setSavingRepay] = useState(false);

  const closeScreen = () => router.back();

  const loadDebt = useCallback(async () => {
    if (!debtId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('id', debtId)
        .single();

      if (error) throw error;
      setSelectedDebt((data as CustomerDebt) ?? null);
    } catch (err) {
      console.error(err);
      setSelectedDebt(null);
    } finally {
      setLoading(false);
    }
  }, [debtId]);

  useEffect(() => {
    loadDebt();
  }, [loadDebt]);

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
    try {
      const { error: repaymentError } = await supabase.from('debt_repayments').insert({
        debt_id: selectedDebt.id,
        amount,
        payment_method: repayMethod,
        notes: repayNotes.trim() || undefined,
        recorded_by: user.id,
      });
      if (repaymentError) throw repaymentError;

      const newAmountPaid = selectedDebt.amount_paid + amount;
      const newBalance = selectedDebt.balance - amount;
      const newStatus = newBalance <= 0 ? 'settled' : 'partial';

      if (selectedDebt.sale_id) {
        const { data: linkedSale, error: linkedSaleError } = await supabase
          .from('sales')
          .select('amount_paid, total_amount, payment_method')
          .eq('id', selectedDebt.sale_id)
          .single();

        if (linkedSaleError) throw linkedSaleError;

        const nextPaymentMethod =
          linkedSale.amount_paid <= 0
            ? repayMethod
            : linkedSale.payment_method !== repayMethod
              ? 'mixed'
              : linkedSale.payment_method;

        const { error: updateSaleError } = await supabase
          .from('sales')
          .update({
            amount_paid: linkedSale.amount_paid + amount,
            amount_owed: Math.max(0, (linkedSale.total_amount ?? newBalance) - (linkedSale.amount_paid + amount)),
            payment_status: newBalance <= 0 ? 'paid' : 'partial',
            payment_method: nextPaymentMethod,
          })
          .eq('id', selectedDebt.sale_id);

        if (updateSaleError) throw updateSaleError;
      }

      const { error: updateDebtError } = await supabase
        .from('customer_debts')
        .update({
          amount_paid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
          sale_id: selectedDebt.sale_id,
        })
        .eq('id', selectedDebt.id);

      if (updateDebtError) throw updateDebtError;

      Toast.show({
        type: 'success',
        text1: newStatus === 'settled' ? 'Debt settled' : 'Payment recorded',
        text2:
          newStatus === 'settled'
            ? `${formatCurrency(amount)} was added to sales and revenue.`
            : `${formatCurrency(amount)} was added to sales. Balance remains in debts.`,
      });

      closeScreen();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingRepay(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading debt..." />;
  }

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
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
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
