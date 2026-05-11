import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { RevenueActivity, Sale } from '@/types';

type SaleRow = Sale & {
  customer?: {
    name?: string;
    phone?: string;
  } | null;
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
};

type DebtRepaymentRow = {
  id: string;
  amount: number;
  payment_method: RevenueActivity['payment_method'];
  notes?: string | null;
  created_at: string;
  debt?: DebtJoin | DebtJoin[] | null;
};

export async function fetchRevenueActivities(
  businessId: string,
  branchId: string,
  limit = 60,
): Promise<RevenueActivity[]> {
  const [salesResponse, repaymentsResponse] = await Promise.all([
    supabase
      .from('sales')
      .select('*, customer:customers(name, phone)')
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
        created_at,
        debt:customer_debts!inner(
          id,
          sale_id,
          customer_name,
          customer_phone,
          balance,
          status,
          business_id,
          branch_id
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

  const saleActivities: RevenueActivity[] = ((salesResponse.data as SaleRow[]) ?? [])
    .filter((sale) => !isDebtSettlementSale(sale.notes))
    .map((sale) => ({
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
      notes: sale.notes,
      created_at: sale.created_at,
      sale_id: sale.id,
    }));

  const repaymentActivities: RevenueActivity[] = ((repaymentsResponse.data as DebtRepaymentRow[]) ?? [])
    .map((repayment) => ({
      ...repayment,
      debtRecord: Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt,
    }))
    .filter((repayment) => repayment.debtRecord)
    .map((repayment) => ({
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
      created_at: repayment.created_at,
      sale_id: repayment.debtRecord?.sale_id ?? undefined,
      debt_id: repayment.debtRecord?.id,
    }));

  return [...saleActivities, ...repaymentActivities]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
