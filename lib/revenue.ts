import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { PaymentStatus, RevenueActivity, Sale } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { attachProductSummaries, saleItemsTable } from '@/lib/dataAccess';
import {
  getPendingSyncEntityIds,
  readCachedProducts,
  readCachedRevenueActivities,
  upsertCachedRevenueActivities,
} from '@/lib/offlineStore';

export const parseLocalDateString = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d);
};

const isWithinLocalDateRange = (isoDate: string, fromDate?: string, toDate?: string): boolean => {
  if (!fromDate && !toDate) return true;
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return false;
  if (fromDate) {
    const startTs = startOfDay(parseLocalDateString(fromDate)).getTime();
    if (ts < startTs) return false;
  }
  if (toDate) {
    const endTs = endOfDay(parseLocalDateString(toDate)).getTime();
    if (ts > endTs) return false;
  }
  return true;
};

export interface FetchRevenuePageParams {
  businessId: string;
  branchId: string;
  page?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
}

export interface FetchRevenuePageResult {
  activities: RevenueActivity[];
  hasMore: boolean;
}

type SaleRow = Sale & {
  customer?: {
    name?: string;
    phone?: string;
  } | null;
  items?: {
    product_id?: string;
    quantity: number;
    unit_price?: number;
    discount_amount?: number;
    total_price: number;
    product?: { name: string } | null;
  }[];
};

type DebtJoin = {
  id: string;
  sale_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  balance: number;
  status: string;
  business_id: string;
  branch_id: string;
  sale?: {
    items?: {
      product_id?: string;
      quantity: number;
      total_price: number;
      product?: { name: string } | null;
    }[];
  } | null;
};

type DebtRepaymentRow = {
  id: string;
  amount: number;
  payment_method: RevenueActivity['payment_method'];
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
  debt?: DebtJoin | DebtJoin[] | null;
};

