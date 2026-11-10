import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { DashboardStats, RevenueActivity, CustomerDebt } from '@/types';
import {
  buildCachedDashboardData,
  readCachedProducts,
  upsertCachedCustomerDebts,
  upsertCachedExpenses,
  writePersistedDashboardStats,
} from '@/lib/offlineStore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { isDebtSettlementSale } from '@/lib/records';
import { fetchRevenueActivities } from '@/lib/revenue';
import { productsTable, saleItemsTable } from '@/lib/dataAccess';
import { useBusinessStore } from '@/store/businessStore';

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

  incrementTodaySales: (amountPaid: number, debtAmount?: number, profitAmount?: number) => void;
  decrementTodaySales: (amountPaid: number, debtAmount?: number, profitAmount?: number) => void;
  applyRepaymentToTodaySales: (amount: number) => void;
  decrementRepaymentFromTodaySales: (amount: number) => void;

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

  incrementTodaySales: (amountPaid: number, debtAmount = 0, profitAmount?: number) => {
    const currentStats = get().stats;
    if (!currentStats) return;
    const nextSales = Number((currentStats.today_sales + amountPaid).toFixed(2));
    const nextProfit = profitAmount !== undefined
      ? Number((currentStats.today_profit + profitAmount).toFixed(2))
      : currentStats.today_profit;
    const nextDebts = Number(Math.max(0, currentStats.outstanding_debts + debtAmount).toFixed(2));
    const nextCount = (currentStats.today_sales_count ?? 0) + 1;
    set({
      stats: {
        ...currentStats,
        today_sales: nextSales,
        today_profit: nextProfit,
        outstanding_debts: nextDebts,
        today_sales_count: nextCount,
      },
    });
  },

  decrementTodaySales: (amountPaid: number, debtAmount = 0, profitAmount?: number) => {
    const currentStats = get().stats;
    if (!currentStats) return;
    const nextSales = Number(Math.max(0, currentStats.today_sales - amountPaid).toFixed(2));
    const nextProfit = profitAmount !== undefined
      ? Number(Math.max(0, currentStats.today_profit - profitAmount).toFixed(2))
      : currentStats.today_profit;
    const nextDebts = Number(Math.max(0, currentStats.outstanding_debts - debtAmount).toFixed(2));
    const nextCount = Math.max(0, (currentStats.today_sales_count ?? 0) - 1);
    set({
      stats: {
        ...currentStats,
        today_sales: nextSales,
        today_profit: nextProfit,
        outstanding_debts: nextDebts,
        today_sales_count: nextCount,
      },
    });
  },

  applyRepaymentToTodaySales: (amount: number) => {
    const currentStats = get().stats;
    if (!currentStats) return;
    const nextSales = Number((currentStats.today_sales + amount).toFixed(2));
    const nextDebts = Number(Math.max(0, currentStats.outstanding_debts - amount).toFixed(2));
    const nextCount = (currentStats.today_sales_count ?? 0) + 1;
    set({
      stats: {
        ...currentStats,
        today_sales: nextSales,
        outstanding_debts: nextDebts,
        today_sales_count: nextCount,
      },
    });
  },

  decrementRepaymentFromTodaySales: (amount: number) => {
    const currentStats = get().stats;
    if (!currentStats) return;
    const nextSales = Number(Math.max(0, currentStats.today_sales - amount).toFixed(2));
    const nextDebts = Number((currentStats.outstanding_debts + amount).toFixed(2));
    const nextCount = Math.max(0, (currentStats.today_sales_count ?? 0) - 1);
    set({
      stats: {
        ...currentStats,
        today_sales: nextSales,
        outstanding_debts: nextDebts,
        today_sales_count: nextCount,
      },
    });
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
        recentActivities: cached.recentActivities.length > 0 ? cached.recentActivities : get().recentActivities,
        recentDebts: cached.recentDebts.length > 0 ? cached.recentDebts : get().recentDebts,
        isLoading: false,
      });
    } catch (err) {
      console.warn('[dashboardStore] Failed to instantly load cache', err);
    }

    if (!get().stats) set({ isLoading: true });
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
          .select(`
            id,
            amount_paid,
            total_amount,
            notes,
            items:${saleItemsTable()}(
              id,
              product_id,
              quantity,
              unit_price,
              cost_price,
              total_price
            )
          `)
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
          .from(productsTable())
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

      const validSales = todaySalesRes.data
        ?.filter((row) => !isDebtSettlementSale(row.notes)) ?? [];
      const totalSales = validSales.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0);
      const salesCount = validSales.length;
      const totalRepayments = todayRepaymentsRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const repaymentsCount = todayRepaymentsRes.data?.length ?? 0;
      const totalExpenses = todayExpensesRes.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
      const totalDebts = debtsRes.data?.reduce((sum, row) => sum + row.balance, 0) ?? 0;
      const stockAlerts = await getStockAlerts(businessId, branchId);

      // Build product cost map for fallback
      let storeProducts = useBusinessStore.getState().products;
      if (!storeProducts || storeProducts.length === 0) {
        try {
          storeProducts = await readCachedProducts(businessId);
        } catch {}
      }
      const productCostMap = new Map((storeProducts ?? []).map((p) => [p.id, Number(p.cost_price ?? 0)]));

      // Calculate server gross profit: selling price minus cost price
      const serverGrossProfit = validSales.reduce((sum, sale: any) => {
        const items = (sale.items as any[]) ?? [];
        if (items.length > 0) {
          const totalCogs = items.reduce((cogsSum: number, item: any) => {
            const productCost = productCostMap.get(item.product_id);
            const rawCost = Number(item.cost_price ?? 0);
            const unitCost = (productCost !== undefined && productCost > 0)
              ? productCost
              : rawCost;
            return cogsSum + (unitCost * Number(item.quantity ?? 1));
          }, 0);
          const saleSellingPrice = Number(sale.total_amount ?? sale.amount_paid ?? 0);
          return sum + (saleSellingPrice - totalCogs);
        }
        return sum + Number(sale.amount_paid ?? 0);
      }, 0);

      // Re-read latest cache to account for transactions recorded locally during the network fetch
      const latestCached = await buildCachedDashboardData(businessId, branchId);

      const serverSalesTotal = totalSales + totalRepayments;
      const cachedTodaySales = latestCached.stats?.today_sales ?? 0;
      const cachedTodayProfit = latestCached.stats?.today_profit ?? 0;

      // Prefer server sales total unless local cache has unsynced offline sales (cachedTodaySales > serverSalesTotal)
      const resolvedTodaySales = Math.max(serverSalesTotal, cachedTodaySales);
      const resolvedTodayExpenses = Math.max(totalExpenses, latestCached.stats?.today_expenses ?? 0);
      const resolvedTodayProfit = serverSalesTotal >= cachedTodaySales
        ? Number(serverGrossProfit.toFixed(2))
        : Number(cachedTodayProfit.toFixed(2));

      const serverSalesCount = salesCount + repaymentsCount;
      const cachedTodaySalesCount = latestCached.stats?.today_sales_count ?? 0;
      const resolvedTodaySalesCount = Math.max(serverSalesCount, cachedTodaySalesCount);

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

      const resolvedStats: DashboardStats = {
        today_sales: resolvedTodaySales,
        today_profit: resolvedTodayProfit,
        today_expenses: resolvedTodayExpenses,
        total_products: productCountRes.count ?? 0,
        low_stock_count: stockAlerts.lowStockProducts.length,
        out_of_stock_count: stockAlerts.outOfStockProducts.length,
        outstanding_debts: resolvedOutstandingDebts,
        total_customers: customerCountRes.count ?? 0,
        today_sales_count: resolvedTodaySalesCount,
      };

      set({
        stats: resolvedStats,
        recentActivities: recentRevenueRes,
        recentDebts: mergedRecentDebts,
      });

      // Persist results to disk so subsequent reads always have the true numbers
      await Promise.all([
        writePersistedDashboardStats(businessId, branchId, {
          date: todayDate,
          stats: resolvedStats,
        }),
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
