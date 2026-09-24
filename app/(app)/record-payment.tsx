import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDebtStore } from '@/store/debtStore';
import { useNotificationStore } from '@/store/notificationStore';
import { usePaymentAccountStore } from '@/store/paymentAccountStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { PaymentAccountModal } from '@/components/settings/PaymentAccountModal';
import { supabase } from '@/lib/supabase';
import { recordRepaymentOffline } from '@/lib/offlineRecords';
import { readCachedCustomerDebts } from '@/lib/offlineStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { FlatSection, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, PAYMENT_METHODS, RADIUS } from '@/constants';
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
  const [cashAmount, setCashAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [bankName, setBankName] = useState('');
  const [paymentAccountModalVisible, setPaymentAccountModalVisible] = useState(false);
  const [repayNotes, setRepayNotes] = useState('');
  const [savingRepay, setSavingRepay] = useState(false);

  const {
    accounts: paymentAccounts,
    fetchAccounts: fetchPaymentAccounts,
    createAccount: createPaymentAccount,
  } = usePaymentAccountStore();

  const handleRepayAmountChange = (val: string) => {
    setRepayAmount(val);
    if (repayMethod === 'mixed') {
      const parsedTotal = parseFloat(val) || 0;
      const parsedCash = parseFloat(cashAmount);
      if (Number.isFinite(parsedCash)) {
        const remaining = Math.max(0, Number((parsedTotal - parsedCash).toFixed(2)));
        setTransferAmount(`${remaining}`);
      } else {
        setTransferAmount(parsedTotal > 0 ? `${parsedTotal}` : '');
      }
    }
  };

  const handleRepayMethodChange = (method: PaymentMethod) => {
    setRepayMethod(method);
    if (method === 'mixed') {
      const total = parseFloat(repayAmount) || 0;
      if (!cashAmount && !transferAmount && total > 0) {
        setCashAmount('');
        setTransferAmount(`${total}`);
      }
    }
  };

  const handleCashAmountChange = (val: string) => {
    setCashAmount(val);
    const total = parseFloat(repayAmount) || 0;
    const parsed = parseFloat(val);
    if (val === '') {
      setTransferAmount(total > 0 ? `${total}` : '');
    } else if (Number.isFinite(parsed)) {
      const remaining = Math.max(0, Number((total - parsed).toFixed(2)));
      setTransferAmount(`${remaining}`);
    }
  };

  const handleTransferAmountChange = (val: string) => {
    setTransferAmount(val);
    const total = parseFloat(repayAmount) || 0;
    const parsed = parseFloat(val);
    if (val === '') {
      setCashAmount(total > 0 ? `${total}` : '');
    } else if (Number.isFinite(parsed)) {
      const remaining = Math.max(0, Number((total - parsed).toFixed(2)));
      setCashAmount(`${remaining}`);
    }
  };

  const closeScreen = () => router.back();

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    setRefreshing(true);
    try {
      await fetchDebts(currentBusiness.id, currentBranch.id);
      void fetchPaymentAccounts(currentBusiness.id);
      if (debtId) {
        const debt = useDebtStore.getState().debts.find(d => d.id === debtId);
        if (debt) setSelectedDebt(debt);
      }
    } catch (_) {}
    setRefreshing(false);
  }, [currentBranch, currentBusiness, debtId, fetchDebts, fetchPaymentAccounts]);

  useEffect(() => {
    if (currentBusiness) {
      void fetchPaymentAccounts(currentBusiness.id);
    }
    if (debtId) {
      const debt = useDebtStore.getState().debts.find(d => d.id === debtId);
      if (debt) {
        setSelectedDebt(debt);
      }
    }
  }, [debtId, currentBusiness, fetchPaymentAccounts]);

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

    let finalCash: number | undefined = undefined;
    let finalTransfer: number | undefined = undefined;

    if (repayMethod === 'mixed') {
      const parsedCash = parseFloat(cashAmount) || 0;
      const parsedTransfer = parseFloat(transferAmount) || 0;
      const splitSum = Number((parsedCash + parsedTransfer).toFixed(2));
      const expectedTotal = Number(amount.toFixed(2));

      if (parsedCash < 0 || parsedTransfer < 0) {
        Alert.alert('Invalid split', 'Cash and transfer amounts must be positive numbers.');
        return;
      }

      if (Math.abs(splitSum - expectedTotal) > 0.01) {
        Alert.alert(
          'Split mismatch',
          `The split total (${CURRENCY_SYMBOL}${splitSum.toLocaleString('en-NG')}) does not match the payment amount (${CURRENCY_SYMBOL}${expectedTotal.toLocaleString('en-NG')}).`,
        );
        return;
      }

      finalCash = parsedCash;
      finalTransfer = parsedTransfer;
    }

    setSavingRepay(true);

    try {
      if (amount > 0) {
        useDashboardStore.getState().applyRepaymentToTodaySales(amount);
      }

      await recordRepaymentOffline({
        businessId: currentBusiness.id,
        branchId: currentBranch.id,
        userId: user.id,
        debt: selectedDebt,
        amount,
        paymentMethod: repayMethod,
        cashAmount: finalCash,
        transferAmount: finalTransfer,
        paymentAccountId: paymentAccountId || undefined,
        bankName: bankName.trim() || undefined,
        notes: repayNotes.trim() || undefined,
      });

      await Promise.all([
        useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
        useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id),
        useDebtStore.getState().hydrateCache(currentBusiness.id, currentBranch.id),
        useDailyBalanceStore.getState().fetchDailyBalance(currentBusiness.id, currentBranch.id),
      ]);

      Toast.show({
        type: 'success',
        text1: 'Payment recorded',
        text2: `${formatCurrency(amount)} recorded.`,
      });

      closeScreen();

      void useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id);
      void useNotificationStore.getState().markDebtReminderAsRead(
        {
          customerName: selectedDebt.customer_name,
          customerId: selectedDebt.customer_id,
          debtId: selectedDebt.id,
        },
        user.id,
      );
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message,
      });
    } finally {
      setSavingRepay(false);
    }
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

  const isTransfer = repayMethod === 'transfer';
  const isPos = repayMethod === 'pos';
  const relevantAccounts = isPos
    ? paymentAccounts.filter((a) => a.channel === 'pos' || a.channel === 'both')
    : paymentAccounts.filter((a) => a.channel === 'transfer' || a.channel === 'both');
  const accountLabel = isPos ? 'POS Terminal / Bank' : 'Bank Paid To';

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
            onChangeText={handleRepayAmountChange}
            placeholder="0"
            keyboardType="numeric"
            prefix={CURRENCY_SYMBOL}
            isAmount={true}
            required
          />
          <SelectField
            label="Payment Method"
            value={repayMethod}
            options={PAYMENT_METHODS}
            onChange={(value) => handleRepayMethodChange(value as PaymentMethod)}
          />

          {(isTransfer || isPos) ? (
            relevantAccounts.length > 0 ? (
              <View style={{ gap: 4, marginBottom: 16 }}>
                <SelectField
                  label={accountLabel}
                  value={paymentAccountId}
                  options={[
                    { value: '', label: `-- Select ${accountLabel} --` },
                    ...relevantAccounts.map((a) => ({
                      value: a.id,
                      label: a.account_number ? `${a.name} (${a.account_number})` : a.name,
                    })),
                  ]}
                  onChange={(val) => {
                    const found = relevantAccounts.find((a) => a.id === val);
                    setPaymentAccountId(val);
                    setBankName(found?.name || '');
                  }}
                  containerStyle={{ marginBottom: 0 }}
                />
                <TouchableOpacity
                  onPress={() => setPaymentAccountModalVisible(true)}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.accent }}>
                    + Add new {isPos ? 'POS terminal' : 'bank account'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setPaymentAccountModalVisible(true)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  backgroundColor: '#EBF3FB',
                  borderRadius: RADIUS.md,
                  borderWidth: 1,
                  borderColor: '#B8CFDF',
                  marginBottom: 16,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Feather name={isPos ? 'credit-card' : 'send'} size={15} color={COLORS.navy} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.navy }}>
                      No {isPos ? 'POS terminals' : 'bank accounts'} saved yet.
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                      Tap to add so you can track inflows by {isPos ? 'terminal' : 'bank'}.
                    </Text>
                  </View>
                </View>
                <Feather name="plus-circle" size={18} color={COLORS.accent} />
              </TouchableOpacity>
            )
          ) : null}

          {repayMethod === 'mixed' ? (
            <View
              style={{
                padding: 14,
                backgroundColor: '#F5F0E4',
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: '#D8CEB7',
                marginBottom: 16,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                  Mixed Payment Split
                </Text>
                <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                  Total: {formatCurrency(parseFloat(repayAmount) || 0)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Cash Portion"
                    value={cashAmount}
                    onChangeText={handleCashAmountChange}
                    placeholder="0"
                    keyboardType="numeric"
                    prefix={CURRENCY_SYMBOL}
                    isAmount={true}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Transfer Portion"
                    value={transferAmount}
                    onChangeText={handleTransferAmountChange}
                    placeholder="0"
                    keyboardType="numeric"
                    prefix={CURRENCY_SYMBOL}
                    isAmount={true}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
              </View>

              {relevantAccounts.length > 0 ? (
                <SelectField
                  label="Bank Paid To (Transfer portion)"
                  value={paymentAccountId}
                  options={[
                    { value: '', label: '-- Select Bank Paid To --' },
                    ...relevantAccounts.map((a) => ({
                      value: a.id,
                      label: a.account_number ? `${a.name} (${a.account_number})` : a.name,
                    })),
                  ]}
                  onChange={(val) => {
                    const found = relevantAccounts.find((a) => a.id === val);
                    setPaymentAccountId(val);
                    setBankName(found?.name || '');
                  }}
                  containerStyle={{ marginBottom: 0 }}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setPaymentAccountModalVisible(true)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 10,
                    backgroundColor: '#FFFDF8',
                    borderRadius: RADIUS.sm,
                    borderWidth: 1,
                    borderColor: '#D8CEB7',
                  }}
                >
                  <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.navy }}>
                    + Add bank for transfer portion
                  </Text>
                  <Feather name="plus" size={14} color={COLORS.accent} />
                </TouchableOpacity>
              )}

              {Math.abs(Number(((parseFloat(cashAmount) || 0) + (parseFloat(transferAmount) || 0)).toFixed(2)) - Number((parseFloat(repayAmount) || 0).toFixed(2))) > 0.01 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="alert-circle" size={14} color={COLORS.danger} />
                  <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.danger }}>
                    Split ({formatCurrency((parseFloat(cashAmount) || 0) + (parseFloat(transferAmount) || 0))}) does not match amount ({formatCurrency(parseFloat(repayAmount) || 0)})
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                  Cash: {formatCurrency(parseFloat(cashAmount) || 0)} · Transfer: {formatCurrency(parseFloat(transferAmount) || 0)}
                </Text>
              )}
            </View>
          ) : null}
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

        {currentBusiness ? (
          <PaymentAccountModal
            visible={paymentAccountModalVisible}
            onClose={() => setPaymentAccountModalVisible(false)}
            initialChannel={repayMethod === 'pos' ? 'pos' : 'transfer'}
            onSave={async (params) => {
              const newAcc = await createPaymentAccount({
                businessId: currentBusiness.id,
                name: params.name,
                accountNumber: params.accountNumber,
                channel: params.channel,
              });
              if (newAcc) {
                setPaymentAccountId(newAcc.id);
                setBankName(newAcc.name);
              }
            }}
          />
        ) : null}
      </ScreenShell>
  );
}
