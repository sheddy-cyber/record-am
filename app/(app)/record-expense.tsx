import React, { useState, useEffect, useCallback } from 'react';
import { Alert, Platform, InteractionManager, View, Text, ScrollView, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { recordExpenseOffline } from '@/lib/offlineRecords';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/constants';
import { PaymentMethod } from '@/types';

export default function RecordExpenseScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const [isReady, setIsReady] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('rent');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savingExpense, setSavingExpense] = useState(false);

  const closeScreen = () => router.back();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setExpenseDescription('');
    setExpenseAmount('');
    setTimeout(() => setRefreshing(false), 300);
  }, []);

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
    setSavingExpense(true);
    Toast.show({
      type: 'success',
      text1: 'Expense recorded',
      text2: `${expenseDescription.trim()} \u00B7 ${CURRENCY_SYMBOL}${parseFloat(expenseAmount).toLocaleString()} queued for sync`,
    });
    closeScreen();
    
    void recordExpenseOffline({
      businessId: currentBusiness.id,
      branchId: currentBranch.id,
      userId: user?.id,
      category: expenseCategory,
      description: expenseDescription.trim(),
      amount: parseFloat(expenseAmount),
      paymentMethod: expenseMethod,
      expenseDate,
    }).then(() => {
      void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
    }).catch((err: any) => {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message,
      });
      setExpenseAmount('');
      setExpenseDescription('');
      router.back();
    }).finally(() => {
      setSavingExpense(false);
    });
  };

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
  }, []);


  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Record Expense"
        subtitle="Capture an operational cost without leaving the current flow."
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
            isAmount={true}
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
      </ScreenShell>
  );
}
