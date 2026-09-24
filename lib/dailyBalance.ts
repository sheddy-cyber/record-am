import { endOfDay, format, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getPaymentBreakdown, isDebtSettlementSale, readBankPaymentNote } from '@/lib/records';
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
  cash_amount?: number;
  transfer_amount?: number;
  discount_amount?: number;
  bank_name?: string;
  payment_account_id?: string;
}

export interface DigitalInflowItem {
  channel: 'transfer' | 'pos';
  bankName: string;
  total: number;
  count: number;
}

export interface DigitalInflowsSummary {
  totalTransfer: number;
  totalPos: number;
  totalDigital: number;
  byBank: DigitalInflowItem[];
  byPos: DigitalInflowItem[];
}

export interface DailyBalanceSnapshot {
  summary: DailySummary;
  entries: BalanceEntry[];
  digitalInflows: DigitalInflowsSummary;
}

const isOnTargetDate = (isoDate: string | undefined, targetDate: string) => {
  if (!isoDate) return false;
  try {
    return format(new Date(isoDate), 'yyyy-MM-dd') === targetDate;
  } catch {
    return isoDate.slice(0, 10) === targetDate;
  }
};

function resolveSaleDiscount(sale: any, allSaleItems?: any[]): number {
  const directDiscount = Number(sale?.discount_amount || 0);
  if (directDiscount > 0) return directDiscount;

  const subtotal = Number(sale?.subtotal || 0);
  const totalAmount = Number(sale?.total_amount || 0);
  if (subtotal > totalAmount && totalAmount > 0) {
    const diff = subtotal - totalAmount;
    if (diff > 0) return diff;
  }

  if (Array.isArray(sale?.items) && sale.items.length > 0) {
    const itemsDiscount = sale.items.reduce(
      (sum: number, item: any) => sum + Number(item?.discount_amount || 0),
      0
    );
    if (itemsDiscount > 0) return itemsDiscount;
  }

  if (Array.isArray(allSaleItems) && allSaleItems.length > 0) {
    const matchingItems = allSaleItems.filter((item: any) => item?.sale_id === sale?.id);
    const itemsDiscount = matchingItems.reduce(
      (sum: number, item: any) => sum + Number(item?.discount_amount || 0),
      0
    );
    if (itemsDiscount > 0) return itemsDiscount;
  }

  return 0;
}

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
  products?: any[];
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
    ...revenueSales.map((sale: any) => {
      const breakdown = getPaymentBreakdown(sale);
      const bankName = sale.bank_name || readBankPaymentNote(sale.notes).bankName;
      const amountPaid = Number(sale.amount_paid ?? sale.total_amount ?? 0);
      return {
        id: sale.id,
        description: sale.customer?.name ? `Sale to ${sale.customer.name}` : 'Walk-in Sale',
        amount: amountPaid,
        type: 'sale' as const,
        time: sale.created_at,
        payment_method: sale.payment_method,
        cash_amount: sale.payment_method === 'mixed' ? breakdown.cash : undefined,
        transfer_amount: sale.payment_method === 'mixed' ? breakdown.transfer : undefined,
        discount_amount: resolveSaleDiscount(sale, params.saleItems),
        bank_name: bankName,
        payment_account_id: sale.payment_account_id,
      };
    }),
    ...params.expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: -Number(expense.amount || 0),
      type: 'expense' as const,
      time: expense.created_at,
      payment_method: expense.payment_method,
    })),
    ...branchRepayments.map((repayment: any) => {
      const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
      const cachedDebt = debtMap.get(repayment.debt_id);
      const breakdown = getPaymentBreakdown(repayment);
      const bankName = repayment.bank_name || readBankPaymentNote(repayment.notes).bankName;
      const repAmount = Number(repayment.amount || 0);
      return {
        id: repayment.id,
        description: `Debt payment from ${debt?.customer_name ?? cachedDebt?.customer_name ?? 'Customer'}`,
        amount: repAmount,
        type: 'debt_repayment' as const,
        time: repayment.created_at,
        payment_method: repayment.payment_method,
        cash_amount: repayment.payment_method === 'mixed' ? breakdown.cash : undefined,
        transfer_amount: repayment.payment_method === 'mixed' ? breakdown.transfer : undefined,
        bank_name: bankName,
        payment_account_id: repayment.payment_account_id,
      };
    }),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const totalSales = revenueSales.reduce((sum: number, sale: any) => sum + Number(sale.amount_paid ?? sale.total_amount ?? 0), 0);
  const totalDiscounts = revenueSales.reduce((sum: number, sale: any) => sum + resolveSaleDiscount(sale, params.saleItems), 0);
  const totalCashSales = revenueSales.reduce((sum: number, sale: any) => {
    const breakdown = getPaymentBreakdown(sale);
    return sum + Number(breakdown.cash || 0);
  }, 0);
  const totalExpenses = params.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalRepayments = branchRepayments.reduce((sum: number, repayment: any) => sum + Number(repayment.amount || 0), 0);
  const totalCashRepayments = branchRepayments.reduce((sum: number, repayment: any) => {
    const breakdown = getPaymentBreakdown(repayment);
    return sum + Number(breakdown.cash || 0);
  }, 0);
  const saleIds = new Set(revenueSales.map((sale: any) => sale.id));
  const productCostMap = new Map((params.products ?? []).map((p: any) => [p.id, Number(p.cost_price ?? 0)]));
  const totalCOGS = params.saleItems
    .filter((item: any) => saleIds.has(item.sale_id))
    .reduce((sum: number, item: any) => {
      const rawCost = Number(item.cost_price ?? 0);
      const fallbackCost = productCostMap.get(item.product_id) ?? 0;
      const effectiveCost = rawCost > 0 ? rawCost : fallbackCost;
      return sum + effectiveCost * item.quantity;
    }, 0);
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
        total_discounts: totalDiscounts > 0 ? totalDiscounts : (existingSummary.total_discounts ?? 0),
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
        total_discounts: totalDiscounts,
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

  const bankMap = new Map<string, { total: number; count: number }>();
  const posMap = new Map<string, { total: number; count: number }>();

  const recordInflow = (channel: 'transfer' | 'pos', rawBankName: string | undefined, amount: number) => {
    if (amount <= 0) return;
    const map = channel === 'transfer' ? bankMap : posMap;
    const name = rawBankName?.trim() || (channel === 'transfer' ? 'Unspecified Bank' : 'Unspecified POS');
    const existing = map.get(name) || { total: 0, count: 0 };
    map.set(name, { total: existing.total + amount, count: existing.count + 1 });
  };

  for (const sale of revenueSales) {
    const breakdown = getPaymentBreakdown(sale);
    const saleBank = sale.bank_name || readBankPaymentNote(sale.notes).bankName;
    const method = (sale.payment_method || '').toLowerCase();
    const amountPaid = Number(sale.amount_paid ?? sale.total_amount ?? 0);

    if (method === 'transfer') {
      recordInflow('transfer', saleBank, amountPaid);
    } else if (method === 'pos') {
      recordInflow('pos', saleBank, amountPaid);
    } else if (method === 'mixed') {
      if (breakdown.transfer > 0) {
        recordInflow('transfer', saleBank, breakdown.transfer);
      }
    } else if (method === 'mobile_money') {
      recordInflow('transfer', saleBank || 'Mobile Money', amountPaid);
    }
  }

  for (const repayment of branchRepayments) {
    const breakdown = getPaymentBreakdown(repayment);
    const repBank = repayment.bank_name || readBankPaymentNote(repayment.notes).bankName;
    const method = (repayment.payment_method || '').toLowerCase();
    const repAmount = Number(repayment.amount || 0);

    if (method === 'transfer') {
      recordInflow('transfer', repBank, repAmount);
    } else if (method === 'pos') {
      recordInflow('pos', repBank, repAmount);
    } else if (method === 'mixed') {
      if (breakdown.transfer > 0) {
        recordInflow('transfer', repBank, breakdown.transfer);
      }
    } else if (method === 'mobile_money') {
      recordInflow('transfer', repBank || 'Mobile Money', repAmount);
    }
  }

  const byBank: DigitalInflowItem[] = Array.from(bankMap.entries())
    .map(([bankName, val]) => ({
      channel: 'transfer' as const,
      bankName,
      total: Number(val.total.toFixed(2)),
      count: val.count,
    }))
    .sort((a, b) => b.total - a.total);

  const byPos: DigitalInflowItem[] = Array.from(posMap.entries())
    .map(([bankName, val]) => ({
      channel: 'pos' as const,
      bankName,
      total: Number(val.total.toFixed(2)),
      count: val.count,
    }))
    .sort((a, b) => b.total - a.total);

  const totalTransfer = Number(byBank.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const totalPos = Number(byPos.reduce((sum, item) => sum + item.total, 0).toFixed(2));

  const digitalInflows: DigitalInflowsSummary = {
    totalTransfer,
    totalPos,
    totalDigital: Number((totalTransfer + totalPos).toFixed(2)),
    byBank,
    byPos,
  };

  return { summary, entries, digitalInflows };
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

  // 1. Always read cached rows first so locally recorded sales and bank details are never lost
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

    const serverSales = (salesResult.data ?? []) as any[];
    const serverExpenses = ((expensesResult.data ?? []) as Expense[]);
    const serverRepayments = (repaymentsResult.data ?? []) as any[];
    const existingSummary = (summaryResult.data as DailySummary | null) ??
      (cachedSummaries.find((s) => s.summary_date === targetDate) ?? null);

    // Merge server sales with local cached sales
    const salesMap = new Map<string, any>();
    for (const cached of cachedSales) {
      if (isOnTargetDate(cached.created_at, targetDate)) {
        salesMap.set(cached.id, cached);
      }
    }
    for (const remote of serverSales) {
      const local = salesMap.get(remote.id);
      salesMap.set(remote.id, {
        ...local,
        ...remote,
        bank_name: remote.bank_name || local?.bank_name,
        payment_account_id: remote.payment_account_id || local?.payment_account_id,
        cash_amount: remote.cash_amount ?? local?.cash_amount,
        transfer_amount: remote.transfer_amount ?? local?.transfer_amount,
        discount_amount: (remote.discount_amount && remote.discount_amount > 0) ? remote.discount_amount : (local?.discount_amount ?? remote.discount_amount ?? 0),
        customer: remote.customer || local?.customer,
      });
    }
    const sales = Array.from(salesMap.values());

    // Merge expenses
    const expensesMap = new Map<string, Expense>();
    for (const cached of cachedExpenses) {
      if (cached.expense_date === targetDate || isOnTargetDate(cached.created_at, targetDate)) {
        expensesMap.set(cached.id, cached);
      }
    }
    for (const remote of serverExpenses) {
      expensesMap.set(remote.id, { ...expensesMap.get(remote.id), ...remote });
    }
    const expenses = Array.from(expensesMap.values());

    // Merge repayments
    const repaymentsMap = new Map<string, any>();
    for (const cached of cachedRepayments) {
      if (isOnTargetDate(cached.created_at, targetDate)) {
        repaymentsMap.set(cached.id, cached);
      }
    }
    for (const remote of serverRepayments) {
      const local = repaymentsMap.get(remote.id);
      repaymentsMap.set(remote.id, {
        ...local,
        ...remote,
        bank_name: remote.bank_name || local?.bank_name,
        payment_account_id: remote.payment_account_id || local?.payment_account_id,
        cash_amount: remote.cash_amount ?? local?.cash_amount,
        transfer_amount: remote.transfer_amount ?? local?.transfer_amount,
        debt: remote.debt || local?.debt,
      });
    }
    const repayments = Array.from(repaymentsMap.values());

    const saleIds = sales.map((sale) => sale.id);
    let saleItems: any[] = [];
    if (saleIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);

      const serverItems = itemsError ? [] : (items ?? []);
      const itemMap = new Map<string, any>();
      for (const cached of cachedSaleItems) {
        if (saleIds.includes(cached.sale_id)) {
          itemMap.set(cached.id, cached);
        }
      }
      for (const remote of serverItems) {
        itemMap.set(remote.id, remote);
      }
      saleItems = Array.from(itemMap.values());
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

    const { useBusinessStore } = await import('@/store/businessStore');
    let products = useBusinessStore.getState().products;
    if (!products || products.length === 0) {
      const { readCachedProducts } = await import('@/lib/offlineStore');
      products = await readCachedProducts(businessId);
    }

    return buildSnapshotFromRows({
      businessId,
      branchId,
      targetDate,
      sales,
      expenses,
      repayments,
      saleItems,
      existingSummary,
      products,
      debts: cachedDebts,
    });
  } catch (error) {
    console.log('[dailyBalance] Falling back to local cache:', error);
    const sales = cachedSales.filter((sale) => isOnTargetDate(sale.created_at, targetDate));
    const expenses = cachedExpenses.filter((expense) => expense.expense_date === targetDate || isOnTargetDate(expense.created_at, targetDate));
    const repayments = cachedRepayments.filter((repayment) => isOnTargetDate(repayment.created_at, targetDate));
    const saleIds = new Set(sales.map((sale) => sale.id));
    const saleItems = cachedSaleItems.filter((item) => saleIds.has(item.sale_id));
    const existingSummary =
      cachedSummaries.find((summary) => summary.summary_date === targetDate) ?? null;

    const { useBusinessStore } = await import('@/store/businessStore');
    let products = useBusinessStore.getState().products;
    if (!products || products.length === 0) {
      const { readCachedProducts } = await import('@/lib/offlineStore');
      products = await readCachedProducts(businessId);
    }

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
      products,
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
    total_discounts: summary.total_discounts ?? 0,
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
