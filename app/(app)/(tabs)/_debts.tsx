import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, InteractionManager, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { differenceInDays, format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { cacheCustomerDebts, readCachedCustomerDebts } from '@/lib/offlineStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useTabStore } from '@/store/tabStore';
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


  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDebts = useCallback(async () => {
    if (!businessId || !branchId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .neq('status', 'settled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const serverDebts = (data as CustomerDebt[]) ?? [];
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const serverDebtIds = new Set(serverDebts.map((debt) => debt.id));
      const nextDebts = [
        ...serverDebts,
        ...cachedDebts.filter((debt) => !serverDebtIds.has(debt.id) && debt.status !== 'settled'),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDebts(nextDebts);
      await cacheCustomerDebts(businessId, branchId, nextDebts);
    } catch (err) {
      console.error(err);
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      setDebts(cachedDebts.filter((debt) => debt.status !== 'settled'));
    } finally {
      setLoading(false);
    }
  }, [businessId, branchId]);

  const activeTab = useTabStore((s) => s.activeTab);

  useEffect(() => {
    if (activeTab === 'debts') {
      InteractionManager.runAfterInteractions(() => {
        loadDebts();
      });
    }
  }, [activeTab, loadDebts]);

  // Refetch handled by activeTab selector above — no focus listener needed

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



      {debts.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No outstanding debts"
          description="All customer debts are settled. Record a new credit sale or standalone debt when needed."
          action={{ label: 'Record Debt', onPress: () => router.push('/(app)/record-debt') }}
        />
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: insets.bottom + 92 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          ListHeaderComponent={
            <FlatSection style={{ padding: 16, marginTop: SP.page, marginBottom: 12 }}>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>Outstanding balance</Text>
              <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 6 }}>
                {formatCurrency(totalOutstanding)}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                Customers with unpaid balances stay here until fully settled.
              </Text>
            </FlatSection>
          }
          ListFooterComponent={
            <FlatSection style={{ padding: 14, marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary, textAlign: 'center' }}>
                Track repayments here. Settled debts get added to sales automatically.
              </Text>
            </FlatSection>
          }
          renderItem={({ item, index }) => (
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
                  {item.customer_phone ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Feather name="phone" size={12} color={COLORS.text.muted} />
                      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>
                        {item.customer_phone}
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
                    if (!item.customer_phone) {
                      Alert.alert(
                        'No phone number',
                        'Please edit this customer and add a phone number to send a WhatsApp reminder.'
                      );
                      return;
                    }
                    shareDebtReminderViaWhatsApp(
                      item.customer_name,
                      item.customer_phone,
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
          )}
        />
      )}
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(DebtsScreen);
