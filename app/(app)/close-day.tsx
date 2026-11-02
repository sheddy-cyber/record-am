import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { dismissScreen } from '@/lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { useNotificationStore } from '@/store/notificationStore';
import { Button, Card, EmptyState, LoadingScreen, PermissionDenied } from '@/components/ui';
import { canViewFinancialData } from '@/lib/permissions';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) => {
  const isNegative = value < 0;
  const formatted = Math.abs(value).toLocaleString('en-NG', { minimumFractionDigits: 0 });
  return `${isNegative ? '-' : ''}${CURRENCY_SYMBOL}${formatted}`;
};

export default function CloseDayScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user, userRole } = useAuthStore();
  const canViewFinancials = canViewFinancialData(userRole);
  const [refreshing, setRefreshing] = useState(false);
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

  const closeScreen = () => dismissScreen();

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    setRefreshing(true);
    try {
      await fetchDailyBalance(currentBusiness.id, currentBranch.id, selectedDate);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBranch, currentBusiness, fetchDailyBalance, selectedDate]);

  useEffect(() => {
    if (canViewFinancials && !summary && currentBusiness && currentBranch) {
      fetchDailyBalance(currentBusiness.id, currentBranch.id, selectedDate);
    }
  }, [canViewFinancials, currentBranch, currentBusiness, fetchDailyBalance, selectedDate, summary]);

  const initializedDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!summary) return;
    if (initializedDateRef.current === selectedDate) return;

    setActualCash((summary.cash_in_hand_actual ?? summary.cash_in_hand_expected).toFixed(0));
    if (summary.notes) {
      setCloseNotes(summary.notes);
    }
    initializedDateRef.current = selectedDate;
  }, [selectedDate, summary]);

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

    try {
      await useNotificationStore.getState().markDailySummaryAsRead(selectedDate, user.id);
    } catch (_) {}

    Toast.show({
      type: 'success',
      text1: 'Day closed',
      text2: `${format(new Date(selectedDate), 'MMM d')} has been balanced and saved.`,
    });

    closeScreen();
  };


  if (!canViewFinancials) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Close and Balance Day"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <PermissionDenied
          title="Day closing is restricted"
          description="Only roles with financial access can view cash reconciliation and close the business day."
        />
      </ScreenShell>
    );
  }

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
          <Card style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Day Financial Summary
            </Text>
            {[
              { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: COLORS.success },
              ...(summary.total_discounts && summary.total_discounts > 0
                ? [{ label: 'Total Discounts Given', value: formatCurrency(summary.total_discounts), color: COLORS.warning }]
                : []),
              { label: 'Total Expenses', value: formatCurrency(summary.total_expenses ?? 0), color: COLORS.danger },
              {
                label: 'Net Profit',
                value: formatCurrency(summary.net_profit ?? 0),
                color: (summary.net_profit ?? 0) >= 0 ? COLORS.success : COLORS.danger,
              },
              { label: 'Expected Cash in Hand', value: formatCurrency(summary.cash_in_hand_expected ?? 0), color: COLORS.accentDark },
            ].map((item, idx, arr) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: idx === arr.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: COLORS.borderSubtle,
                }}
              >
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{item.label}</Text>
                <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: item.color }}>{item.value}</Text>
              </View>
            ))}
          </Card>

          <Card style={{ padding: 18, gap: 14 }}>
            <InputField
              label="Actual Cash Counted"
              value={actualCash}
              onChangeText={setActualCash}
              placeholder="0"
              keyboardType="numeric"
              prefix={CURRENCY_SYMBOL}
              isAmount={true}
              hint="Count physical cash in your drawer/register and enter the amount."
              required
              containerStyle={{ marginBottom: 0 }}
            />

            {actualCash !== '' && !Number.isNaN(parseFloat(actualCash)) ? (
              <View
                style={{
                  backgroundColor:
                    parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                      ? COLORS.successLight
                      : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                        ? COLORS.infoLight
                        : COLORS.dangerLight,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: RADIUS.md,
                  borderColor:
                    parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                      ? COLORS.success
                      : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                        ? COLORS.info
                        : COLORS.danger,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Feather
                  name={
                    parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                      ? 'check-circle'
                      : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                        ? 'trending-up'
                        : 'alert-triangle'
                  }
                  size={18}
                  color={
                    parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                      ? COLORS.success
                      : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                        ? COLORS.info
                        : COLORS.danger
                  }
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: FONT.medium,
                    color:
                      parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                        ? COLORS.success
                        : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                          ? COLORS.info
                          : COLORS.danger,
                    flex: 1,
                  }}
                >
                  {parseFloat(actualCash) === (summary.cash_in_hand_expected ?? 0)
                    ? 'Balance is exact. Zero cash discrepancy.'
                    : parseFloat(actualCash) > (summary.cash_in_hand_expected ?? 0)
                      ? `Surplus: ${CURRENCY_SYMBOL}${(parseFloat(actualCash) - (summary.cash_in_hand_expected ?? 0)).toLocaleString()} extra cash in register`
                      : `Shortage: ${CURRENCY_SYMBOL}${((summary.cash_in_hand_expected ?? 0) - parseFloat(actualCash)).toLocaleString()} missing from register`}
                </Text>
              </View>
            ) : null}

            <InputField
              label="Notes (optional)"
              value={closeNotes}
              onChangeText={setCloseNotes}
              placeholder="Any operational notes or reasons for discrepancy..."
              multiline
              numberOfLines={2}
              containerStyle={{ marginBottom: 4 }}
            />

            <Button
              title="Confirm and Close Day"
              onPress={handleCloseDay}
              loading={isSaving}
              size="lg"
            />
          </Card>
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
