import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { DashboardStats, RevenueActivity, CustomerDebt } from '@/types';
import {
  buildCachedDashboardData,
  upsertCachedCustomerDebts,
  upsertCachedExpenses,
} from '@/lib/offlineStore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { isDebtSettlementSale } from '@/lib/records';
import { fetchRevenueActivities } from '@/lib/revenue';

const DASHBOARD_REVENUE_VISIBLE_KEY = 'record-am:dashboard:revenue-visible';
const getRevenueKey = (businessId?: string) =>
  businessId ? `${DASHBOARD_REVENUE_VISIBLE_KEY}:${businessId}` : DASHBOARD_REVENUE_VISIBLE_KEY;

interface DashboardState {
  stats: DashboardStats | null;
  recentActivities: RevenueActivity[];
  recentDebts: CustomerDebt[];
  isLoading: boolean;
  error: string | null;
  revenueVisible: boolean;

  loadRevenueVisibility: (businessId?: string) => Promise<void>;
  toggleRevenueVisibility: (businessId?: string) => Promise<void>;
  setRevenueVisibility: (visible: boolean, businessId?: string) => Promise<void>;

  refreshFromCache: (businessId: string, branchId: string) => Promise<void>;
  fetchDashboardData: (
    businessId: string,
    branchId: string,
    getStockAlerts: (b: string, br: string) => Promise<{ lowStockProducts: any[]; outOfStockProducts: any[] }>
  ) => Promise<void>;
  reset: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  stats: null,
  recentActivities: [],
  recentDebts: [],
  isLoading: true,
  error: null,
  revenueVisible: true,

  loadRevenueVisibility: async (businessId?: string) => {
    try {
      let stored: string | null = null;
      if (businessId) {
        stored = await AsyncStorage.getItem(getRevenueKey(businessId));
      }
      if (stored === null) {
        stored = await AsyncStorage.getItem(DASHBOARD_REVENUE_VISIBLE_KEY);
      }
      if (stored !== null) {
        set({ revenueVisible: stored === 'true' });
      }
    } catch (err) {
      console.warn('[dashboardStore] Failed to load revenue visibility', err);
    }
  },

  toggleRevenueVisibility: async (businessId?: string) => {
    const next = !get().revenueVisible;
    set({ revenueVisible: next });
    try {
      await AsyncStorage.setItem(DASHBOARD_REVENUE_VISIBLE_KEY, String(next));
      if (businessId) {
        await AsyncStorage.setItem(getRevenueKey(businessId), String(next));
      }
    } catch (err) {
      console.warn('[dashboardStore] Failed to save revenue visibility', err);
    }
  },

  setRevenueVisibility: async (visible: boolean, businessId?: string) => {
    set({ revenueVisible: visible });
    try {
      await AsyncStorage.setItem(DASHBOARD_REVENUE_VISIBLE_KEY, String(visible));
      if (businessId) {
        await AsyncStorage.setItem(getRevenueKey(businessId), String(visible));
      }
    } catch (err) {
      console.warn('[dashboardStore] Failed to save revenue visibility', err);
    }
  },

  refreshFromCache: async (businessId, branchId) => {
    try {
      const cached = await buildCachedDashboardData(businessId, branchId);
      set({
        stats: cached.stats,
        recentActivities: cached.recentActivities,
        recentDebts: cached.recentDebts,
      });
    } catch (err) {
      console.error('[dashboardStore] refreshFromCache failed', err);
    }
  },

