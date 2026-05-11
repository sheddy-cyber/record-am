import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, differenceInDays } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { shareDebtReminderViaWhatsApp } from '@/lib/reports';
import { Button, Card, Badge, EmptyState, LoadingScreen, SectionHeader, Divider } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { ScreenShell, ScreenHeader, HeaderAction, OverlayHeader, FlatSection } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE, PAYMENT_METHODS } from '@/constants';
import { CustomerDebt, PaymentMethod } from '@/types';

const formatCurrency = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user } = useAuthStore();

  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [showRepayment, setShowRepayment] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);

  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNotes, setDebtNotes] = useState('');
  const [savingDebt, setSavingDebt] = useState(false);

  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');
  const [repayNotes, setRepayNotes] = useState('');
  const [savingRepay, setSavingRepay] = useState(false);

  const loadDebts = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const { data, error } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('business_id', currentBusiness.id)
        .eq('branch_id', currentBranch.id)
        .neq('status', 'settled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDebts((data as CustomerDebt[]) ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentBusiness, currentBranch]);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useRealtimeRefresh({
    channelName: `debts-screen-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id],
    tables: [
      ...(currentBranch ? [{ table: 'customer_debts', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      { table: 'debt_repayments' },
      ...(currentBranch ? [{ table: 'sales', filter: `branch_id=eq.${currentBranch.id}` }] : []),
    ],
    onRefresh: loadDebts,
  });

  const totalOutstanding = debts.reduce((sum, debt) => sum + debt.balance, 0);

  const resetDebtForm = () => {
    setDebtCustomerName('');
    setDebtCustomerPhone('');
    setDebtAmount('');
    setDebtDueDate('');
    setDebtNotes('');
  };

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

      await loadDebts();
      setShowAddDebt(false);
      resetDebtForm();
      Toast.show({
        type: 'success',
        text1: 'Debt recorded',
        text2: `${debtCustomerName} • ${formatCurrency(amount)}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingDebt(false);
    }
  };

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

      await loadDebts();
      setShowRepayment(false);
      setRepayAmount('');
      setRepayNotes('');
      setRepayMethod('cash');

      Toast.show({
        type: 'success',
        text1: newStatus === 'settled' ? 'Debt settled' : 'Payment recorded',
        text2: newStatus === 'settled'
          ? `${formatCurrency(amount)} was added to sales and revenue.`
          : `${formatCurrency(amount)} was added to sales. Balance remains in debts.`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingRepay(false);
    }
  };

  const getDebtAge = (debt: CustomerDebt) => {
    const days = differenceInDays(new Date(), new Date(debt.created_at));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const isOverdue = (debt: CustomerDebt) => {
    if (!debt.due_date) return false;
    return new Date(debt.due_date) < new Date();
  };

  if (loading) return <LoadingScreen message="Loading debts..." />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Debts"
        subtitle={`${debts.length} open · ${formatCurrency(totalOutstanding)}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Record Debt" onPress={() => { resetDebtForm(); setShowAddDebt(true); }} />}
      />

      <View style={{ paddingHorizontal: SP.page, paddingTop: SP.card }}>
        <FlatSection style={{ padding: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>
            Track repayments here. Settled debts get added to sales automatically.
          </Text>
        </FlatSection>
      </View>

      {debts.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No outstanding debts"
          description="All customer debts are settled. Record a new credit sale or standalone debt when needed."
          action={{ label: 'Record Debt', onPress: () => setShowAddDebt(true) }}
        />
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: SP.page, gap: 10, paddingBottom: insets.bottom + 92 }}
          ListHeaderComponent={
            <FlatSection style={{ padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Outstanding balance</Text>
              <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 6 }}>{formatCurrency(totalOutstanding)}</Text>
              <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                Customers with unpaid balances stay here until fully settled.
              </Text>
            </FlatSection>
          }
          renderItem={({ item }) => (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>{item.customer_name}</Text>
                  {item.customer_phone ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Feather name="phone" size={12} color={COLORS.text.muted} />
                      <Text style={{ fontSize: 13, color: COLORS.text.secondary }}>{item.customer_phone}</Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 6 }}>Recorded {getDebtAge(item)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>{formatCurrency(item.balance)}</Text>
                  <Badge
                    label={isOverdue(item) ? 'Overdue' : item.status === 'partial' ? 'Partial' : 'Outstanding'}
                    variant={isOverdue(item) ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                  />
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Paid {formatCurrency(item.amount_paid)}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Original {formatCurrency(item.original_amount)}</Text>
                </View>
                <View style={{ height: 7, backgroundColor: COLORS.surface2 }}>
                  <View
                    style={{
                      height: 7,
                      backgroundColor: COLORS.success,
                      width: `${Math.min(100, (item.amount_paid / item.original_amount) * 100)}%`,
                    }}
                  />
                </View>
              </View>

              {item.due_date ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="calendar" size={12} color={isOverdue(item) ? COLORS.danger : COLORS.text.muted} />
                  <Text style={{ fontSize: 12, color: isOverdue(item) ? COLORS.danger : COLORS.text.muted }}>
                    Due {format(new Date(item.due_date), 'MMM d, yyyy')}
                  </Text>
                </View>
              ) : null}

              {item.notes ? <Text style={{ fontSize: 12, color: COLORS.text.secondary }}>{item.notes}</Text> : null}

              <Divider />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Record Payment"
                  onPress={() => {
                    setSelectedDebt(item);
                    setRepayAmount('');
                    setRepayNotes('');
                    setRepayMethod('cash');
                    setShowRepayment(true);
                  }}
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                />
                {item.customer_phone ? (
                  <Button
                    title="Send Reminder"
                    onPress={() =>
                      shareDebtReminderViaWhatsApp(
                        item.customer_name,
                        item.customer_phone!,
                        item.balance,
                        currentBusiness?.name ?? '',
                        item.due_date
                      )
                    }
                    variant="ghost"
                    size="sm"
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}

      <Modal
        visible={showAddDebt}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAddDebt(false)}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader title="Record Debt" onClose={() => setShowAddDebt(false)} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
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
                prefix="₦"
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
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>

      <Modal
        visible={showRepayment}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowRepayment(false)}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader title="Record Payment" subtitle={selectedDebt?.customer_name} onClose={() => setShowRepayment(false)} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
              {selectedDebt ? (
                <FlatSection style={{ padding: 16, marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Balance remaining</Text>
                  <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.danger, marginTop: 6 }}>
                    {formatCurrency(selectedDebt.balance)}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                    Track repayments here. Settled debts get added to sales automatically.
                  </Text>
                </FlatSection>
              ) : null}

              <InputField
                label="Amount Being Paid"
                value={repayAmount}
                onChangeText={setRepayAmount}
                placeholder="0"
                keyboardType="numeric"
                prefix="₦"
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
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
