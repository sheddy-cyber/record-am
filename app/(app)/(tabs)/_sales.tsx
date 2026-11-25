import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  InteractionManager,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isToday, isYesterday, startOfMonth, startOfWeek } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDebtStore } from '@/store/debtStore';
import { useCustomerStore } from '@/store/customerStore';
import { useTabStore } from '@/store/tabStore';
import { useOfflineStore } from '@/store/offlineStore';
import { supabase } from '@/lib/supabase';
import { saleItemsTable } from '@/lib/dataAccess';
import { fetchRevenueActivitiesPage, parseLocalDateString } from '@/lib/revenue';
import { cleanSaleNotes } from '@/lib/records';
import { deleteDebtRepaymentRecord, deleteSaleRecord } from '@/lib/recordDeletion';
import {
  decrementPersistedDashboardSales,
  flushOfflineQueue,
  readCachedRows,
  removeCachedRow,
  retryAllSyncConflicts,
} from '@/lib/offlineStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { EmptyState } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { ReceiptPreviewModal, SaleActivityCard } from '@/components/sales';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { PaymentMethod, Product, RevenueActivity, Sale } from '@/types';

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
  const businessLogoUrl = useAuthStore((s) => s.currentBusiness?.logo_url);
  const businessAddress = useAuthStore((s) => s.currentBusiness?.address);
  const businessPhone = useAuthStore((s) => s.currentBusiness?.phone);
  const branchName = useAuthStore((s) => s.currentBranch?.name);

  const [activities, setActivities] = useState<RevenueActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [iosDraftDate, setIosDraftDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMergingReceipts, setIsMergingReceipts] = useState(false);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const conflictCount = useOfflineStore((s) => s.conflictCount);
  const isSyncing = useOfflineStore((s) => s.isSyncing);

  const dateRange = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateFilter === 'today') return { fromDate: todayStr, toDate: todayStr };
    if (dateFilter === 'week') {
      return {
        fromDate: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        toDate: todayStr,
      };
    }
    if (dateFilter === 'month') {
      return {
        fromDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        toDate: todayStr,
      };
    }
    if (dateFilter === 'custom') {
      return { fromDate: customDate, toDate: customDate };
    }
    return { fromDate: undefined, toDate: undefined };
  }, [dateFilter, customDate]);

  const isSelectionMode = selectedIds.size > 0;

  const selectedSales = useMemo(() => {
    return activities.filter((a) => selectedIds.has(a.id) && a.kind === 'sale');
  }, [activities, selectedIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedSales.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0);
  }, [selectedSales]);

  const saleActivities = useMemo(() => {
    return activities.filter((a) => a.kind === 'sale');
  }, [activities]);

  const allSalesSelected =
    saleActivities.length > 0 && selectedSales.length === saleActivities.length;

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedIds(new Set());
      return true;
    });
    return () => backHandler.remove();
  }, [selectedIds.size]);

  const handleToggleSelect = useCallback((item: RevenueActivity) => {
    if (item.kind !== 'sale') {
      Toast.show({
        type: 'info',
        text1: 'Sales only',
        text2: 'Only sales can be merged into a combined receipt.',
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }, []);

  const handleLongPressSelect = useCallback((item: RevenueActivity) => {
    if (item.kind !== 'sale') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (allSalesSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(saleActivities.map((a) => a.id)));
    }
  }, [allSalesSelected, saleActivities]);

  const openRecordSale = () => router.push('/(app)/record-sale');

  const loadActivities = useCallback(async (isRefreshing = false) => {
    if (!businessId || !branchId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefreshing) {
      setRefreshing(true);
    } else if (pageRef.current === 0) {
      setLoading(true);
    }

    try {
      const result = await fetchRevenueActivitiesPage({
        businessId,
        branchId,
        page: 0,
        pageSize: 50,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      });
      pageRef.current = 0;
      setActivities(result.activities);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, branchId, dateRange.fromDate, dateRange.toDate]);

  const loadMoreActivities = useCallback(async () => {
    if (!businessId || !branchId || !hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await fetchRevenueActivitiesPage({
        businessId,
        branchId,
        page: nextPage,
        pageSize: 50,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      });
      pageRef.current = nextPage;
      setHasMore(result.hasMore);
      setActivities((prev) => {
        const seen = new Set(prev.map((a) => `${a.kind}-${a.id}`));
        const appended = result.activities.filter((a) => !seen.has(`${a.kind}-${a.id}`));
        return [...prev, ...appended];
      });
    } catch (err) {
      console.error('[sales] loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [businessId, branchId, hasMore, loadingMore, loading, dateRange.fromDate, dateRange.toDate]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities])
  );

  // Refresh immediately when switching to the Sales tab inside PagerView or returning to app foreground
  useEffect(() => {
    const unsubTab = useTabStore.subscribe(
      (state) => state.activeTab,
      (activeTab, prevActiveTab) => {
        if (activeTab === 'sales' && prevActiveTab !== 'sales') {
          InteractionManager.runAfterInteractions(() => {
            void loadActivities();
          });
        }
      },
    );

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadActivities();
      }
    });

    return () => {
      unsubTab();
      appStateSub.remove();
    };
  }, [loadActivities]);

  useRealtimeRefresh({
    channelName: `sales-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
    ],
    onRefresh: () => loadActivities(),
  });

  const generateSaleReceipt = async (saleId: string) => {
    setGeneratingReceiptId(saleId);
    try {
      const itemsSource = saleItemsTable();
      const includeCosts = itemsSource === 'sale_items';
      let sale: any = null;

      try {
        const { data, error } = await supabase
          .from('sales')
          .select(
            includeCosts
              ? `*, customer:customers(*), items:sale_items(*, product:products(*))`
              : `*, customer:customers(*), items:staff_sale_items(*)`,
          )
          .eq('id', saleId)
          .single();
        if (!error && data) {
          sale = data;
        }
      } catch (networkErr) {
        console.warn('Network error fetching sale receipt, falling back to cache:', networkErr);
      }

      if (!sale && businessId && branchId) {
        const cachedSales = await readCachedRows<any>({ businessId, branchId }, 'sales');
        const foundSale = cachedSales.find((s) => s.id === saleId);
        if (foundSale) {
          const cachedItems = await readCachedRows<any>({ businessId, branchId }, 'sale_items');
          const items = cachedItems.filter((i) => i.sale_id === saleId);
          sale = { ...foundSale, items };
        }
      }

      if (!sale) throw new Error('Sale record not found');
      let enrichedSale = sale as Sale;
      if (!includeCosts && enrichedSale.items?.length) {
        const productIds = enrichedSale.items
          .map((item) => item.product_id)
          .filter((id): id is string => Boolean(id));
        const { data: productRows } = await supabase
          .from('staff_products')
          .select('id, name, unit, selling_price, sku, barcode, is_service')
          .in('id', productIds);
        const byId = new Map((productRows ?? []).map((row) => [row.id, row]));
        enrichedSale = {
          ...enrichedSale,
          items: enrichedSale.items.map((item) => ({
            ...item,
            product: item.product_id
              ? (byId.get(item.product_id) as Product | undefined)
              : undefined,
          })),
        };
      }
      setPreviewSale(enrichedSale);
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
          const itemsSource = saleItemsTable();
          const { data: items } = await supabase
            .from(itemsSource)
            .select('*')
            .eq('sale_id', debt.sale_id);
          saleItems = items ?? [];
          if (itemsSource === 'staff_sale_items' && saleItems.length > 0) {
            const productIds = saleItems.map((item) => item.product_id).filter(Boolean);
            const { data: productRows } = await supabase
              .from('staff_products')
              .select('id, name')
              .in('id', productIds);
            const byId = new Map((productRows ?? []).map((row) => [row.id, row]));
            saleItems = saleItems.map((item) => ({
              ...item,
              product: item.product_id ? byId.get(item.product_id) : undefined,
            }));
          } else if (itemsSource === 'sale_items') {
            const { data: itemsWithProducts } = await supabase
              .from('sale_items')
              .select('*, product:products(name)')
              .eq('sale_id', debt.sale_id);
            saleItems = itemsWithProducts ?? [];
          }
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
              const isRecordedToday = activity.created_at
                ? isToday(new Date(activity.created_at))
                : true;
              const paidAmount = Number(activity.amount_paid || 0);
              const owedAmount = Number(activity.amount_owed || 0);

              if (activity.kind === 'sale') {
                const saleId = activity.sale_id ?? activity.id;
                await deleteSaleRecord(saleId);
                // Remove linked debt from the debts page immediately
                if (businessId && branchId) {
                  await useDebtStore.getState().removeDebtBySaleId(saleId, businessId, branchId);
                  if (owedAmount > 0) {
                    await useCustomerStore.getState().removeDebt({
                      debtId: saleId,
                      customerName: activity.customer_name,
                      balance: owedAmount,
                      businessId,
                    });
                  }
                }
                if (businessId && branchId) {
                  await removeCachedRow({ businessId, branchId }, 'sales', saleId);
                  await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                  if (isRecordedToday) {
                    await decrementPersistedDashboardSales(businessId, branchId, paidAmount, owedAmount);
                  }
                }
                if (isRecordedToday) {
                  useDashboardStore.getState().decrementTodaySales(paidAmount, owedAmount);
                } else if (owedAmount > 0) {
                  useDashboardStore.getState().decrementTodaySales(0, owedAmount);
                }
              } else {
                await deleteDebtRepaymentRecord(activity.id);
                if (businessId && branchId) {
                  await removeCachedRow({ businessId, branchId }, 'debt_repayments', activity.id);
                  await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                  if (isRecordedToday) {
                    await decrementPersistedDashboardSales(businessId, branchId, paidAmount, 0);
                  }
                }
                if (isRecordedToday) {
                  useDashboardStore.getState().decrementRepaymentFromTodaySales(paidAmount);
                }
              }

              if (businessId && branchId) {
                void useDashboardStore.getState().refreshFromCache(businessId, branchId);
                void useAnalyticsStore.getState().refreshFromCache(businessId, branchId);
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

  const handleDeleteSelected = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;

    Alert.alert(
      'Delete Selected Records',
      `Delete ${count} selected record${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const selectedActivities = activities.filter((a) => selectedIds.has(a.id));

              for (const activity of selectedActivities) {
                const isRecordedToday = activity.created_at
                  ? isToday(new Date(activity.created_at))
                  : true;
                const paidAmount = Number(activity.amount_paid || 0);
                const owedAmount = Number(activity.amount_owed || 0);

                if (activity.kind === 'sale') {
                  const saleId = activity.sale_id ?? activity.id;
                  await deleteSaleRecord(saleId);
                  if (businessId && branchId) {
                    await useDebtStore.getState().removeDebtBySaleId(saleId, businessId, branchId);
                    if (owedAmount > 0) {
                      await useCustomerStore.getState().removeDebt({
                        debtId: saleId,
                        customerName: activity.customer_name,
                        balance: owedAmount,
                        businessId,
                      });
                    }
                    await removeCachedRow({ businessId, branchId }, 'sales', saleId);
                    await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                    if (isRecordedToday) {
                      await decrementPersistedDashboardSales(businessId, branchId, paidAmount, owedAmount);
                    }
                  }
                  if (isRecordedToday) {
                    useDashboardStore.getState().decrementTodaySales(paidAmount, owedAmount);
                  } else if (owedAmount > 0) {
                    useDashboardStore.getState().decrementTodaySales(0, owedAmount);
                  }
                } else {
                  await deleteDebtRepaymentRecord(activity.id);
                  if (businessId && branchId) {
                    await removeCachedRow({ businessId, branchId }, 'debt_repayments', activity.id);
                    await removeCachedRow({ businessId, branchId }, 'revenue_activities', activity.id);
                    if (isRecordedToday) {
                      await decrementPersistedDashboardSales(businessId, branchId, paidAmount, 0);
                    }
                  }
                  if (isRecordedToday) {
                    useDashboardStore.getState().decrementRepaymentFromTodaySales(paidAmount);
                  }
                }
              }

              if (businessId && branchId) {
                void useDashboardStore.getState().refreshFromCache(businessId, branchId);
                void useAnalyticsStore.getState().refreshFromCache(businessId, branchId);
              }

              setSelectedIds(new Set());
              await loadActivities();
              Toast.show({ type: 'success', text1: `${count} records deleted` });
            } catch (err: any) {
              Alert.alert('Unable to delete', err?.message ?? 'Please try again.');
            }
          },
        },
      ]
    );
  }, [selectedIds, activities, businessId, branchId, loadActivities]);

  const handleMergeReceipts = useCallback(async () => {
    const selectedSaleActivities = activities.filter(
      (a) => selectedIds.has(a.id) && a.kind === 'sale'
    );

    if (selectedSaleActivities.length < 2) {
      Toast.show({
        type: 'info',
        text1: 'Select 2 or more sales',
        text2: 'Hold down or tap multiple sales to merge them into one receipt.',
      });
      return;
    }

    setIsMergingReceipts(true);
    try {
      const itemsSource = saleItemsTable();
      const includeCosts = itemsSource === 'sale_items';
      const fullSales: Sale[] = [];

      for (const activity of selectedSaleActivities) {
        const saleId = activity.sale_id ?? activity.id;
        let sale: any = null;

        try {
          const { data, error } = await supabase
            .from('sales')
            .select(
              includeCosts
                ? `*, customer:customers(*), items:sale_items(*, product:products(*))`
                : `*, customer:customers(*), items:staff_sale_items(*)`,
            )
            .eq('id', saleId)
            .single();
          if (!error && data) {
            sale = data;
          }
        } catch (networkErr) {
          console.warn('Network error fetching sale receipt, falling back to cache:', networkErr);
        }

        if (!sale && businessId && branchId) {
          const cachedSales = await readCachedRows<any>({ businessId, branchId }, 'sales');
          const foundSale = cachedSales.find((s) => s.id === saleId);
          if (foundSale) {
            const cachedItems = await readCachedRows<any>({ businessId, branchId }, 'sale_items');
            const items = cachedItems.filter((i) => i.sale_id === saleId);
            sale = { ...foundSale, items };
          }
        }

        if (!sale) {
          sale = {
            id: activity.sale_id ?? activity.id,
            business_id: businessId ?? '',
            branch_id: branchId ?? '',
            customer_id: undefined,
            sale_number: activity.reference || `REC-${activity.id.slice(0, 6)}`,
            subtotal: activity.subtotal ?? activity.total_amount,
            discount_amount: activity.discount_amount ?? 0,
            tax_amount: 0,
            total_amount: activity.total_amount,
            amount_paid: activity.amount_paid,
            amount_owed: activity.amount_owed,
            payment_status: activity.payment_status,
            payment_method: activity.payment_method,
            cash_amount: activity.cash_amount,
            transfer_amount: activity.transfer_amount,
            bank_name: activity.bank_name,
            notes: activity.notes,
            sold_by_name: activity.sold_by_name,
            created_at: activity.created_at,
            updated_at: activity.created_at,
            customer: {
              id: 'walk-in',
              name: activity.customer_name,
              phone: activity.customer_phone,
            },
            items: (activity.items ?? []).map((it, idx) => ({
              id: `item-${idx}`,
              sale_id: activity.sale_id ?? activity.id,
              product_id: '',
              product_name: it.product_name,
              product: { name: it.product_name } as any,
              quantity: it.quantity,
              unit_price: it.unit_price ?? (it.quantity > 0 ? it.total_price / it.quantity : it.total_price),
              discount_amount: it.discount_amount ?? 0,
              total_price: it.total_price,
              created_at: activity.created_at,
            })),
          };
        }

        if (!includeCosts && sale.items?.length) {
          const productIds = sale.items
            .map((item: any) => item.product_id)
            .filter((id: any): id is string => Boolean(id));
          if (productIds.length > 0) {
            const { data: productRows } = await supabase
              .from('staff_products')
              .select('id, name, unit, selling_price, sku, barcode, is_service')
              .in('id', productIds);
            const byId = new Map((productRows ?? []).map((row) => [row.id, row]));
            sale = {
              ...sale,
              items: sale.items.map((item: any) => ({
                ...item,
                product: item.product_id
                  ? (byId.get(item.product_id) as Product | undefined)
                  : undefined,
              })),
            };
          }
        }

        fullSales.push(sale as Sale);
      }

      if (fullSales.length === 0) {
        throw new Error('No sales found to merge');
      }

      // Resolve Customer: pick named customer over walk-in
      const namedCustomerSale = fullSales.find((s) => {
        const name = (s.customer as any)?.name?.trim();
        return (
          name &&
          name.toLowerCase() !== 'walk-in customer' &&
          name.toLowerCase() !== 'walk in customer' &&
          name.toLowerCase() !== 'walk-in' &&
          name.toLowerCase() !== 'walk in'
        );
      });
      const anyCustomerSale = fullSales.find((s) => (s.customer as any)?.name?.trim());
      const customer = namedCustomerSale?.customer ?? anyCustomerSale?.customer ?? {
        id: 'walk-in',
        business_id: businessId ?? '',
        name: 'Walk-in Customer',
        phone: '',
        total_debt: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Consolidate line items by grouping by product name + unit price
      type MergedItem = {
        id: string;
        sale_id: string;
        product_id: string;
        product_name: string;
        product?: Product;
        quantity: number;
        unit_price: number;
        discount_amount: number;
        total_price: number;
        cost_price?: number;
        created_at: string;
      };

      const itemMap = new Map<string, MergedItem>();
      let itemIdx = 0;

      for (const sale of fullSales) {
        const items = sale.items ?? [];
        const hasHigherPayment = sale.amount_paid > sale.total_amount;
        const totalBaseAmount = items.reduce((sum, it) => sum + (Number(it.total_price) || 0), 0) || sale.total_amount || 1;
        let remainingCalculatedTotal = hasHigherPayment ? sale.amount_paid : 0;

        items.forEach((item: any, idx: number) => {
          let itemTotalPrice = Number(item.total_price) || 0;
          let itemUnitPrice = item.unit_price;

          if (hasHigherPayment) {
            if (items.length === 1) {
              itemTotalPrice = sale.amount_paid;
            } else if (idx === items.length - 1) {
              itemTotalPrice = remainingCalculatedTotal;
            } else {
              itemTotalPrice = Number(((item.total_price / totalBaseAmount) * sale.amount_paid).toFixed(2));
              remainingCalculatedTotal = Number((remainingCalculatedTotal - itemTotalPrice).toFixed(2));
            }
            const qty = Number(item.quantity) || 1;
            itemUnitPrice = Number((itemTotalPrice / qty).toFixed(2));
          } else if (itemUnitPrice === undefined && item.quantity > 0) {
            itemUnitPrice = Number((itemTotalPrice / item.quantity).toFixed(2));
          }

          const prodName =
            (item.product as any)?.name ?? item.product_name ?? 'Item';
          const roundedUnitPrice = Number((itemUnitPrice ?? 0).toFixed(2));
          const groupKey = `${prodName.trim().toLowerCase()}__${roundedUnitPrice}`;

          if (itemMap.has(groupKey)) {
            const existing = itemMap.get(groupKey)!;
            existing.quantity += Number(item.quantity) || 1;
            existing.total_price += itemTotalPrice;
            existing.discount_amount += Number(item.discount_amount) || 0;
          } else {
            itemMap.set(groupKey, {
              id: `merged-item-${itemIdx++}`,
              sale_id: `merged-${Date.now()}`,
              product_id: item.product_id ?? '',
              product_name: prodName,
              product: item.product ?? ({ id: item.product_id, name: prodName } as any),
              quantity: Number(item.quantity) || 1,
              unit_price: roundedUnitPrice,
              total_price: itemTotalPrice,
              discount_amount: Number(item.discount_amount) || 0,
              cost_price: item.cost_price,
              created_at: item.created_at || new Date().toISOString(),
            });
          }
        });
      }

      const mergedItems = Array.from(itemMap.values());

      let totalSubtotal = fullSales.reduce(
        (sum, s) => sum + (Number(s.subtotal) || Number(s.total_amount) || 0),
        0
      );
      const totalDiscount = fullSales.reduce(
        (sum, s) => sum + (Number(s.discount_amount) || 0),
        0
      );
      const totalTax = fullSales.reduce(
        (sum, s) => sum + (Number(s.tax_amount) || 0),
        0
      );
      const totalAmount = fullSales.reduce(
        (sum, s) => sum + (Number(s.total_amount) || 0),
        0
      );
      const totalPaid = fullSales.reduce(
        (sum, s) => sum + (Number(s.amount_paid) || 0),
        0
      );
      const totalOwed = fullSales.reduce(
        (sum, s) => sum + (Number(s.amount_owed) || 0),
        0
      );

      if (totalSubtotal === 0 || totalSubtotal === totalAmount) {
        totalSubtotal = totalAmount + totalDiscount;
      }

      const methods = new Set(fullSales.map((s) => s.payment_method).filter(Boolean));
      let paymentMethod: PaymentMethod = 'cash';
      if (methods.size === 1) {
        paymentMethod = Array.from(methods)[0];
      } else if (methods.size > 1) {
        paymentMethod = 'mixed';
      }

      let cashAmount = 0;
      let transferAmount = 0;
      for (const s of fullSales) {
        if (s.payment_method === 'cash') {
          cashAmount += Number(s.amount_paid) || 0;
        } else if (s.payment_method === 'transfer') {
          transferAmount += Number(s.amount_paid) || 0;
        } else if (s.payment_method === 'mixed') {
          cashAmount += Number(s.cash_amount) || 0;
          transferAmount += Number(s.transfer_amount) || 0;
        } else {
          cashAmount += Number(s.amount_paid) || 0;
        }
      }

      const paymentStatus: any =
        totalOwed <= 0 || totalPaid >= totalAmount
          ? 'paid'
          : totalPaid > 0
          ? 'partial'
          : 'debt';

      const noteSnippets = fullSales
        .map((s) => cleanSaleNotes(s.notes))
        .filter(
          (n): n is string =>
            Boolean(n) && !n.toLowerCase().startsWith('combined receipt for')
        );
      const mergedNotes =
        noteSnippets.length > 0 ? noteSnippets.join(' · ') : undefined;

      const mergedSaleNumber = `MRG-${format(new Date(), 'ddMM')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const mergedSale: Sale = {
        id: `merged-${Date.now()}`,
        business_id: businessId ?? '',
        branch_id: branchId ?? '',
        customer_id: (customer as any)?.id,
        sale_number: mergedSaleNumber,
        subtotal: totalSubtotal,
        discount_amount: totalDiscount,
        tax_amount: totalTax,
        total_amount: totalAmount,
        amount_paid: totalPaid,
        amount_owed: Math.max(0, totalOwed),
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        cash_amount: cashAmount > 0 ? cashAmount : undefined,
        transfer_amount: transferAmount > 0 ? transferAmount : undefined,
        bank_name: fullSales.find((s) => s.bank_name)?.bank_name,
        notes: mergedNotes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customer: customer as any,
        items: mergedItems as any,
      };

      setPreviewSale(mergedSale);
      setSelectedIds(new Set());
      Toast.show({
        type: 'success',
        text1: 'Receipts Merged Successfully',
        text2: `${fullSales.length} sales combined into receipt ${mergedSaleNumber}`,
      });
    } catch (err: any) {
      Alert.alert('Unable to merge receipts', err?.message || 'Please try again.');
      console.error('Merge receipt error:', err);
    } finally {
      setIsMergingReceipts(false);
    }
  }, [activities, selectedIds, businessId, branchId]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleGenerateReceipt = useCallback((item: RevenueActivity) => {
    if (item.kind === 'debt_repayment') {
      generateRepaymentReceipt(item.id);
    } else if (item.sale_id) {
      generateSaleReceipt(item.sale_id);
    }
  }, [businessId, branchId]);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((item) => {
      if (item.customer_name?.toLowerCase().includes(q)) return true;
      if (item.reference?.toLowerCase().includes(q)) return true;
      if (item.sold_by_name?.toLowerCase().includes(q)) return true;
      if (item.notes?.toLowerCase().includes(q)) return true;
      if (item.items?.some((it) => it.product_name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [activities, searchQuery]);

  const groupedActivities = useMemo(() => {
    if (!filteredActivities || filteredActivities.length === 0) return [];

    const map = new Map<string, RevenueActivity[]>();
    for (const item of filteredActivities) {
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
  }, [filteredActivities]);

  const renderActivityItem = useCallback(({ item }: { item: RevenueActivity }) => {
    const isExpanded = expandedId === item.id;
    return (
      <View style={{ paddingHorizontal: SP.page, paddingVertical: 1, zIndex: isExpanded ? 2 : 1 }}>
        <SaleActivityCard 
          item={item}
          isExpanded={isExpanded}
          onToggleExpand={handleToggleExpand}
          onDelete={handleDeleteActivity}
          generatingReceiptId={generatingReceiptId}
          onGenerateReceipt={handleGenerateReceipt}
          isSelectionMode={isSelectionMode}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={handleToggleSelect}
          onLongPressSelect={handleLongPressSelect}
        />
      </View>
    );
  }, [
    expandedId,
    handleToggleExpand,
    handleDeleteActivity,
    generatingReceiptId,
    handleGenerateReceipt,
    isSelectionMode,
    selectedIds,
    handleToggleSelect,
    handleLongPressSelect,
  ]);

  return (
    <SwipeableTabScreen name="sales">
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        {isSelectionMode ? (
          <ScreenHeader
            title={`${selectedIds.size} Selected`}
            subtitle={
              selectedSales.length < 2
                ? 'Select at least 2 sales to merge'
                : `${formatCurrency(selectedTotalAmount)} combined`
            }
            theme="dark"
            left={
              <HeaderAction
                icon="x"
                label="Cancel"
                onPress={handleExitSelectionMode}
              />
            }
            right={
              <HeaderAction
                icon={allSalesSelected ? 'check-square' : 'check'}
                label={allSalesSelected ? 'Deselect' : 'Select All'}
                onPress={handleToggleSelectAll}
              />
            }
          />
        ) : (
          <ScreenHeader
            title="Sales"
            subtitle={`${filteredActivities.length} record${filteredActivities.length === 1 ? '' : 's'}${hasMore ? '+' : ''}${branchName ? ` · ${branchName}` : ''}`}
            theme="dark"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <HeaderAction
                  icon="file-text"
                  onPress={() => router.push('/(app)/import-sales' as any)}
                />
                <HeaderAction
                  icon="maximize"
                  onPress={() => router.push('/(app)/record-sale?scan=1')}
                />
                <HeaderAction icon="plus" label="Record" onPress={openRecordSale} />
              </View>
            }
          />
        )}

        {/* Filter & Search Bar */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            paddingHorizontal: SP.page,
            paddingTop: 10,
            paddingBottom: 6,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: COLORS.border,
          }}
        >
          {(pendingCount > 0 || conflictCount > 0) && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                if (conflictCount > 0) await retryAllSyncConflicts();
                await flushOfflineQueue();
                await loadActivities(true);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: conflictCount > 0 ? '#FEF2F2' : '#FFFBEB',
                borderWidth: 1,
                borderColor: conflictCount > 0 ? '#FECACA' : '#FDE68A',
                borderRadius: RADIUS.md,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Feather
                  name={isSyncing ? 'refresh-cw' : 'upload-cloud'}
                  size={14}
                  color={conflictCount > 0 ? COLORS.danger : '#D97706'}
                />
                <Text
                  style={{
                    fontFamily: FONT.semiBold,
                    fontSize: 12,
                    color: conflictCount > 0 ? COLORS.danger : '#92400E',
                    flex: 1,
                  }}
                >
                  {isSyncing
                    ? 'Syncing sales to cloud...'
                    : `${pendingCount + conflictCount} record${pendingCount + conflictCount === 1 ? '' : 's'} not synced yet`}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: FONT.bold,
                  fontSize: 12,
                  color: conflictCount > 0 ? COLORS.danger : '#B45309',
                }}
              >
                {conflictCount > 0 ? 'Retry' : 'Sync Now'}
              </Text>
            </TouchableOpacity>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.card,
              borderRadius: RADIUS.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: COLORS.border,
              paddingHorizontal: 10,
              height: 38,
              marginBottom: 8,
            }}
          >
            <Feather name="search" size={14} color={COLORS.text.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search receipt #, customer, item, staff..."
              placeholderTextColor={COLORS.text.muted}
              style={{
                flex: 1,
                marginLeft: 8,
                fontFamily: FONT.regular,
                fontSize: 13,
                color: COLORS.text.primary,
                paddingVertical: 0,
              }}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={14} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
          >
            {[
              { id: 'all' as const, label: 'All History' },
              { id: 'today' as const, label: 'Today' },
              { id: 'week' as const, label: 'This Week' },
              { id: 'month' as const, label: 'This Month' },
              {
                id: 'custom' as const,
                label:
                  dateFilter === 'custom'
                    ? format(parseLocalDateString(customDate), 'd MMM yyyy')
                    : 'Pick Date',
                icon: 'calendar' as const,
              },
            ].map((chip) => {
              const active = dateFilter === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => {
                    if (chip.id === 'custom') {
                      setIosDraftDate(parseLocalDateString(customDate));
                      setShowDatePicker(true);
                    } else {
                      setDateFilter(chip.id);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: RADIUS.full,
                    backgroundColor: active ? COLORS.ink : COLORS.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? COLORS.ink : COLORS.border,
                  }}
                >
                  {chip.icon ? (
                    <Feather
                      name={chip.icon}
                      size={11}
                      color={active ? '#FFFFFF' : COLORS.text.secondary}
                    />
                  ) : null}
                  <Text
                    style={{
                      fontFamily: active ? FONT.semiBold : FONT.medium,
                      fontSize: 12,
                      color: active ? '#FFFFFF' : COLORS.text.secondary,
                    }}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <SectionList
          sections={groupedActivities}
          keyExtractor={(item: any) => `${item.kind}-${item.id}`}
          extraData={expandedId}
          stickySectionHeadersEnabled={true}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingTop: 6,
            paddingBottom: insets.bottom + (isSelectionMode ? 140 : 92),
            flexGrow: 1,
          }}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) {
              void loadMoreActivities();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            activities.length > 0 ? (
              <View style={{ paddingHorizontal: SP.page, paddingTop: 14, paddingBottom: 18, alignItems: 'center' }}>
                {loadingMore ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={{ fontFamily: FONT.medium, fontSize: 12.5, color: COLORS.text.muted }}>
                      Loading older records...
                    </Text>
                  </View>
                ) : hasMore ? (
                  <TouchableOpacity
                    onPress={() => void loadMoreActivities()}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: RADIUS.full,
                      backgroundColor: COLORS.card,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Feather name="clock" size={14} color={COLORS.accent} />
                    <Text style={{ fontFamily: FONT.semiBold, fontSize: 13, color: COLORS.accent }}>
                      Load Older Records
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                    Showing all {activities.length} matching records
                  </Text>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SP.page, paddingTop: 20 }}>
              <EmptyState
                icon="shopping-cart"
                title={dateFilter !== 'all' || searchQuery ? 'No matching sales found' : 'No sales yet'}
                description={
                  dateFilter !== 'all' || searchQuery
                    ? 'Try clearing your search or selecting "All History" to view every sale.'
                    : 'Record your first sale, import from Excel, or record a debt collection.'
                }
                action={
                  dateFilter !== 'all' || searchQuery
                    ? {
                        label: 'Show All History',
                        onPress: () => {
                          setDateFilter('all');
                          setSearchQuery('');
                        },
                      }
                    : { label: 'Record Sale', onPress: openRecordSale }
                }
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
                paddingTop: 14,
                paddingBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={12} color={COLORS.text.muted} />
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 12,
                    color: COLORS.text.secondary,
                    letterSpacing: 0.3,
                  }}
                >
                  {dateLabel}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: COLORS.successLight,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: RADIUS.full,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT.bold,
                    fontSize: 11.5,
                    color: COLORS.success,
                  }}
                >
                  +{formatCurrency(totalAmount)}
                </Text>
              </View>
            </View>
          )}
          renderItem={renderActivityItem}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 14 }} />}
        />

        {isSelectionMode && (
          <View
            style={[
              styles.floatingDock,
              { bottom: 74 + Math.max(insets.bottom, 8) },
            ]}
          >
            <View style={styles.dockInfo}>
              <View style={styles.dockCountBadge}>
                <Text style={styles.dockCountText}>{selectedIds.size}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dockTitle} numberOfLines={1}>
                  {selectedIds.size === 1 ? '1 sale selected' : `${selectedIds.size} sales selected`}
                </Text>
                <Text style={styles.dockSubtitle} numberOfLines={1}>
                  {formatCurrency(selectedTotalAmount)}
                </Text>
              </View>
            </View>

            <View style={styles.dockActions}>
              <TouchableOpacity
                style={styles.dockDeleteButton}
                onPress={handleDeleteSelected}
                activeOpacity={0.7}
                accessibilityLabel="Delete selected sales"
              >
                <Feather name="trash-2" size={17} color="#EF4444" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dockMergeButton,
                  selectedSales.length < 2 && styles.dockMergeButtonDisabled,
                ]}
                onPress={handleMergeReceipts}
                activeOpacity={0.8}
                disabled={isMergingReceipts}
              >
                {isMergingReceipts ? (
                  <ActivityIndicator size="small" color={COLORS.onAccent} />
                ) : (
                  <>
                    <Feather name="layers" size={15} color={COLORS.onAccent} style={{ marginRight: 6 }} />
                    <Text style={styles.dockMergeText}>
                      {selectedSales.length < 2 ? 'Select 2+ to Merge' : `Merge Receipt (${selectedSales.length})`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ReceiptPreviewModal
          visible={previewSale !== null}
          onClose={() => setPreviewSale(null)}
          previewSale={previewSale}
          businessId={businessId}
          branchId={branchId}
          businessName={businessName}
          businessLogoUrl={businessLogoUrl}
          branchName={branchName}
          businessAddress={businessAddress}
          businessPhone={businessPhone}
        />

        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={parseLocalDateString(customDate)}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event?.type === 'dismissed' || !date) return;
              setCustomDate(format(date, 'yyyy-MM-dd'));
              setDateFilter('custom');
            }}
          />
        )}

        {Platform.OS === 'ios' && (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderTopLeftRadius: RADIUS.xl,
                  borderTopRightRadius: RADIUS.xl,
                  paddingHorizontal: 20,
                  paddingTop: 14,
                  paddingBottom: 28,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.text.muted }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontFamily: FONT.bold, fontSize: 15, color: COLORS.text.primary }}>
                    Filter Sales by Date
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      const pickedStr = format(iosDraftDate, 'yyyy-MM-dd');
                      setCustomDate(pickedStr > todayStr ? todayStr : pickedStr);
                      setDateFilter('custom');
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={{ fontFamily: FONT.bold, fontSize: 15, color: COLORS.accent }}>
                      Apply
                    </Text>
                  </TouchableOpacity>
                </View>

                <DateTimePicker
                  value={iosDraftDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_event, date) => {
                    if (date) setIosDraftDate(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  floatingDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  dockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  dockCountBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockCountText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
  },
  dockTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  dockSubtitle: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
  },
  dockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dockDeleteButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dockMergeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dockMergeButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  dockMergeText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.onAccent,
    letterSpacing: -0.2,
  },
});

export default React.memo(SalesScreen);
