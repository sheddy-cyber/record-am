import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { DashboardStats, RevenueActivity, CustomerDebt } from '@/types';
import {
  buildCachedDashboardData,
  cacheCustomerDebts,
  upsertCachedExpenses,
} from '@/lib/offlineStore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { isDebtSettlementSale } from '@/lib/records';
import { fetchRevenueActivities } from '@/lib/revenue';

interface DashboardState {
  stats: DashboardStats | null;
  recentActivities: RevenueActivity[];
  recentDebts: CustomerDebt[];
  isLoading: boolean;
  error: string | null;

  refreshFromCache: (businessId: string, branchId: string) => Promise<void>;
  fetchDashboardData: (
    businessId: string,
    branchId: string,
    getStockAlerts: (b: string, br: string) => Promise<{ lowStockProducts: any[]; outOfStockProducts: any[] }>
  ) => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  stats: null,
  recentActivities: [],
  recentDebts: [],
  isLoading: true,
  error: null,

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

      set({
        stats: {
          today_sales: totalSales + totalRepayments,
          today_profit: totalSales + totalRepayments - totalExpenses,
          today_expenses: totalExpenses,
          total_products: productCountRes.count ?? 0,
          low_stock_count: stockAlerts.lowStockProducts.length,
          out_of_stock_count: stockAlerts.outOfStockProducts.length,
          outstanding_debts: totalDebts,
          total_customers: customerCountRes.count ?? 0,
        },
        recentActivities: recentRevenueRes,
        recentDebts: (debtListRes.data as CustomerDebt[]) ?? [],
      });

      // Cache the network results
      await Promise.all([
        cacheCustomerDebts(businessId, branchId, (debtListRes.data as CustomerDebt[]) ?? []),
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
}));
