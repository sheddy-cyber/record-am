import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { readCachedRows } from '@/lib/offlineStore';

export type StaffStatsPeriod = 'all' | 'month' | 'today';

export interface StaffMemberStats {
  userId: string;
  salesWorth: number;
  salesCount: number;
  paidAmount: number;
  owedAmount: number;
  purchasesWorth: number;
  purchasesCount: number;
  expensesAmount: number;
  expensesCount: number;
  lastActiveAt?: string;
}

export interface TeamOverviewStats {
  totalSalesWorth: number;
  totalSalesCount: number;
  totalPurchasesWorth: number;
  totalPurchasesCount: number;
  totalExpensesAmount: number;
  topSellerUserId?: string;
  topSellerWorth: number;
}

export function createEmptyStaffStats(userId: string): StaffMemberStats {
  return {
    userId,
    salesWorth: 0,
    salesCount: 0,
    paidAmount: 0,
    owedAmount: 0,
    purchasesWorth: 0,
    purchasesCount: 0,
    expensesAmount: 0,
    expensesCount: 0,
  };
}

export function getDateFilterBounds(period: StaffStatsPeriod): { from?: Date; to?: Date } {
  const now = new Date();
  if (period === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (period === 'month') {
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  return {};
}

export async function fetchTeamStaffStats(
  businessId: string,
  period: StaffStatsPeriod = 'all',
  branchId?: string,
): Promise<{
  memberStats: Record<string, StaffMemberStats>;
  overview: TeamOverviewStats;
}> {
  const { from, to } = getDateFilterBounds(period);
  const fromISO = from ? from.toISOString() : undefined;
  const toISO = to ? to.toISOString() : undefined;

  let sales: any[] = [];
  let purchases: any[] = [];
  let expenses: any[] = [];

  try {
    let salesQuery = supabase
      .from('sales')
      .select('id, sold_by, total_amount, amount_paid, amount_owed, created_at')
      .eq('business_id', businessId);

    let purchasesQuery = supabase
      .from('purchases')
      .select('id, recorded_by, total_amount, created_at')
      .eq('business_id', businessId);

    let expensesQuery = supabase
      .from('expenses')
      .select('id, recorded_by, amount, created_at')
      .eq('business_id', businessId);

    if (branchId) {
      salesQuery = salesQuery.eq('branch_id', branchId);
      purchasesQuery = purchasesQuery.eq('branch_id', branchId);
      expensesQuery = expensesQuery.eq('branch_id', branchId);
    }

    if (fromISO && toISO) {
      salesQuery = salesQuery.gte('created_at', fromISO).lte('created_at', toISO);
      purchasesQuery = purchasesQuery.gte('created_at', fromISO).lte('created_at', toISO);
      expensesQuery = expensesQuery.gte('created_at', fromISO).lte('created_at', toISO);
    }

    const [salesRes, purchasesRes, expensesRes] = await Promise.all([
      salesQuery,
      purchasesQuery,
      expensesQuery,
    ]);

    if (salesRes.error) throw salesRes.error;
    if (purchasesRes.error) throw purchasesRes.error;
    if (expensesRes.error) throw expensesRes.error;

    sales = salesRes.data || [];
    purchases = purchasesRes.data || [];
    expenses = expensesRes.data || [];
  } catch (onlineErr) {
    console.warn('[teamStats] Falling back to cached data:', onlineErr);
    try {
      const [cachedSales, cachedPurchases, cachedExpenses] = await Promise.all([
        readCachedRows<any>({ businessId }, 'sales'),
        readCachedRows<any>({ businessId }, 'purchases'),
        readCachedRows<any>({ businessId }, 'expenses'),
      ]);

      const isWithinPeriod = (createdAt?: string) => {
        if (!from || !to || !createdAt) return true;
        const time = new Date(createdAt).getTime();
        return time >= from.getTime() && time <= to.getTime();
      };

      sales = (cachedSales || []).filter((s) => isWithinPeriod(s.created_at));
      purchases = (cachedPurchases || []).filter((p) => isWithinPeriod(p.created_at));
      expenses = (cachedExpenses || []).filter((e) => isWithinPeriod(e.created_at));
    } catch (cacheErr) {
      console.error('[teamStats] Failed to read cached data:', cacheErr);
    }
  }

  const memberStats: Record<string, StaffMemberStats> = {};

  const ensureStats = (uid: string) => {
    if (!memberStats[uid]) {
      memberStats[uid] = createEmptyStaffStats(uid);
    }
    return memberStats[uid];
  };

  let totalSalesWorth = 0;
  let totalSalesCount = 0;
  let totalPurchasesWorth = 0;
  let totalPurchasesCount = 0;
  let totalExpensesAmount = 0;

  for (const sale of sales) {
    const totalAmount = Number(sale.total_amount || 0);
    const amountPaid = Number(sale.amount_paid || 0);
    const amountOwed = Number(sale.amount_owed || 0);

    totalSalesWorth += totalAmount;
    totalSalesCount += 1;

    if (sale.sold_by) {
      const stats = ensureStats(sale.sold_by);
      stats.salesWorth += totalAmount;
      stats.salesCount += 1;
      stats.paidAmount += amountPaid;
      stats.owedAmount += amountOwed;

      if (
        sale.created_at &&
        (!stats.lastActiveAt || new Date(sale.created_at) > new Date(stats.lastActiveAt))
      ) {
        stats.lastActiveAt = sale.created_at;
      }
    }
  }

  for (const purchase of purchases) {
    const totalCost = Number(purchase.total_amount || 0);
    totalPurchasesWorth += totalCost;
    totalPurchasesCount += 1;

    if (purchase.recorded_by) {
      const stats = ensureStats(purchase.recorded_by);
      stats.purchasesWorth += totalCost;
      stats.purchasesCount += 1;

      if (
        purchase.created_at &&
        (!stats.lastActiveAt || new Date(purchase.created_at) > new Date(stats.lastActiveAt))
      ) {
        stats.lastActiveAt = purchase.created_at;
      }
    }
  }

  for (const expense of expenses) {
    const amt = Number(expense.amount || 0);
    totalExpensesAmount += amt;

    if (expense.recorded_by) {
      const stats = ensureStats(expense.recorded_by);
      stats.expensesAmount += amt;
      stats.expensesCount += 1;

      if (
        expense.created_at &&
        (!stats.lastActiveAt || new Date(expense.created_at) > new Date(stats.lastActiveAt))
      ) {
        stats.lastActiveAt = expense.created_at;
      }
    }
  }

  // Determine top seller
  let topSellerUserId: string | undefined = undefined;
  let topSellerWorth = 0;

  for (const [uid, stats] of Object.entries(memberStats)) {
    if (stats.salesWorth > topSellerWorth) {
      topSellerWorth = stats.salesWorth;
      topSellerUserId = uid;
    }
  }

  return {
    memberStats,
    overview: {
      totalSalesWorth,
      totalSalesCount,
      totalPurchasesWorth,
      totalPurchasesCount,
      totalExpensesAmount,
      topSellerUserId,
      topSellerWorth,
    },
  };
}
