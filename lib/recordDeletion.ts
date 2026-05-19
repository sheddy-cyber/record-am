import { supabase } from '@/lib/supabase';
import { StockMovementType } from '@/types';

const STOCK_REMOVAL_TYPES: StockMovementType[] = ['stock_out', 'damage', 'wastage'];

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

async function adjustInventory(productId: string, branchId: string, delta: number) {
  const { data, error } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .limit(1);

  throwIfError(error);

  const currentQuantity = Number(data?.[0]?.quantity ?? 0);
  const nextQuantity = Math.max(0, currentQuantity + delta);

  const { error: upsertError } = await supabase
    .from('inventory')
    .upsert(
      {
        product_id: productId,
        branch_id: branchId,
        quantity: nextQuantity,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'product_id,branch_id' },
    );

  throwIfError(upsertError);
}

export async function deleteExpenseRecord(expenseId: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  throwIfError(error);
}

export async function deleteCustomerDebtRecord(debtId: string) {
  const { error } = await supabase.from('customer_debts').delete().eq('id', debtId);
  throwIfError(error);
}

export async function deleteSupplierDebtRecord(debtId: string) {
  const { error } = await supabase.from('supplier_debts').delete().eq('id', debtId);
  throwIfError(error);
}

export async function deleteProductRecord(productId: string) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', productId);

  throwIfError(error);
}

export async function deleteDailySummaryRecord(summaryId: string) {
  const { error } = await supabase.from('daily_summaries').delete().eq('id', summaryId);
  throwIfError(error);
}

export async function deleteStockMovementRecord(movementId: string) {
  const { data: movement, error } = await supabase
    .from('stock_movements')
    .select('id, branch_id, product_id, type, quantity')
    .eq('id', movementId)
    .single();

  throwIfError(error);
  if (!movement) return;

  const type = movement.type as StockMovementType;
  const reverseDelta = STOCK_REMOVAL_TYPES.includes(type)
    ? Number(movement.quantity)
    : -Number(movement.quantity);

  await adjustInventory(movement.product_id, movement.branch_id, reverseDelta);

  const { error: deleteError } = await supabase.from('stock_movements').delete().eq('id', movementId);
  throwIfError(deleteError);
}

export async function deleteDebtRepaymentRecord(repaymentId: string) {
  const { data: repayment, error } = await supabase
    .from('debt_repayments')
    .select('id, debt_id, amount')
    .eq('id', repaymentId)
    .single();

  throwIfError(error);
  if (!repayment) return;

  const { data: debt, error: debtError } = await supabase
    .from('customer_debts')
    .select('id, sale_id, original_amount, amount_paid, balance')
    .eq('id', repayment.debt_id)
    .single();

  throwIfError(debtError);

  const amount = Number(repayment.amount);

  const { error: deleteError } = await supabase
    .from('debt_repayments')
    .delete()
    .eq('id', repaymentId);

  throwIfError(deleteError);

  if (debt) {
    const nextAmountPaid = Math.max(0, Number(debt.amount_paid ?? 0) - amount);
    const nextBalance = Math.max(0, Number(debt.balance ?? 0) + amount);
    const nextStatus = nextBalance <= 0
      ? 'settled'
      : nextAmountPaid > 0
        ? 'partial'
        : 'outstanding';

    const { error: updateDebtError } = await supabase
      .from('customer_debts')
      .update({
        amount_paid: nextAmountPaid,
        balance: nextBalance,
        status: nextStatus,
      })
      .eq('id', debt.id);

    throwIfError(updateDebtError);

    if (debt.sale_id) {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('amount_paid, total_amount')
        .eq('id', debt.sale_id)
        .single();

      throwIfError(saleError);

      if (sale) {
        const saleAmountPaid = Math.max(0, Number(sale.amount_paid ?? 0) - amount);
        const saleAmountOwed = Math.max(0, Number(sale.total_amount ?? 0) - saleAmountPaid);
        const paymentStatus = saleAmountOwed <= 0 ? 'paid' : saleAmountPaid > 0 ? 'partial' : 'credit';

        const { error: updateSaleError } = await supabase
          .from('sales')
          .update({
            amount_paid: saleAmountPaid,
            amount_owed: saleAmountOwed,
            payment_status: paymentStatus,
          })
          .eq('id', debt.sale_id);

        throwIfError(updateSaleError);
      }
    }
  }
}

export async function deleteSaleRecord(saleId: string) {
  const { data: sale, error } = await supabase
    .from('sales')
    .select('id, branch_id, sale_number')
    .eq('id', saleId)
    .single();

  throwIfError(error);
  if (!sale) return;

  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('product_id, quantity, product:products(is_service)')
    .eq('sale_id', sale.id);

  throwIfError(itemsError);

  for (const item of items ?? []) {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    if (product?.is_service) continue;
    await adjustInventory(item.product_id, sale.branch_id, Number(item.quantity));
  }

  const { error: debtError } = await supabase
    .from('customer_debts')
    .delete()
    .eq('sale_id', sale.id);

  throwIfError(debtError);

  const { error: movementError } = await supabase
    .from('stock_movements')
    .delete()
    .eq('branch_id', sale.branch_id)
    .eq('reference', sale.sale_number);

  throwIfError(movementError);

  const { error: deleteError } = await supabase.from('sales').delete().eq('id', sale.id);
  throwIfError(deleteError);
}

export async function deletePurchaseRecord(purchaseId: string) {
  const { data: purchase, error } = await supabase
    .from('purchases')
    .select('id, branch_id, purchase_number')
    .eq('id', purchaseId)
    .single();

  throwIfError(error);
  if (!purchase) return;

  const { data: items, error: itemsError } = await supabase
    .from('purchase_items')
    .select('product_id, quantity')
    .eq('purchase_id', purchase.id);

  throwIfError(itemsError);

  for (const item of items ?? []) {
    await adjustInventory(item.product_id, purchase.branch_id, -Number(item.quantity));
  }

  const { error: debtError } = await supabase
    .from('supplier_debts')
    .delete()
    .eq('purchase_id', purchase.id);

  throwIfError(debtError);

  const { error: movementError } = await supabase
    .from('stock_movements')
    .delete()
    .eq('branch_id', purchase.branch_id)
    .eq('reference', purchase.purchase_number);

  throwIfError(movementError);

  const { error: deleteError } = await supabase.from('purchases').delete().eq('id', purchase.id);
  throwIfError(deleteError);
}
