import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { isDebtSettlementSale } from '@/lib/records';
import { DailySummary } from '@/types';

interface BalanceEntry {
  id: string;
  description: string;
  amount: number;
  type: 'sale' | 'expense' | 'debt_repayment';
  time: string;
  payment_method: string;
}

interface DailyBalanceState {
  summary: DailySummary | null;
  entries: BalanceEntry[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectedDate: string;

  setSelectedDate: (date: string) => void;
  fetchDailyBalance: (businessId: string, branchId: string, date?: string) => Promise<void>;
  closeDay: (
    businessId: string,
    branchId: string,
    userId: string,
    actualCash: number,
    notes: string
  ) => Promise<boolean>;
}

export const useDailyBalanceStore = create<DailyBalanceState>((set, get) => ({
  summary: null,
  entries: [],
  isLoading: false,
  isSaving: false,
  error: null,
  selectedDate: format(new Date(), 'yyyy-MM-dd'),

  setSelectedDate: (date) => set({ selectedDate: date }),

  fetchDailyBalance: async (businessId, branchId, date) => {
    set({ isLoading: true, error: null });
    const targetDate = date ?? get().selectedDate;

    try {
      const dayStart = `${targetDate}T00:00:00`;
      const dayEnd = `${targetDate}T23:59:59`;

      // Fetch all sales for the day
      const { data: sales } = await supabase
        .from('sales')
        .select('*, customer:customers(name)')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at');

      // Fetch all expenses for the day
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .eq('expense_date', targetDate)
        .order('created_at');

      // Fetch debt repayments received today
      const { data: repayments } = await supabase
        .from('debt_repayments')
        .select('*, debt:customer_debts(customer_name, business_id, branch_id)')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

      const revenueSales = (sales ?? []).filter((sale: any) => !isDebtSettlementSale(sale.notes));

      // Filter repayments to this branch
      const branchRepayments = repayments?.filter(
        (r: any) => {
          const debt = Array.isArray(r.debt) ? r.debt[0] : r.debt;
          return debt?.business_id === businessId && debt?.branch_id === branchId;
        }
      ) ?? [];

      // Build entries list
      const entries: BalanceEntry[] = [
        ...revenueSales.map((s: any) => ({
          id: s.id,
          description: s.customer?.name
            ? `Sale to ${s.customer.name}`
            : 'Walk-in Sale',
          amount: s.total_amount,
          type: 'sale' as const,
          time: s.created_at,
          payment_method: s.payment_method,
        })),
        ...(expenses ?? []).map((e: any) => ({
          id: e.id,
          description: e.description,
          amount: -e.amount, // negative for expenses
          type: 'expense' as const,
          time: e.created_at,
          payment_method: e.payment_method,
        })),
        ...(branchRepayments).map((r: any) => ({
          id: r.id,
          description: `Debt payment from ${(Array.isArray(r.debt) ? r.debt[0] : r.debt)?.customer_name ?? 'Customer'}`,
          amount: r.amount,
          type: 'debt_repayment' as const,
          time: r.created_at,
          payment_method: r.payment_method,
        })),
      ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      // Compute totals
      const totalSales = revenueSales.reduce((s: number, r: any) => s + r.total_amount, 0);
      const totalCashSales = revenueSales
        ?.filter((sale: any) => sale.payment_method === 'cash' && !isDebtSettlementSale(sale.notes))
        .reduce((sum: number, sale: any) => sum + (sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount), 0) ?? 0;
      const totalExpenses = expenses?.reduce((s: number, r: any) => s + r.amount, 0) ?? 0;
      const totalRepayments = branchRepayments.reduce((s: number, r: any) => s + r.amount, 0);

      // Sale items for COGS
      const saleIds = revenueSales.map((s: any) => s.id);
      let totalCOGS = 0;
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('quantity, cost_price')
          .in('sale_id', saleIds);
        totalCOGS = items?.reduce((s: number, i: any) => s + (i.cost_price ?? 0) * i.quantity, 0) ?? 0;
      }

      const grossProfit = totalSales - totalCOGS;
      const netProfit = grossProfit - totalExpenses;
      const cashExpenses = expenses
        ?.filter((expense: any) => expense.payment_method === 'cash')
        .reduce((sum: number, expense: any) => sum + expense.amount, 0) ?? 0;

      const expectedCash = totalCashSales + totalRepayments - cashExpenses;

      // Check if a summary already exists for today
      const { data: existingSummary } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .eq('summary_date', targetDate)
        .single();

      if (existingSummary) {
        set({ summary: existingSummary as DailySummary });
      } else {
        // Build a virtual summary (not yet saved to DB)
        set({
          summary: {
            id: '',
            business_id: businessId,
            branch_id: branchId,
            summary_date: targetDate,
            total_sales: totalSales,
            total_expenses: totalExpenses,
            total_purchases: 0,
            gross_profit: grossProfit,
            net_profit: netProfit,
            cash_in_hand_expected: expectedCash,
            cash_in_hand_actual: undefined,
            discrepancy: 0,
            notes: '',
            closed_by: undefined,
            is_closed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
      }

      set({ entries });
    } catch (err: any) {
      console.error('[dailyBalance]', err);
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  closeDay: async (businessId, branchId, userId, actualCash, notes) => {
    set({ isSaving: true });
    const { summary, selectedDate } = get();
    if (!summary) return false;

    try {
      const discrepancy = actualCash - summary.cash_in_hand_expected;

      const payload = {
        business_id: businessId,
        branch_id: branchId,
        summary_date: selectedDate,
        total_sales: summary.total_sales,
        total_expenses: summary.total_expenses,
        total_purchases: summary.total_purchases,
        gross_profit: summary.gross_profit,
        net_profit: summary.net_profit,
        cash_in_hand_expected: summary.cash_in_hand_expected,
        cash_in_hand_actual: actualCash,
        discrepancy,
        notes,
        closed_by: userId,
        is_closed: true,
      };

      const { data, error } = await supabase
        .from('daily_summaries')
        .upsert(payload, { onConflict: 'business_id,branch_id,summary_date' })
        .select()
        .single();

      if (error) throw error;
      set({ summary: data as DailySummary });
      return true;
    } catch (err: any) {
      console.error('[closeDay]', err);
      set({ error: err.message });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));
