import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SectionList,
  Text,
  View,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isToday, isYesterday } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { deleteDebtRepaymentRecord, deleteSaleRecord } from '@/lib/recordDeletion';
import { removeCachedRow } from '@/lib/offlineStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { EmptyState } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { ReceiptPreviewModal, SaleActivityCard } from '@/components/sales';
import { COLORS, CURRENCY_SYMBOL, FONT, SP } from '@/constants';
import { RevenueActivity, Sale } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function SalesScreen() {
  const insets = useSafeAreaInsets();
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const businessAddress = useAuthStore((s) => s.currentBusiness?.address);
  const businessPhone = useAuthStore((s) => s.currentBusiness?.phone);
  const branchName = useAuthStore((s) => s.currentBranch?.name);

  const [activities, setActivities] = useState<RevenueActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openRecordSale = () => router.push('/(app)/record-sale');

  const loadActivities = useCallback(async (isRefreshing = false) => {
    if (!businessId || !branchId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await fetchRevenueActivities(businessId, branchId, 60);
      setActivities(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, branchId]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities])
  );

  useRealtimeRefresh({
    channelName: `sales-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
      ...(businessId ? [{ table: 'debt_repayments', filter: `business_id=eq.${businessId}` }] : []),
    ],
    onRefresh: () => loadActivities(),
  });

  const generateSaleReceipt = async (saleId: string) => {
    setGeneratingReceiptId(saleId);
    try {
      const { data: sale, error } = await supabase
        .from('sales')
        .select(`
          *,
          customer:customers(*),
          items:sale_items(
            *,
            product:products(*)
          )
        `)
        .eq('id', saleId)
        .single();

      if (error) throw error;
      setPreviewSale(sale as Sale);
    } catch (err) {
      Alert.alert('Unable to generate receipt', 'The sale receipt could not be prepared right now.');
      console.error(err);
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  const generateRepaymentReceipt = async (repaymentId: string) => {
    setGeneratingReceiptId(repaymentId);
    try {
      const { data: repayment, error: repaymentError } = await supabase
        .from('debt_repayments')
        .select(`
          *,
          debt:customer_debts (
            id,
            original_amount,
            amount_paid,
            balance,
            customer_name,
            customer_phone,
            status,
            sale_id
          )
        `)
        .eq('id', repaymentId)
        .single();

      if (repaymentError) throw repaymentError;

      const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
      if (!debt) throw new Error('No linked debt found');

      let originalSale: any = null;
      let saleItems: any[] = [];
      if (debt.sale_id) {
        const { data: sale } = await supabase
          .from('sales')
          .select('*, customer:customers(name, phone)')
          .eq('id', debt.sale_id)
          .single();
        originalSale = sale;

        if (sale) {
          const { data: items } = await supabase
            .from('sale_items')
            .select('*, product:products(name)')
            .eq('sale_id', debt.sale_id);
          saleItems = items ?? [];
        }
      }

      const synthesizedSale: any = {
        id: repayment.id,
        sale_number: originalSale?.sale_number ?? `PAY-${repayment.id.substring(0, 8).toUpperCase()}`,
        created_at: repayment.created_at,
        customer: originalSale?.customer ?? {
          name: debt.customer_name,
          phone: debt.customer_phone ?? undefined,
        },
        items: saleItems,
        subtotal: originalSale?.subtotal ?? repayment.amount,
        discount_amount: originalSale?.discount_amount ?? 0,
        tax_amount: originalSale?.tax_amount ?? 0,
        total_amount: originalSale?.total_amount ?? repayment.amount,
        amount_paid: repayment.amount,
        amount_owed: Math.max(0, debt.balance),
        payment_status: debt.status === 'settled' ? 'paid' : 'partial',
        payment_method: repayment.payment_method,
        notes: repayment.notes ?? originalSale?.notes,
        isRepayment: true,
        originalTotalAmount: originalSale?.total_amount ?? debt.original_amount,
        originalAmountPaid: originalSale?.amount_paid,
        accumulatedAmountPaid: debt.amount_paid,
      };

      setPreviewSale(synthesizedSale as any as Sale);
    } catch (err) {
      Alert.alert('Unable to generate receipt', 'The payment receipt could not be prepared right now.');
      console.error(err);
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  const handleDeleteActivity = useCallback((activity: RevenueActivity) => {
    Alert.alert(
      'Delete record',
      `Delete this ${activity.kind === 'sale' ? 'sale' : 'debt payment'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (activity.kind === 'sale') {
                const saleId = activity.sale_id ?? activity.id;
                await deleteSaleRecord(saleId);
                if (businessId && branchId) {
                  await removeCachedRow({ businessId, branchId }, 'sales', saleId);
                  await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                }
              } else {
                await deleteDebtRepaymentRecord(activity.id);
                if (businessId && branchId) {
                  await removeCachedRow({ businessId, branchId }, 'debt_repayments', activity.id);
                  await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                }
              }
              await loadActivities();
              Toast.show({ type: 'success', text1: 'Record deleted' });
            } catch (err: any) {
              Alert.alert('Unable to delete', err.message ?? 'Please try again.');
            }
          }
        }
      ]
    );
  }, [businessId, branchId, loadActivities]);

  const handleToggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleGenerateReceipt = useCallback((item: RevenueActivity) => {
    if (item.kind === 'debt_repayment') {
      generateRepaymentReceipt(item.id);
    } else if (item.sale_id) {
      generateSaleReceipt(item.sale_id);
    }
  }, [businessId, branchId]);

  const groupedActivities = useMemo(() => {
    if (!activities || activities.length === 0) return [];

    const map = new Map<string, RevenueActivity[]>();
    for (const item of activities) {
      let key = 'Unknown';
      try {
        if (item.created_at) {
          key = format(new Date(item.created_at), 'yyyy-MM-dd');
        }
      } catch {
        key = item.created_at ? item.created_at.slice(0, 10) : 'Unknown';
      }

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }

    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((dateKey) => {
      const items = map.get(dateKey)!.sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        return tB - tA;
      });

      // Sum amount_paid to accurately reflect actual collected revenue for the day (matches Today's Revenue and prevents double-counting debt settlements)
      const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount_paid) || 0), 0);

      let dateLabel = dateKey;
      try {
        const [y, m, d] = dateKey.split('-').map(Number);
        if (y && m && d) {
          const parsed = new Date(y, m - 1, d);
          if (isToday(parsed)) {
            dateLabel = `Today · ${format(parsed, 'd MMM yyyy')}`;
          } else if (isYesterday(parsed)) {
            dateLabel = `Yesterday · ${format(parsed, 'd MMM yyyy')}`;
          } else {
            dateLabel = format(parsed, 'EEEE, d MMM yyyy');
          }
        }
      } catch {}

      return {
        date: dateKey,
        dateLabel,
        totalAmount,
        data: items,
      };
    });
  }, [activities]);

  const renderActivityItem = useCallback(({ item }: { item: RevenueActivity }) => {
    return (
      <View style={{ paddingHorizontal: SP.page }}>
        <SaleActivityCard 
          item={item}
          isExpanded={expandedId === item.id}
          onToggleExpand={handleToggleExpand}
          onDelete={handleDeleteActivity}
          generatingReceiptId={generatingReceiptId}
          onGenerateReceipt={handleGenerateReceipt}
        />
      </View>
    );
  }, [expandedId, handleToggleExpand, handleDeleteActivity, generatingReceiptId, handleGenerateReceipt]);

  return (
    <SwipeableTabScreen name="sales">
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Sales"
          subtitle={`${activities.length} activity record${activities.length === 1 ? '' : 's'}`}
          theme="dark"
          right={<HeaderAction icon="plus" label="Record Sale" onPress={openRecordSale} />}
        />

        <SectionList
          sections={groupedActivities}
          keyExtractor={(item: any) => `${item.kind}-${item.id}`}
          stickySectionHeadersEnabled={true}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingTop: 6,
            paddingBottom: insets.bottom + 92,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SP.page, paddingTop: 20 }}>
              <EmptyState
                icon="shopping-cart"
                title="No sales yet"
                description="Record your first sale or debt collection to start tracking revenue and stock movement."
                action={{ label: 'Record Sale', onPress: openRecordSale }}
              />
            </View>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadActivities(true);
              }}
              tintColor={COLORS.accent}
            />
          }
          renderSectionHeader={({ section: { dateLabel, totalAmount } }) => (
            <View
              style={{
                backgroundColor: COLORS.surface,
                paddingHorizontal: SP.page,
                paddingTop: 10,
                paddingBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={13} color={COLORS.text.muted} />
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 13,
                    color: COLORS.text.primary,
                  }}
                >
                  {dateLabel}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: FONT.bold,
                  fontSize: 13,
                  color: COLORS.success,
                }}
              >
                +{formatCurrency(totalAmount)}
              </Text>
            </View>
          )}
          renderItem={renderActivityItem}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 14 }} />}
        />

        <ReceiptPreviewModal
          visible={previewSale !== null}
          onClose={() => setPreviewSale(null)}
          previewSale={previewSale}
          businessId={businessId}
          branchId={branchId}
          businessName={businessName}
          branchName={branchName}
          businessAddress={businessAddress}
          businessPhone={businessPhone}
        />
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(SalesScreen);
