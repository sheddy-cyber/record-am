import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/constants';
import { PaymentMethod } from '@/types';

export default function RecordExpenseScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();

  const [expenseCategory, setExpenseCategory] = useState('rent');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savingExpense, setSavingExpense] = useState(false);

  const closeScreen = () => router.back();

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

      Toast.show({
        type: 'success',
        text1: 'Expense recorded',
        text2: `${expenseDescription.trim()} \u00B7 ${CURRENCY_SYMBOL}${parseFloat(expenseAmount).toLocaleString()}`,
      });

      closeScreen();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingExpense(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Expense"
        subtitle="Capture an operational cost without leaving the current flow."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
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
            prefix={CURRENCY_SYMBOL}
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
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