export async function fetchRevenueActivitiesPage({
  businessId,
  branchId,
  page = 0,
  pageSize = 50,
  fromDate,
  toDate,
}: FetchRevenuePageParams): Promise<FetchRevenuePageResult> {
  const offset = page * pageSize;
  const fetchLimit = pageSize + 1;
  const rangeEnd = offset + fetchLimit - 1;
  const startIso = fromDate ? startOfDay(parseLocalDateString(fromDate)).toISOString() : undefined;
  const endIso = toDate ? endOfDay(parseLocalDateString(toDate)).toISOString() : undefined;

  try {
    const itemsSource = saleItemsTable();
    const includeCosts = itemsSource === 'sale_items';

    let salesQuery = supabase
      .from('sales')
      .select(
        includeCosts
          ? '*, customer:customers(name, phone), items:sale_items(product_id, quantity, unit_price, discount_amount, total_price, product:products(name))'
          : '*, customer:customers(name, phone), items:staff_sale_items(product_id, quantity, unit_price, discount_amount, total_price)',
      )
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });

    if (startIso) salesQuery = salesQuery.gte('created_at', startIso);
    if (endIso) salesQuery = salesQuery.lte('created_at', endIso);

    let repaymentsQuery = supabase
      .from('debt_repayments')
      .select(`
          id,
          amount,
          payment_method,
          notes,
          recorded_by,
          created_at,
          debt:customer_debts!inner(
            id,
            sale_id,
            customer_name,
            customer_phone,
            balance,
            status,
            business_id,
            branch_id,
            sale:sales(
              items:${itemsSource}(
                product_id,
                quantity,
                total_price
              )
            )
          )
        `)
      .eq('debt.business_id', businessId)
      .eq('debt.branch_id', branchId)
      .order('created_at', { ascending: false });

    if (startIso) repaymentsQuery = repaymentsQuery.gte('created_at', startIso);
    if (endIso) repaymentsQuery = repaymentsQuery.lte('created_at', endIso);

    const [salesResponse, repaymentsResponse, activeDebtsResponse, pendingIds] = await Promise.all([
      salesQuery.range(offset, rangeEnd),
      repaymentsQuery.range(offset, rangeEnd),
      supabase
        .from('customer_debts')
        .select('sale_id')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .neq('status', 'settled')
        .not('sale_id', 'is', null),
      page === 0 ? getPendingSyncEntityIds() : Promise.resolve(null),
    ]);

    if (salesResponse.error) {
      throw salesResponse.error;
    }

    if (repaymentsResponse.error) {
      throw repaymentsResponse.error;
    }

    const fetchedSales = (salesResponse.data as any[]) ?? [];
    const fetchedRepayments = (repaymentsResponse.data as DebtRepaymentRow[]) ?? [];
    const hasMore = fetchedSales.length > pageSize || fetchedRepayments.length > pageSize;

    const rawSalesList = fetchedSales.slice(0, pageSize);
    const rawRepaymentsList = fetchedRepayments.slice(0, pageSize);

    // ── Build Product Name Map (resolves products for staff accounts & unjoined items) ──
    const productNameMap = new Map<string, string>();
    const missingProductIds = new Set<string>();

    // 1. Pre-seed with products in memory (if available)
    const storeProducts = useBusinessStore.getState().products;
    for (const p of storeProducts) {
      if (p.id && p.name) {
        productNameMap.set(p.id, p.name);
      }
    }

    // 2. Identify all sales line items needing product names
    for (const sale of rawSalesList) {
      for (const item of sale.items ?? []) {
        if (item.product?.name) {
          if (item.product_id) productNameMap.set(item.product_id, item.product.name);
        } else if (item.product_id) {
          if (!productNameMap.has(item.product_id)) {
            missingProductIds.add(item.product_id);
          }
        }
      }
    }

    // 3. Identify repayment debt sales items needing product names
    for (const rep of rawRepaymentsList) {
      const debt = Array.isArray(rep.debt) ? rep.debt[0] : rep.debt;
      for (const item of debt?.sale?.items ?? []) {
        if (item.product?.name) {
          if (item.product_id) productNameMap.set(item.product_id, item.product.name);
        } else if (item.product_id) {
          if (!productNameMap.has(item.product_id)) {
            missingProductIds.add(item.product_id);
          }
        }
      }
    }

    // 4. Query staff_products (accessible by both cashiers and managers/owners) for missing IDs
    if (missingProductIds.size > 0) {
      try {
        const productSource = includeCosts ? 'products' : 'staff_products';
        const { data: fetchedProducts } = await supabase
          .from(productSource)
          .select('id, name')
          .in('id', Array.from(missingProductIds));

        if (fetchedProducts) {
          for (const p of fetchedProducts) {
            if (p.id && p.name) {
              productNameMap.set(p.id, p.name);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load products for revenue activities:', err);
      }
    }

    // 5. Fallback to cached products if any ID is still missing
    const stillMissing = Array.from(missingProductIds).filter((id) => !productNameMap.has(id));
    if (stillMissing.length > 0) {
      try {
        const cachedProducts = await readCachedProducts(businessId);
        for (const p of cachedProducts) {
          if (p.id && p.name && !productNameMap.has(p.id)) {
            productNameMap.set(p.id, p.name);
          }
        }
      } catch {}
    }

    // ── Enrich sales items with accurate product names ──
    const rawSales = rawSalesList.map((sale) => {
      const enrichedItems = (sale.items ?? []).map((item: any) => {
        const resolvedName =
          item.product?.name ||
          (item.product_id ? productNameMap.get(item.product_id) : undefined) ||
          item.product_name ||
          'Item';
        return {
          ...item,
          product: { name: resolvedName },
          product_name: resolvedName,
        };
      });
      return {
        ...sale,
        items: enrichedItems,
      };
    });

    const userIds = Array.from(
      new Set(
        [
          ...rawSales.map((s) => s.sold_by),
          ...rawRepaymentsList.map((r) => r.recorded_by),
        ].filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);

        if (profiles) {
          for (const p of profiles) {
            if (p.id && p.full_name) {
              profileMap.set(p.id, p.full_name);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load user profiles for revenue activities:', err);
      }
    }

    const currentUserId = useAuthStore.getState().user?.id;
    const currentUserName =
      useAuthStore.getState().profile?.full_name ||
      useAuthStore.getState().user?.user_metadata?.full_name;

    const activeDebtSaleIds = new Set(
      ((activeDebtsResponse?.data as { sale_id: string }[]) ?? [])
        .map((d) => d.sale_id)
        .filter(Boolean)
    );

    const saleActivities: RevenueActivity[] = rawSales
      .filter((sale) => !isDebtSettlementSale(sale.notes))
      .map((sale) => {
        const soldByName =
          (sale.sold_by ? profileMap.get(sale.sold_by) : undefined) ??
          (sale.sold_by && sale.sold_by === currentUserId ? currentUserName : undefined) ??
          sale.sold_by_name ??
          undefined;

        const isForgiven =
          sale.payment_status === 'forgiven' ||
          sale.notes?.includes('[Debt Forgiven]') ||
          sale.notes?.includes('[record-am-forgiven]') ||
          (sale.amount_owed > 0 && !activeDebtSaleIds.has(sale.id));

        const effectiveAmountOwed = isForgiven ? 0 : sale.amount_owed;
        const effectivePaymentStatus: PaymentStatus = isForgiven ? 'forgiven' : sale.payment_status;

        const items = (sale.items ?? []).map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          total_price: item.total_price ?? 0,
          product_name: item.product_name || item.product?.name || 'Item',
        }));

        const itemsSummary = items
          .map((item: any) => `${item.quantity}x ${item.product_name}`)
          .join(', ');

        return {
          id: sale.id,
          kind: 'sale',
          customer_name: sale.customer?.name ?? 'Walk-in Customer',
          customer_phone: sale.customer?.phone,
          reference: sale.sale_number,
          total_amount: sale.total_amount,
          amount_paid: sale.amount_paid,
          amount_owed: effectiveAmountOwed,
          payment_status: effectivePaymentStatus,
          payment_method: sale.payment_method,
          cash_amount: sale.cash_amount,
          transfer_amount: sale.transfer_amount,
          subtotal: Number(sale.subtotal ?? 0),
          discount_amount: Number(sale.discount_amount ?? 0),
          notes: isForgiven && !sale.notes?.includes('[Debt Forgiven]') && !sale.notes?.includes('[record-am-forgiven]')
            ? (sale.notes ? `${sale.notes} [Debt Forgiven]` : '[Debt Forgiven]')
            : sale.notes,
          sold_by_name: soldByName,
          items_summary: itemsSummary
            ? (itemsSummary.length > 40 ? itemsSummary.substring(0, 40) + '...' : itemsSummary)
            : undefined,
          created_at: sale.created_at,
          sale_id: sale.id,
          items,
        };
      });

    const repaymentActivities: RevenueActivity[] = rawRepaymentsList
      .map((repayment) => ({
        ...repayment,
        debtRecord: Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt,
      }))
      .filter((repayment) => repayment.debtRecord)
      .map((repayment) => {
        const recordedByName =
          (repayment.recorded_by ? profileMap.get(repayment.recorded_by) : undefined) ??
          (repayment.recorded_by && repayment.recorded_by === currentUserId ? currentUserName : undefined) ??
          undefined;

        const repaymentItems = (repayment.debtRecord?.sale?.items ?? []).map((item: any) => {
          const resolvedName =
            item.product?.name ||
            (item.product_id ? productNameMap.get(item.product_id) : undefined) ||
            item.product_name ||
            'Item';
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            total_price: item.total_price ?? 0,
            product_name: resolvedName,
          };
        });

        return {
          id: repayment.id,
          kind: 'debt_repayment',
          customer_name: repayment.debtRecord?.customer_name ?? 'Customer',
          customer_phone: repayment.debtRecord?.customer_phone ?? undefined,
          reference: repayment.debtRecord?.sale_id ? 'Debt Settlement' : 'Debt Collection',
          total_amount: repayment.amount,
          amount_paid: repayment.amount,
          amount_owed: Math.max(0, repayment.debtRecord?.balance ?? 0),
          payment_status: (repayment.debtRecord?.balance ?? 0) <= 0 ? 'paid' : 'partial',
          payment_method: repayment.payment_method,
          notes: repayment.notes ?? undefined,
          sold_by_name: recordedByName,
          created_at: repayment.created_at,
          sale_id: repayment.debtRecord?.sale_id ?? undefined,
          debt_id: repayment.debtRecord?.id,
          items: repaymentItems,
        };
      });

    const serverActivities = [...saleActivities, ...repaymentActivities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Upsert server activities into cache so offline fallback stays rich
    await upsertCachedRevenueActivities(businessId, branchId, serverActivities);

    let mergedActivities = serverActivities;

    // On page 0, merge any unsynced local sales/repayments waiting in the sync queue
    if (page === 0 && pendingIds) {
      const cachedActivities = await readCachedRevenueActivities(businessId, branchId, 0);
      const serverActivityKeys = new Set(serverActivities.map((activity) => `${activity.kind}-${activity.id}`));
      const unsyncedCached = cachedActivities
        .filter((activity) => {
          if (serverActivityKeys.has(`${activity.kind}-${activity.id}`)) return false;
          if (!isWithinLocalDateRange(activity.created_at, fromDate, toDate)) return false;
          if (activity.kind === 'sale') {
            return pendingIds.saleIds.has(activity.sale_id || activity.id);
          }
          return pendingIds.repaymentIds.has(activity.id);
        })
        .map((activity) => {
          if (!activity.items?.length) return activity;
          const healedItems = activity.items.map((it: any) => {
            if ((!it.product_name || it.product_name === 'Unknown Item' || it.product_name === 'Unknown') && it.product_id) {
              const matchedName = productNameMap.get(it.product_id);
              if (matchedName) {
                return { ...it, product_name: matchedName };
              }
            }
            return it;
          });
          const healedSummary = healedItems
            .map((it: any) => `${it.quantity}x ${it.product_name || 'Item'}`)
            .join(', ');
          return {
            ...activity,
            items: healedItems,
            items_summary: healedSummary ? (healedSummary.length > 40 ? healedSummary.substring(0, 40) + '...' : healedSummary) : activity.items_summary,
          };
        });

      mergedActivities = [...unsyncedCached, ...serverActivities]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return {
      activities: mergedActivities,
      hasMore,
    };
  } catch (error) {
    const allCached = await readCachedRevenueActivities(businessId, branchId, 0);
    const filteredCached = allCached.filter((activity) =>
      isWithinLocalDateRange(activity.created_at, fromDate, toDate),
    );
    const slice = filteredCached.slice(offset, offset + pageSize);
    if (slice.length > 0 || page > 0 || fromDate || toDate) {
      return {
        activities: slice,
        hasMore: filteredCached.length > offset + pageSize,
      };
    }
    throw error;
  }
}

export async function fetchRevenueActivities(
  businessId: string,
  branchId: string,
  limit = 60,
): Promise<RevenueActivity[]> {
  const result = await fetchRevenueActivitiesPage({
    businessId,
    branchId,
    page: 0,
    pageSize: limit,
  });
  return result.activities.slice(0, limit);
}
