import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function RecordDebtScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();

  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNotes, setDebtNotes] = useState('');
  const [savingDebt, setSavingDebt] = useState(false);

  const closeScreen = () => router.back();

  const handleAddDebt = async () => {
    if (!currentBusiness || !currentBranch) return;
    if (!debtCustomerName.trim()) {
      Alert.alert('Customer name required', 'Enter the customer name for this debt.');
      return;
    }
    if (!debtAmount || parseFloat(debtAmount) <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid debt amount.');
      return;
    }

    setSavingDebt(true);
    try {
      const amount = parseFloat(debtAmount);
      const { error } = await supabase.from('customer_debts').insert({
        business_id: currentBusiness.id,
        branch_id: currentBranch.id,
        customer_name: debtCustomerName.trim(),
        customer_phone: debtCustomerPhone.trim() || undefined,
        original_amount: amount,
        amount_paid: 0,
        balance: amount,
        due_date: debtDueDate || undefined,
        status: 'outstanding',
        notes: debtNotes.trim() || undefined,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Debt recorded',
        text2: `${debtCustomerName.trim()} \u00B7 ${formatCurrency(amount)}`,
      });

      closeScreen();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingDebt(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Debt"
        subtitle="Capture a customer balance directly from the debts flow."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          <InputField
            label="Customer Name"
            value={debtCustomerName}
            onChangeText={setDebtCustomerName}
            placeholder="e.g. Chioma Okafor"
            required
          />
          <InputField
            label="Customer Phone"
            value={debtCustomerPhone}
            onChangeText={setDebtCustomerPhone}
            placeholder="08012345678"
            keyboardType="phone-pad"
          />
          <InputField
            label="Amount Owed"
            value={debtAmount}
            onChangeText={setDebtAmount}
            placeholder="0"
            keyboardType="numeric"
            prefix={CURRENCY_SYMBOL}
            required
          />
          <InputField
            label="Due Date"
            value={debtDueDate}
            onChangeText={setDebtDueDate}
            placeholder="YYYY-MM-DD"
            hint="Leave blank if this does not have a fixed due date."
          />
          <InputField
            label="Notes"
            value={debtNotes}
            onChangeText={setDebtNotes}
            placeholder="What is this debt for?"
            multiline
            numberOfLines={3}
          />
          <Button title="Record Debt" onPress={handleAddDebt} loading={savingDebt} size="lg" />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
