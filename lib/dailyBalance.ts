import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { CustomerDebt, DailySummary, DebtRepayment, Expense, Sale, SaleItem } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  replaceCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';

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

const isOnTargetDate = (isoDate: string | undefined, targetDate: string) => {
  if (!isoDate) return false;
  return isoDate.slice(0, 10) === targetDate;
};

function buildSnapshotFromRows(params: {
  businessId: string;
  branchId: string;
  targetDate: string;
  sales: any[];
  expenses: Expense[];
  repayments: any[];
  saleItems: any[];
  existingSummary: DailySummary | null;
  debts?: CustomerDebt[];
}): DailyBalanceSnapshot {
  const { businessId, branchId, targetDate, existingSummary } = params;
  const debtMap = new Map((params.debts ?? []).map((debt) => [debt.id, debt]));
  const revenueSales = params.sales.filter((sale: any) => !isDebtSettlementSale(sale.notes));
  const branchRepayments = params.repayments.filter((repayment: any) => {
    const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
    const cachedDebt = debtMap.get(repayment.debt_id);
    return (
      (debt?.business_id === businessId && debt?.branch_id === branchId) ||
      (cachedDebt?.business_id === businessId && cachedDebt?.branch_id === branchId)
    );
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
    ...params.expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: -expense.amount,
      type: 'expense' as const,
      time: expense.created_at,
      payment_method: expense.payment_method,
    })),
    ...branchRepayments.map((repayment: any) => {
      const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
      const cachedDebt = debtMap.get(repayment.debt_id);
      return {
        id: repayment.id,
        description: `Debt payment from ${debt?.customer_name ?? cachedDebt?.customer_name ?? 'Customer'}`,
        amount: repayment.amount,
        type: 'debt_repayment' as const,
        time: repayment.created_at,
        payment_method: repayment.payment_method,
      };
    }),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const totalSales = revenueSales.reduce((sum: number, sale: any) => sum + sale.amount_paid, 0);
  const totalCashSales = revenueSales
    .filter((sale: any) => sale.payment_method === 'cash')
    .reduce((sum: number, sale: any) => sum + sale.amount_paid, 0);
  const totalExpenses = params.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalRepayments = branchRepayments.reduce((sum: number, repayment: any) => sum + repayment.amount, 0);
  const totalCashRepayments = branchRepayments
    .filter((repayment: any) => repayment.payment_method === 'cash')
    .reduce((sum: number, repayment: any) => sum + repayment.amount, 0);
  const saleIds = new Set(revenueSales.map((sale: any) => sale.id));
  const totalCOGS = params.saleItems
    .filter((item: any) => saleIds.has(item.sale_id))
    .reduce((sum: number, item: any) => sum + (item.cost_price ?? 0) * item.quantity, 0);
  const grossProfit = (totalSales + totalRepayments) - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const cashExpenses = params.expenses
    .filter((expense) => expense.payment_method === 'cash')
    .reduce((sum, expense) => sum + expense.amount, 0);
  const expectedCash = totalCashSales + totalCashRepayments - cashExpenses;
  const actualCash = existingSummary?.cash_in_hand_actual;
  const timestamp = nowIso();

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
        id: createLocalId(),
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
        created_at: timestamp,
        updated_at: timestamp,
      };

  return { summary, entries };
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

  try {
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

    const sales = (salesResult.data ?? []) as any[];
    const expenses = ((expensesResult.data ?? []) as Expense[]);
    const repayments = (repaymentsResult.data ?? []) as any[];
    const existingSummary = summaryResult.data as DailySummary | null;
    const saleIds = sales.map((sale) => sale.id);
    let saleItems: any[] = [];

    if (saleIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);

      if (itemsError) throw itemsError;
      saleItems = items ?? [];
    }

    await Promise.all([
      upsertCachedRows({ businessId, branchId }, 'sales', sales),
      upsertCachedRows({ businessId, branchId }, 'expenses', expenses),
      upsertCachedRows({ businessId, branchId }, 'debt_repayments', repayments),
      upsertCachedRows({ businessId, branchId }, 'sale_items', saleItems),
      existingSummary
        ? upsertCachedRows({ businessId, branchId }, 'daily_summaries', [existingSummary])
        : Promise.resolve(),
    ]);

    return buildSnapshotFromRows({
      businessId,
      branchId,
      targetDate,
      sales,
      expenses,
      repayments,
      saleItems,
      existingSummary,
    });
  } catch (error) {
    const [
      cachedSales,
      cachedExpenses,
      cachedRepayments,
      cachedSaleItems,
      cachedSummaries,
      cachedDebts,
    ] = await Promise.all([
      readCachedRows<any>({ businessId, branchId }, 'sales'),
      readCachedRows<Expense>({ businessId, branchId }, 'expenses'),
      readCachedRows<any>({ businessId, branchId }, 'debt_repayments'),
      readCachedRows<any>({ businessId, branchId }, 'sale_items'),
      readCachedRows<DailySummary>({ businessId, branchId }, 'daily_summaries'),
      readCachedRows<CustomerDebt>({ businessId, branchId }, 'customer_debts'),
    ]);

    const sales = cachedSales.filter((sale) => isOnTargetDate(sale.created_at, targetDate));
    const expenses = cachedExpenses.filter((expense) => expense.expense_date === targetDate);
    const repayments = cachedRepayments.filter((repayment) => isOnTargetDate(repayment.created_at, targetDate));
    const saleIds = new Set(sales.map((sale) => sale.id));
    const saleItems = cachedSaleItems.filter((item) => saleIds.has(item.sale_id));
    const existingSummary =
      cachedSummaries.find((summary) => summary.summary_date === targetDate) ?? null;

    return buildSnapshotFromRows({
      businessId,
      branchId,
      targetDate,
      sales,
      expenses,
      repayments,
      saleItems,
      existingSummary,
      debts: cachedDebts,
    });
  }
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
  const timestamp = nowIso();
  const payload = {
    id: summary.id || createLocalId(),
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
    created_at: summary.created_at || timestamp,
    updated_at: timestamp,
  };

  const closedSummary = {
    ...summary,
    ...payload,
  } as DailySummary;

  await Promise.all([
    upsertCachedRows({ businessId, branchId }, 'daily_summaries', [closedSummary]),
    enqueueMutations([
      {
        operation: 'upsert',
        table: 'daily_summaries',
        payload,
        onConflict: 'business_id,branch_id,summary_date',
        description: `Sync daily close for ${summary.summary_date}`,
      },
    ]),
  ]);

  return closedSummary;
}

export async function reopenDailySummary(
  businessId: string,
  branchId: string,
  summaryDate: string,
): Promise<void> {
  const timestamp = nowIso();
  const summaries = await readCachedRows<DailySummary>({ businessId, branchId }, 'daily_summaries');
  const nextSummaries = summaries.map((summary) =>
    summary.summary_date === summaryDate
      ? { ...summary, is_closed: false, closed_by: undefined, updated_at: timestamp }
      : summary,
  );

  await Promise.all([
    replaceCachedRows({ businessId, branchId }, 'daily_summaries', nextSummaries),
    enqueueMutations([
      {
        operation: 'update',
        table: 'daily_summaries',
        payload: {
          is_closed: false,
          closed_by: null,
          updated_at: timestamp,
        },
        match: {
          business_id: businessId,
          branch_id: branchId,
          summary_date: summaryDate,
        },
        conflictPolicy: 'client-wins',
        description: `Sync daily reopen for ${summaryDate}`,
      },
    ]),
  ]);
}
