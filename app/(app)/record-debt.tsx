import React, { useState, useEffect, useCallback } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View, InteractionManager, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDebtStore } from '@/store/debtStore';
import { recordDebtOffline } from '@/lib/offlineRecords';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function RecordDebtScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const [isReady, setIsReady] = useState(false);
  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNotes, setDebtNotes] = useState('');
  const [savingDebt, setSavingDebt] = useState(false);

  const closeScreen = () => router.back();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setDebtCustomerName('');
    setDebtCustomerPhone('');
    setDebtAmount('');
    setDebtDueDate('');
    setDebtNotes('');
    setTimeout(() => setRefreshing(false), 300);
  }, []);

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
    if (!debtNotes.trim()) {
      Alert.alert('Notes required', 'Please specify what this debt is for in the notes.');
      return;
    }

    setSavingDebt(true);
    const amount = parseFloat(debtAmount);
    
    Toast.show({
      type: 'success',
      text1: 'Debt recorded',
      text2: `${debtCustomerName.trim()} \u00B7 ${formatCurrency(amount)} queued for sync`,
    });
    closeScreen();

    void recordDebtOffline({
      businessId: currentBusiness.id,
      branchId: currentBranch.id,
      customerName: debtCustomerName.trim(),
      customerPhone: debtCustomerPhone.trim() || undefined,
      amount,
      dueDate: debtDueDate || undefined,
      notes: debtNotes.trim() || undefined,
    }).then(() => {
      void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id);
      void useCustomerStore.getState().fetchCustomers(currentBusiness.id);
    }).catch((err: any) => {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message,
      });
    }).finally(() => {
      setSavingDebt(false);
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
        title="Record Debt"
        subtitle="Capture a customer balance directly from the debts flow."
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
          <View style={{
            backgroundColor: '#F0F5F2',
            padding: 14,
            borderRadius: RADIUS.md,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#D0E3D8',
          }}>
            <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: '#1B5E20', marginBottom: 4 }}>
              💡 Standalone Debt vs. Credit Sale
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: '#2E7D32', lineHeight: 18 }}>
              Use this screen only for historical debts, cash loans, or services. If you are selling stock items on credit, please go to{' '}
              <Text
                style={{ fontFamily: FONT.bold, textDecorationLine: 'underline' }}
                onPress={() => {
                  closeScreen();
                  router.push('/(app)/record-sale');
                }}
              >
                Record Sale
              </Text>{' '}
              and set "Amount Paid" to 0 (or partial payment) to correctly deplete inventory.
            </Text>
          </View>

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
            required
          />
          <Button title="Record Debt" onPress={handleAddDebt} loading={savingDebt} size="lg" />
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
