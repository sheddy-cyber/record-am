// ============================================================
// RECORD AM - Per-branch "today" figures
// One query set for every branch at once, memoised briefly so the branch
// switcher and the Branches screen open instantly on repeat visits.
// ============================================================

import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';

export interface BranchTodayStats {
  todayRevenue: number;
  todayCount: number;
  staffCount: number;
}

type CacheEntry = { at: number; dayKey: string; data: Record<string, BranchTodayStats> };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Record<string, BranchTodayStats>>>();
const TTL_MS = 60_000;

const dayKey = () => new Date().toDateString();

/** Last known figures (possibly stale) — render these immediately, then refresh. */
export function peekBranchTodayStats(businessId: string): Record<string, BranchTodayStats> | null {
  const hit = cache.get(businessId);
  if (!hit || hit.dayKey !== dayKey()) return null;
  return hit.data;
}

export function invalidateBranchTodayStats(businessId?: string) {
  if (businessId) cache.delete(businessId);
  else cache.clear();
}

export async function fetchBranchTodayStats(
  businessId: string,
  branchIds: string[],
  { force = false }: { force?: boolean } = {},
): Promise<Record<string, BranchTodayStats>> {
  const hit = cache.get(businessId);
  if (!force && hit && hit.dayKey === dayKey() && Date.now() - hit.at < TTL_MS) return hit.data;
  const running = inflight.get(businessId);
  if (running) return running;

  const task = (async () => {
    const now = new Date();
    const dayStart = startOfDay(now).toISOString();
    const dayEnd = endOfDay(now).toISOString();

    const [salesRes, repaymentsRes, membersRes] = await Promise.all([
      supabase
        .from('sales')
        .select('branch_id, amount_paid, notes')
        .eq('business_id', businessId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      supabase
        .from('debt_repayments')
        .select('amount, debt:customer_debts!inner(business_id, branch_id)')
        .eq('debt.business_id', businessId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      supabase.from('business_members').select('branch_id').eq('business_id', businessId).eq('is_active', true),
    ]);

    const out: Record<string, BranchTodayStats> = {};
    for (const id of branchIds) out[id] = { todayRevenue: 0, todayCount: 0, staffCount: 0 };

    for (const s of (salesRes.data ?? []) as any[]) {
      const row = out[s.branch_id];
      if (!row || isDebtSettlementSale(s.notes)) continue;
      row.todayRevenue += Number(s.amount_paid ?? 0);
      row.todayCount += 1;
    }
    for (const r of (repaymentsRes.data ?? []) as any[]) {
      const debt = Array.isArray(r.debt) ? r.debt[0] : r.debt;
      const row = debt?.branch_id ? out[debt.branch_id] : undefined;
      if (!row) continue;
      row.todayRevenue += Number(r.amount ?? 0);
      row.todayCount += 1;
    }
    for (const m of (membersRes.data ?? []) as any[]) {
      const row = m.branch_id ? out[m.branch_id] : undefined;
      if (row) row.staffCount += 1;
    }

    cache.set(businessId, { at: Date.now(), dayKey: dayKey(), data: out });
    return out;
  })();

  inflight.set(businessId, task);
  try {
    return await task;
  } finally {
    inflight.delete(businessId);
  }
}
