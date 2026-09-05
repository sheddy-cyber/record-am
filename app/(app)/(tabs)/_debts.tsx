import React, { useCallback, useEffect, useState } from 'react';
import { Alert, InteractionManager, Text, View, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { differenceInDays, format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { supabase } from '@/lib/supabase';
import { cacheCustomerDebts, readCachedCustomerDebts } from '@/lib/offlineStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useTabStore } from '@/store/tabStore';
import { useDebtStore } from '@/store/debtStore';
import { shareDebtReminderViaWhatsApp } from '@/lib/reports';
import { Badge, Button, Divider, EmptyState, LoadingScreen } from '@/components/ui';
import { FlatSection, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, SP } from '@/constants';
import { CustomerDebt } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const customers = useCustomerStore((s) => s.customers);
  const debts = useDebtStore((s) => s.debts);
  const fetchDebts = useDebtStore((s) => s.fetchDebts);
  const [refreshing, setRefreshing] = useState(false);

  const loadDebts = useCallback(async () => {
    if (businessId && branchId) {
      await fetchDebts(businessId, branchId);
    }
  }, [businessId, branchId, fetchDebts]);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useFocusEffect(
    useCallback(() => {
      loadDebts();
    }, [loadDebts])
  );

  useRealtimeRefresh({
    channelName: `debts-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
    ],
    onRefresh: loadDebts,
  });

  const totalOutstanding = debts.reduce((sum, debt) => sum + debt.balance, 0);

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

  // Render instantly without blocking UI. RefreshControl handles background loading state.

  return (
    <SwipeableTabScreen name="debts">
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Debts"
        subtitle={`${debts.length} open \u00B7 ${formatCurrency(totalOutstanding)}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Record Debt" onPress={() => router.push('/(app)/record-debt')} />}
      />



      <FlashList
        data={debts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: insets.bottom + 92, flexGrow: 1 }}
        
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadDebts();
              setRefreshing(false);
            }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="clipboard"
            title="No outstanding debts"
            description="All customer debts are settled. Record a new credit sale or standalone debt when needed."
            action={{ label: 'Record Debt', onPress: () => router.push('/(app)/record-debt') }}
          />
        }
        ListHeaderComponent={
          debts.length > 0 ? (
            <FlatSection style={{ padding: 16, marginTop: SP.page, marginBottom: 12 }}>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>Outstanding balance</Text>
              <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 6 }}>
                {formatCurrency(totalOutstanding)}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                Customers with unpaid balances stay here until fully settled.
              </Text>
            </FlatSection>
          ) : null
        }
        ListFooterComponent={
          debts.length > 0 ? (
            <FlatSection style={{ padding: 14, marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary, textAlign: 'center' }}>
                Track repayments here. Settled debts get added to sales automatically.
              </Text>
            </FlatSection>
          ) : null
        }
          renderItem={({ item, index }) => {
            const customer = customers.find((c) => c.id === item.customer_id);
            const resolvedPhone = customer?.phone || item.customer_phone;

            return (
              <View
                style={{
                  paddingVertical: SP.page,
                  borderBottomWidth: index === debts.length - 1 ? 0 : 1,
                  borderBottomColor: COLORS.border,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {item.customer_name}
                    </Text>
                    {resolvedPhone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <Feather name="phone" size={12} color={COLORS.text.muted} />
                        <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>
                          {resolvedPhone}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 6 }}>
                      Recorded {getDebtAge(item)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>
                      {formatCurrency(item.balance)}
                    </Text>
                    <Badge
                      label={isOverdue(item) ? 'Overdue' : item.status === 'partial' ? 'Partial' : 'Outstanding'}
                      variant={isOverdue(item) ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                    />
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                      Paid {formatCurrency(item.amount_paid)}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                      Original {formatCurrency(item.original_amount)}
                    </Text>
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
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 12,
                        color: isOverdue(item) ? COLORS.danger : COLORS.text.muted,
                      }}
                    >
                      Due {format(new Date(item.due_date), 'MMM d, yyyy')}
                    </Text>
                  </View>
                ) : null}

                {item.notes ? (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary }}>{item.notes}</Text>
                ) : null}

                <Divider />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    title="Record Payment"
                    onPress={() => router.push({ pathname: '/(app)/record-payment', params: { debtId: item.id } })}
                    variant="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Send Reminder"
                    onPress={() => {
                      if (!resolvedPhone) {
                        Alert.alert(
                          'No phone number',
                          'Please edit this customer and add a phone number to send a WhatsApp reminder.'
                        );
                        return;
                      }
                      shareDebtReminderViaWhatsApp(
                        item.customer_name,
                        resolvedPhone,
                        item.balance,
                        businessName ?? '',
                        item.due_date,
                      );
                    }}
                    variant="ghost"
                    size="sm"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          }}
        />
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(DebtsScreen);