  fetchDashboardData: async (businessId, branchId, getStockAlerts) => {
    // 1. Instantly load from cache for "super fast" feeling
    try {
      const cached = await buildCachedDashboardData(businessId, branchId);
      set({
        stats: cached.stats,
        recentActivities: cached.recentActivities,
        recentDebts: cached.recentDebts,
        isLoading: false, // Turn off loader instantly if cache exists
      });
    } catch (err) {
      console.warn('[dashboardStore] Failed to instantly load cache', err);
    }

    // If cache was empty, we still show loading true
    const currentStats = get().stats;
    if (!currentStats) set({ isLoading: true });
    set({ error: null });

    try {
      const todayDate = format(new Date(), 'yyyy-MM-dd');
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const [
        todaySalesRes,
        todayRepaymentsRes,
        todayExpensesRes,
        debtsRes,
        productCountRes,
        customerCountRes,
        debtListRes,
        recentRevenueRes,
      ] = await Promise.all([
        supabase
          .from('sales')
          .select('amount_paid, notes')
          .eq('business_id', businessId)
          .eq('branch_id', branchId)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),
        supabase
          .from('debt_repayments')
          .select('amount, debt:customer_debts!inner(business_id, branch_id)')
          .eq('debt.business_id', businessId)
          .eq('debt.branch_id', branchId)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),
        supabase
          .from('expenses')
          .select('*')
          .eq('business_id', businessId)
          .eq('branch_id', branchId)
          .eq('expense_date', todayDate),
        supabase
          .from('customer_debts')
          .select('balance')
          .eq('business_id', businessId)
          .eq('branch_id', branchId)
          .neq('status', 'settled'),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true),
        supabase
          .from('customer_debts')
          .select('*')
          .eq('business_id', businessId)
          .eq('branch_id', branchId)
          .neq('status', 'settled')
          .order('created_at', { ascending: false })
          .limit(3),
        fetchRevenueActivities(businessId, branchId, 5),
      ]);

      const totalSales = todaySalesRes.data
        ?.filter((row) => !isDebtSettlementSale(row.notes))
        .reduce((sum, row) => sum + row.amount_paid, 0) ?? 0;
      const totalRepayments = todayRepaymentsRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalExpenses = todayExpensesRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalDebts = debtsRes.data?.reduce((sum, row) => sum + row.balance, 0) ?? 0;
      const stockAlerts = await getStockAlerts(businessId, branchId);

      // Re-read latest cache to account for transactions recorded locally during the network fetch
      const latestCached = await buildCachedDashboardData(businessId, branchId);

      const serverSalesTotal = totalSales + totalRepayments;
      const cachedTodaySales = latestCached.stats?.today_sales ?? 0;
      const currentTodaySales = get().stats?.today_sales ?? 0;

      // Prevent revenue and expenses from flickering backwards due to sync latency
      const resolvedTodaySales = Math.max(serverSalesTotal, cachedTodaySales, currentTodaySales);
      const resolvedTodayExpenses = Math.max(totalExpenses, latestCached.stats?.today_expenses ?? 0);
      const resolvedTodayProfit = resolvedTodaySales - resolvedTodayExpenses;

      // Merge debts so newly created local debts don't vanish before server sync
      const serverDebts = (debtListRes.data as CustomerDebt[]) ?? [];
      const serverDebtIds = new Set(serverDebts.map((d) => d.id));
      const mergedRecentDebts = [
        ...serverDebts,
        ...latestCached.recentDebts.filter((d) => !serverDebtIds.has(d.id) && d.status !== 'settled'),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      const resolvedOutstandingDebts = Math.max(totalDebts, latestCached.stats?.outstanding_debts ?? 0);

      set({
        stats: {
          today_sales: resolvedTodaySales,
          today_profit: resolvedTodayProfit,
          today_expenses: resolvedTodayExpenses,
          total_products: productCountRes.count ?? 0,
          low_stock_count: stockAlerts.lowStockProducts.length,
          out_of_stock_count: stockAlerts.outOfStockProducts.length,
          outstanding_debts: resolvedOutstandingDebts,
          total_customers: customerCountRes.count ?? 0,
        },
        recentActivities: recentRevenueRes,
        recentDebts: mergedRecentDebts,
      });

      // Upsert (do NOT replace) cached results so local unsynced debts aren't wiped
      await Promise.all([
        upsertCachedCustomerDebts(businessId, branchId, (debtListRes.data as CustomerDebt[]) ?? []),
        upsertCachedExpenses(businessId, branchId, (todayExpensesRes.data as any[]) ?? []),
      ]);
    } catch (err: any) {
      console.error('[dashboardStore]', err);
      // Fallback to cache again just in case it wasn't loaded
      try {
        const cached = await buildCachedDashboardData(businessId, branchId);
        set({
          stats: cached.stats,
          recentActivities: cached.recentActivities,
          recentDebts: cached.recentDebts,
          error: null,
        });
      } catch {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () =>
    set({
      stats: null,
      recentActivities: [],
      recentDebts: [],
      isLoading: true,
      error: null,
      revenueVisible: true,
    }),
}));

// Eagerly restore revenue visibility preference on initial store import
AsyncStorage.getItem(DASHBOARD_REVENUE_VISIBLE_KEY)
  .then((stored) => {
    if (stored !== null) {
      useDashboardStore.setState({ revenueVisible: stored === 'true' });
    }
  })
  .catch(() => {});
