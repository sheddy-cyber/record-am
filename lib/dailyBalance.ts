import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { DailySummary } from '@/types';

export interface BalanceEntry {
  id: string;
  description: string;
  amount: number;
  type: 'sale' | 'expense' | 'debt_repayment';
  time: string;
  payment_method: string;
}

export interface DailyBalanceSnapshot {
  summary: DailySummary;
  entries: BalanceEntry[];
}

export async function getDailyBalanceSnapshot(
  businessId: string,
  branchId: string,
  targetDate: string,
): Promise<DailyBalanceSnapshot> {
  const [year, month, day] = targetDate.split('-');
  const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  const dayStart = startOfDay(dateObj).toISOString();
  const dayEnd = endOfDay(dateObj).toISOString();

  const [
    salesResult,
    expensesResult,
    repaymentsResult,
    summaryResult,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('*, customer:customers(name)')
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at'),
    supabase
      .from('expenses')
      .select('*')
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .eq('expense_date', targetDate)
      .order('created_at'),
    supabase
      .from('debt_repayments')
      .select('*, debt:customer_debts(customer_name, business_id, branch_id)')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
    supabase
      .from('daily_summaries')
      .select('*')
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .eq('summary_date', targetDate)
      .maybeSingle(),
  ]);

  if (salesResult.error) throw salesResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (repaymentsResult.error) throw repaymentsResult.error;
  if (summaryResult.error) throw summaryResult.error;

  const sales = salesResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const repayments = repaymentsResult.data ?? [];
  const existingSummary = summaryResult.data as DailySummary | null;

  const revenueSales = sales.filter((sale: any) => !isDebtSettlementSale(sale.notes));
  const branchRepayments = repayments.filter((repayment: any) => {
    const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
    return debt?.business_id === businessId && debt?.branch_id === branchId;
  });

  const entries: BalanceEntry[] = [
    ...revenueSales.map((sale: any) => ({
      id: sale.id,
      description: sale.customer?.name ? `Sale to ${sale.customer.name}` : 'Walk-in Sale',
      amount: sale.amount_paid,
      type: 'sale' as const,
      time: sale.created_at,
      payment_method: sale.payment_method,
    })),
    ...expenses.map((expense: any) => ({
      id: expense.id,
      description: expense.description,
      amount: -expense.amount,
      type: 'expense' as const,
      time: expense.created_at,
      payment_method: expense.payment_method,
    })),
    ...branchRepayments.map((repayment: any) => ({
      id: repayment.id,
      description: `Debt payment from ${(Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt)?.customer_name ?? 'Customer'}`,
      amount: repayment.amount,
      type: 'debt_repayment' as const,
      time: repayment.created_at,
      payment_method: repayment.payment_method,
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const totalSales = revenueSales.reduce((sum: number, sale: any) => sum + sale.amount_paid, 0);
  const totalCashSales = revenueSales
    .filter((sale: any) => sale.payment_method === 'cash')
    .reduce((sum: number, sale: any) => sum + sale.amount_paid, 0);
  const totalExpenses = expenses.reduce((sum: number, expense: any) => sum + expense.amount, 0);
  const totalRepayments = branchRepayments.reduce((sum: number, repayment: any) => sum + repayment.amount, 0);

  const saleIds = revenueSales.map((sale: any) => sale.id);
  let totalCOGS = 0;
  if (saleIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('sale_items')
      .select('quantity, cost_price')
      .in('sale_id', saleIds);

    if (itemsError) throw itemsError;
    totalCOGS = items?.reduce((sum: number, item: any) => sum + (item.cost_price ?? 0) * item.quantity, 0) ?? 0;
  }

  const grossProfit = totalSales - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const cashExpenses = expenses
    .filter((expense: any) => expense.payment_method === 'cash')
    .reduce((sum: number, expense: any) => sum + expense.amount, 0);
  const expectedCash = totalCashSales + totalRepayments - cashExpenses;
  const actualCash = existingSummary?.cash_in_hand_actual;

  const summary: DailySummary = existingSummary
    ? {
        ...existingSummary,
        total_sales: totalSales,
        total_expenses: totalExpenses,
        total_purchases: existingSummary.total_purchases ?? 0,
        gross_profit: grossProfit,
        net_profit: netProfit,
        cash_in_hand_expected: expectedCash,
        discrepancy: actualCash == null ? 0 : actualCash - expectedCash,
      }
    : {
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
      };

  return { summary, entries };
}

interface CloseDailySummaryArgs {
  businessId: string;
  branchId: string;
  userId: string;
  summary: DailySummary;
  actualCash: number;
  notes: string;
}

export async function closeDailySummary({
  businessId,
  branchId,
  userId,
  summary,
  actualCash,
  notes,
}: CloseDailySummaryArgs): Promise<DailySummary> {
  const discrepancy = actualCash - summary.cash_in_hand_expected;
  const payload = {
    business_id: businessId,
    branch_id: branchId,
    summary_date: summary.summary_date,
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
  return data as DailySummary;
}

export async function reopenDailySummary(
  businessId: string,
  branchId: string,
  summaryDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('daily_summaries')
    .update({
      is_closed: false,
      closed_by: null,
    })
    .eq('business_id', businessId)
    .eq('branch_id', branchId)
    .eq('summary_date', summaryDate);

  if (error) throw error;
}
