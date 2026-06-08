import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { Button, Card, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Math.abs(value).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function CloseDayScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const {
    summary,
    entries,
    isLoading,
    isSaving,
    selectedDate,
    fetchDailyBalance,
    closeDay,
  } = useDailyBalanceStore();

  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const closeScreen = () => router.back();

  useEffect(() => {
    if (!summary && currentBusiness && currentBranch) {
      fetchDailyBalance(currentBusiness.id, currentBranch.id, selectedDate);
    }
  }, [currentBranch, currentBusiness, fetchDailyBalance, selectedDate, summary]);

  useEffect(() => {
    if (!summary) return;

    if (actualCash === '') {
      setActualCash((summary.cash_in_hand_actual ?? summary.cash_in_hand_expected).toFixed(0));
    }

    if (closeNotes === '' && summary.notes) {
      setCloseNotes(summary.notes);
    }
  }, [actualCash, closeNotes, summary]);

  const repaymentEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'debt_repayment'),
    [entries],
  );
  const repaymentTotal = repaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalRevenue = (summary?.total_sales ?? 0) + repaymentTotal;

  const handleCloseDay = async () => {
    if (!user || !currentBusiness || !currentBranch) return;

    const cash = parseFloat(actualCash);
    if (Number.isNaN(cash) || cash < 0) {
      Alert.alert('Error', 'Please enter a valid cash amount.');
      return;
    }

    const success = await closeDay(currentBusiness.id, currentBranch.id, user.id, cash, closeNotes);

    if (!success) {
      Alert.alert('Error', 'Failed to close the day. Please try again.');
      return;
    }

    Toast.show({
      type: 'success',
      text1: 'Day closed',
      text2: `${format(new Date(selectedDate), 'MMM d')} has been balanced and saved.`,
    });

    closeScreen();
  };


  if (!summary) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Close and Balance Day"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="sliders"
          title="No balance summary"
          description="The day summary could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Close and Balance Day"
        subtitle={format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Card style={{ backgroundColor: '#F0F9FF', marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 12 }}>
              Day Summary
            </Text>
            {[
              { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: COLORS.success },
              { label: 'Total Expenses', value: formatCurrency(summary.total_expenses ?? 0), color: COLORS.danger },
              {
                label: 'Net Profit',
                value: `${(summary.net_profit ?? 0) < 0 ? '-' : ''}${formatCurrency(summary.net_profit ?? 0)}`,
                color: (summary.net_profit ?? 0) >= 0 ? COLORS.success : COLORS.danger,
              },
              { label: 'Expected Cash in Hand', value: formatCurrency(summary.cash_in_hand_expected ?? 0), color: COLORS.accent },
            ].map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{item.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: item.color }}>{item.value}</Text>
              </View>
            ))}
          </Card>

          <InputField
            label="Actual Cash Counted"
            value={actualCash}
            onChangeText={setActualCash}
            placeholder="Enter the cash you counted"
            keyboardType="numeric"
            prefix={CURRENCY_SYMBOL}
            hint="Count your cash and enter the actual amount on hand."
            required
          />

          {actualCash !== '' ? (
            <View
              style={{
                backgroundColor:
                  parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                    ? '#ECFDF3'
                    : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                      ? '#EEF4FF'
                      : '#FEF3F2',
                borderWidth: 1,
                borderRadius: RADIUS.md,
                borderColor:
                  parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                    ? '#BFD9CA'
                    : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                      ? '#B7CADB'
                      : '#DDAEA6',
                padding: 14,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                {parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                  ? 'Balance is exact.'
                  : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                    ? `Surplus: ${CURRENCY_SYMBOL}${(parseFloat(actualCash) - (summary.cash_in_hand_expected ?? 0)).toLocaleString()} extra`
                    : `Shortage: ${CURRENCY_SYMBOL}${((summary.cash_in_hand_expected ?? 0) - parseFloat(actualCash)).toLocaleString()} missing`}
              </Text>
            </View>
          ) : null}

          <InputField
            label="Notes (optional)"
            value={closeNotes}
            onChangeText={setCloseNotes}
            placeholder="Any notes about today's operations..."
            multiline
            numberOfLines={3}
          />

          <Button
            title="Confirm and Close Day"
            onPress={handleCloseDay}
            loading={isSaving}
            size="lg"
            style={{ marginTop: 8 }}
          />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
