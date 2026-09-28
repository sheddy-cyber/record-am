import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { RevenueActivity, Sale } from '@/types';
import { useAuthStore } from '@/store/authStore';
import {
  readCachedRevenueActivities,
  upsertCachedRevenueActivities,
} from '@/lib/offlineStore';

type SaleRow = Sale & {
  customer?: {
    name?: string;
    phone?: string;
  } | null;
  items?: {
    quantity: number;
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

export async function fetchRevenueActivities(
  businessId: string,
  branchId: string,
  limit = 60,
): Promise<RevenueActivity[]> {
  try {
    const [salesResponse, repaymentsResponse] = await Promise.all([
      supabase
        .from('sales')
        .select('*, customer:customers(name, phone), items:sale_items(quantity, unit_price, discount_amount, total_price, product:products(name))')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
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
              items:sale_items(
                quantity,
                total_price,
                product:products(name)
              )
            )
          )
        `)
        .eq('debt.business_id', businessId)
        .eq('debt.branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    if (salesResponse.error) {
      throw salesResponse.error;
    }

    if (repaymentsResponse.error) {
      throw repaymentsResponse.error;
    }

    const rawSales = (salesResponse.data as SaleRow[]) ?? [];
    const rawRepayments = (repaymentsResponse.data as DebtRepaymentRow[]) ?? [];

    const userIds = Array.from(
      new Set(
        [
          ...rawSales.map((s) => s.sold_by),
          ...rawRepayments.map((r) => r.recorded_by),
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

    const saleActivities: RevenueActivity[] = rawSales
      .filter((sale) => !isDebtSettlementSale(sale.notes))
      .map((sale) => {
        const soldByName =
          (sale.sold_by ? profileMap.get(sale.sold_by) : undefined) ??
          (sale.sold_by && sale.sold_by === currentUserId ? currentUserName : undefined) ??
          sale.sold_by_name ??
          undefined;

        return {
          id: sale.id,
          kind: 'sale',
          customer_name: sale.customer?.name ?? 'Walk-in Customer',
          customer_phone: sale.customer?.phone,
          reference: sale.sale_number,
          total_amount: sale.total_amount,
          amount_paid: sale.amount_paid,
          amount_owed: sale.amount_owed,
          payment_status: sale.payment_status,
          payment_method: sale.payment_method,
          cash_amount: sale.cash_amount,
          transfer_amount: sale.transfer_amount,
          subtotal: Number(sale.subtotal ?? 0),
          discount_amount: Number(sale.discount_amount ?? 0),
          notes: sale.notes,
          sold_by_name: soldByName,
          items_summary: (sale.items?.map((item) => `${item.quantity}x ${item.product?.name ?? 'Item'}`).join(', ')) &&
            ((sale.items?.map((item) => `${item.quantity}x ${item.product?.name ?? 'Item'}`).join(', ')?.length ?? 0) > 40
              ? (sale.items?.map((item) => `${item.quantity}x ${item.product?.name ?? 'Item'}`).join(', ')?.substring(0, 40) + '...')
              : sale.items?.map((item) => `${item.quantity}x ${item.product?.name ?? 'Item'}`).join(', ')),
          created_at: sale.created_at,
          sale_id: sale.id,
          items: sale.items?.map((item) => ({
            quantity: item.quantity,
            unit_price: (item as any).unit_price,
            discount_amount: (item as any).discount_amount,
            total_price: item.total_price ?? 0,
            product_name: item.product?.name ?? 'Unknown Item'
          })),
        };
      });

    const repaymentActivities: RevenueActivity[] = rawRepayments
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
          items: repayment.debtRecord?.sale?.items?.map((item) => ({
            quantity: item.quantity,
            total_price: item.total_price ?? 0,
            product_name: item.product?.name ?? 'Unknown Item'
          })),
        };
      });

    const serverActivities = [...saleActivities, ...repaymentActivities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Upsert server activities into cache so all activities are preserved
    await upsertCachedRevenueActivities(businessId, branchId, serverActivities);

    const cachedActivities = await readCachedRevenueActivities(businessId, branchId, 500);
    const serverActivityKeys = new Set(serverActivities.map((activity) => `${activity.kind}-${activity.id}`));
    const allActivities = [
      ...serverActivities,
      ...cachedActivities.filter((activity) => !serverActivityKeys.has(`${activity.kind}-${activity.id}`)),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return allActivities.slice(0, limit);
  } catch (error) {
    const cached = await readCachedRevenueActivities(businessId, branchId, limit);
    if (cached.length > 0) return cached;
    throw error;
  }
}
