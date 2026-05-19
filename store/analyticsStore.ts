import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

export type DateRange = '7days' | '30days' | 'this_month' | 'this_week';

export interface SalesTrendPoint {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  transactions: number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
  total_profit: number;
}

export interface ExpenseBreakdown {
  category: string;
  total: number;
  percentage: number;
}

export interface AnalyticsSummary {
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  total_transactions: number;
  avg_transaction_value: number;
  prev_revenue: number;
  prev_profit: number;
  revenue_growth: number;
  profit_growth: number;
}

interface AnalyticsState {
  summary: AnalyticsSummary | null;
  salesTrend: SalesTrendPoint[];
  topProducts: TopProduct[];
  bottomProducts: TopProduct[];
  expenseBreakdown: ExpenseBreakdown[];
  isLoading: boolean;
  error: string | null;
  dateRange: DateRange;

  setDateRange: (range: DateRange) => void;
  fetchAnalytics: (businessId: string, branchId: string) => Promise<void>;
}

function getDateBounds(range: DateRange): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  let from: Date, to: Date, prevFrom: Date, prevTo: Date;

  switch (range) {
    case '7days':
      from = startOfDay(subDays(now, 6));
      to = endOfDay(now);
      prevFrom = startOfDay(subDays(now, 13));
      prevTo = endOfDay(subDays(now, 7));
      break;
    case 'this_week':
      from = startOfWeek(now, { weekStartsOn: 1 });
      to = endOfWeek(now, { weekStartsOn: 1 });
      prevFrom = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      prevTo = endOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      break;
    case 'this_month':
      from = startOfMonth(now);
      to = endOfMonth(now);
      prevFrom = startOfMonth(subDays(now, 30));
      prevTo = endOfMonth(subDays(now, 30));
      break;
    case '30days':
    default:
      from = startOfDay(subDays(now, 29));
      to = endOfDay(now);
      prevFrom = startOfDay(subDays(now, 59));
      prevTo = endOfDay(subDays(now, 30));
      break;
  }
  return { from, to, prevFrom, prevTo };
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  summary: null,
  salesTrend: [],
  topProducts: [],
  bottomProducts: [],
  expenseBreakdown: [],
  isLoading: false,
  error: null,
  dateRange: '7days',

  setDateRange: (range) => set({ dateRange: range }),

  fetchAnalytics: async (businessId, branchId) => {
    set({ isLoading: true, error: null });
    const { dateRange } = get();
    const { from, to, prevFrom, prevTo } = getDateBounds(dateRange);

    const fromISO = from.toISOString();
    const toISO = to.toISOString();
    const prevFromISO = prevFrom.toISOString();
    const prevToISO = prevTo.toISOString();

    try {
      // ── Current period sales ──────────────────────────────
      const { data: currentSales } = await supabase
        .from('sales')
        .select('amount_paid, created_at, notes')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .gte('created_at', fromISO)
        .lte('created_at', toISO);

      // ── Previous period sales (for growth calc) ──────────
      const { data: prevSales } = await supabase
        .from('sales')
        .select('amount_paid, notes')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .gte('created_at', prevFromISO)
        .lte('created_at', prevToISO);

      const { data: currentRepayments } = await supabase
        .from('debt_repayments')
        .select('amount, created_at, debt:customer_debts!inner(business_id, branch_id)')
        .eq('debt.business_id', businessId)
        .eq('debt.branch_id', branchId)
        .gte('created_at', fromISO)
        .lte('created_at', toISO);

      const { data: prevRepayments } = await supabase
        .from('debt_repayments')
        .select('amount, debt:customer_debts!inner(business_id, branch_id)')
        .eq('debt.business_id', businessId)
        .eq('debt.branch_id', branchId)
        .gte('created_at', prevFromISO)
        .lte('created_at', prevToISO);

      // ── Current period expenses ───────────────────────────
      const { data: currentExpenses } = await supabase
        .from('expenses')
        .select('amount, category')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .gte('expense_date', format(from, 'yyyy-MM-dd'))
        .lte('expense_date', format(to, 'yyyy-MM-dd'));

      // ── Sale items for profit & top products ─────────────
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select(`
          quantity,
          unit_price,
          cost_price,
          total_price,
          product:products(id, name),
          sale:sales!inner(created_at, business_id, branch_id)
        `)
        .eq('sale.business_id', businessId)
        .eq('sale.branch_id', branchId)
        .gte('sale.created_at', fromISO)
        .lte('sale.created_at', toISO);

      // ── Compute summary ───────────────────────────────────
      const revenueSales = (currentSales ?? []).filter((sale) => !isDebtSettlementSale(sale.notes));
      const previousRevenueSales = (prevSales ?? []).filter((sale) => !isDebtSettlementSale(sale.notes));
      const totalRevenue =
        revenueSales.reduce((s, r) => s + r.amount_paid, 0) +
        (currentRepayments?.reduce((s, r) => s + r.amount, 0) ?? 0);
      const totalExpenses = currentExpenses?.reduce((s, r) => s + r.amount, 0) ?? 0;
      const prevRevenue =
        previousRevenueSales.reduce((s, r) => s + r.amount_paid, 0) +
        (prevRepayments?.reduce((s, r) => s + r.amount, 0) ?? 0);

      // Profit per item = (selling - cost) * qty
      const totalProfit = saleItems?.reduce((s, item) => {
        const cost = item.cost_price ?? 0;
        return s + (item.unit_price - cost) * item.quantity;
      }, 0) ?? 0;

      const prevProfit = prevRevenue * 0.3; // estimate for previous period if no item data

      const revenueGrowth = prevRevenue === 0 ? 0 : ((totalRevenue - prevRevenue) / prevRevenue) * 100;
      const profitGrowth = prevProfit === 0 ? 0 : ((totalProfit - prevProfit) / prevProfit) * 100;
      const totalTransactions = revenueSales.length + (currentRepayments?.length ?? 0);

      set({
        summary: {
          total_revenue: totalRevenue,
          total_profit: totalProfit,
          total_expenses: totalExpenses,
          total_transactions: totalTransactions,
          avg_transaction_value: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
          prev_revenue: prevRevenue,
          prev_profit: prevProfit,
          revenue_growth: revenueGrowth,
          profit_growth: profitGrowth,
        },
      });

      // ── Sales trend (group by day) ────────────────────────
      const trendMap = new Map<string, { revenue: number; profit: number; transactions: number }>();

      // Populate all dates in range first so we have zeros for empty days
      let cursor = new Date(from);
      while (cursor <= to) {
        const key = format(cursor, 'yyyy-MM-dd');
        trendMap.set(key, { revenue: 0, profit: 0, transactions: 0 });
        cursor = new Date(cursor.getTime() + 86400000);
      }

      revenueSales.forEach((sale) => {
        const key = format(new Date(sale.created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(key) ?? { revenue: 0, profit: 0, transactions: 0 };
        trendMap.set(key, {
          revenue: existing.revenue + sale.amount_paid,
          profit: existing.profit,
          transactions: existing.transactions + 1,
        });
      });

      currentRepayments?.forEach((repayment) => {
        const key = format(new Date(repayment.created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(key) ?? { revenue: 0, profit: 0, transactions: 0 };
        trendMap.set(key, {
          revenue: existing.revenue + repayment.amount,
          profit: existing.profit,
          transactions: existing.transactions + 1,
        });
      });

      // Add profit from items into trend
      saleItems?.forEach((item) => {
        const key = format(new Date((item.sale as any).created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(key);
        if (existing) {
          const itemProfit = (item.unit_price - (item.cost_price ?? 0)) * item.quantity;
          trendMap.set(key, { ...existing, profit: existing.profit + itemProfit });
        }
      });

      const salesTrend: SalesTrendPoint[] = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          label: format(new Date(date), dateRange === '7days' || dateRange === 'this_week' ? 'EEE' : 'MMM d'),
          ...data,
        }));

      set({ salesTrend });

      // ── Top & bottom products ─────────────────────────────
      const productMap = new Map<string, TopProduct>();

      saleItems?.forEach((item) => {
        const pid = (item.product as any)?.id;
        const pname = (item.product as any)?.name ?? 'Unknown';
        if (!pid) return;
        const existing = productMap.get(pid) ?? {
          product_id: pid,
          product_name: pname,
          total_qty: 0,
          total_revenue: 0,
          total_profit: 0,
        };
        productMap.set(pid, {
          ...existing,
          total_qty: existing.total_qty + item.quantity,
          total_revenue: existing.total_revenue + item.total_price,
          total_profit: existing.total_profit + (item.unit_price - (item.cost_price ?? 0)) * item.quantity,
        });
      });

      const allProducts = Array.from(productMap.values());
      set({
        topProducts: [...allProducts]
          .sort((a, b) => b.total_qty - a.total_qty || b.total_revenue - a.total_revenue)
          .slice(0, 5),
        bottomProducts: [...allProducts]
          .sort((a, b) => a.total_qty - b.total_qty || a.total_revenue - b.total_revenue)
          .slice(0, 5),
      });

      // ── Expense breakdown ─────────────────────────────────
      const expMap = new Map<string, number>();
      currentExpenses?.forEach((e) => {
        expMap.set(e.category, (expMap.get(e.category) ?? 0) + e.amount);
      });

      const totalExp = Array.from(expMap.values()).reduce((s, v) => s + v, 0);
      const expenseBreakdown: ExpenseBreakdown[] = Array.from(expMap.entries())
        .map(([category, total]) => ({
          category,
          total,
          percentage: totalExp > 0 ? (total / totalExp) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      set({ expenseBreakdown });
    } catch (err: any) {
      console.error('[analytics]', err);
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },
}));
