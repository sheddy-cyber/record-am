import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useBusinessStore } from '@/store/businessStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { roundAmount } from '@/store/purchaseStore';
import { sendImmediateNotification } from './notifications';
import Toast from 'react-native-toast-message';

const MISMATCH_STORAGE_KEY = 'record-am:mismatches:v1';

export type MismatchType =
  | 'stock_to_purchase_declined'
  | 'stock_to_purchase_mismatch'
  | 'purchase_to_stock_declined'
  | 'purchase_to_stock_mismatch';

export interface Mismatch {
  id: string;
  type: MismatchType;
  productId: string;
  productName: string;
  branchId: string;
  businessId: string;
  quantity: number;
  unitCost: number;
  targetQuantity?: number;
  targetUnitCost?: number;
  purchaseId?: string;
  timestamp: string;
}

export async function getMismatches(): Promise<Mismatch[]> {
  try {
    const raw = await AsyncStorage.getItem(MISMATCH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('[mismatchService] getMismatches failed:', err);
    return [];
  }
}

export async function saveMismatches(mismatches: Mismatch[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MISMATCH_STORAGE_KEY, JSON.stringify(mismatches));
  } catch (err) {
    console.error('[mismatchService] saveMismatches failed:', err);
  }
}

export async function addMismatch(mismatch: Omit<Mismatch, 'id' | 'timestamp'>): Promise<void> {
  const list = await getMismatches();
  
  // Prevent duplicate mismatches for the same product + type
  const exists = list.some(
    (item) =>
      item.productId === mismatch.productId &&
      item.type === mismatch.type &&
      item.purchaseId === mismatch.purchaseId
  );
  if (exists) return;

  const newMismatch: Mismatch = {
    ...mismatch,
    id: `mismatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  list.push(newMismatch);
  await saveMismatches(list);

  // Send mismatch notification immediately
  let title = 'Sync Mismatch Alert';
  let body = '';
  
  if (mismatch.type === 'stock_to_purchase_declined') {
    body = `Stock for ${mismatch.productName} was added, but no corresponding purchase was recorded.`;
  } else if (mismatch.type === 'stock_to_purchase_mismatch') {
    body = `Purchase recorded for ${mismatch.productName} doesn't match the stock addition (${mismatch.targetQuantity} vs ${mismatch.quantity}).`;
  } else if (mismatch.type === 'purchase_to_stock_declined') {
    body = `Purchase of ${mismatch.productName} was recorded, but no stock was added.`;
  } else if (mismatch.type === 'purchase_to_stock_mismatch') {
    body = `Stock update for ${mismatch.productName} doesn't match the purchase (${mismatch.targetQuantity} vs ${mismatch.quantity}).`;
  }

  await sendImmediateNotification(title, body, {
    type: 'sync_mismatch',
    mismatchId: newMismatch.id,
  });
}

export async function removeMismatch(id: string): Promise<void> {
  const list = await getMismatches();
  const filtered = list.filter((item) => item.id !== id);
  await saveMismatches(filtered);
}

export async function reconcileStockToMatchPurchase(mismatch: Mismatch): Promise<boolean> {
  try {
    const targetQty = mismatch.targetQuantity ?? mismatch.quantity;
    const targetCost = mismatch.targetUnitCost ?? mismatch.unitCost;

    // 1. Get current stock
    const { data: invData, error: invFetchError } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', mismatch.productId)
      .eq('branch_id', mismatch.branchId)
      .maybeSingle();

    if (invFetchError) throw invFetchError;

    const currentQty = invData?.quantity ?? 0;
    const quantityDelta = roundAmount(targetQty - currentQty);

    // 2. Update inventory table
    const { error: invError } = await supabase
      .from('inventory')
      .upsert(
        {
          product_id: mismatch.productId,
          branch_id: mismatch.branchId,
          quantity: targetQty,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'product_id,branch_id' }
      );

    if (invError) throw invError;

    // 3. Update cost price on product if applicable
    if (targetCost > 0) {
      await supabase
        .from('products')
        .update({ cost_price: targetCost, updated_at: new Date().toISOString() })
        .eq('id', mismatch.productId);
    }

    // 4. Record stock movement
    if (quantityDelta !== 0) {
      const movementType = quantityDelta > 0 ? 'stock_in' : 'stock_out';
      await supabase.from('stock_movements').insert({
        business_id: mismatch.businessId,
        branch_id: mismatch.branchId,
        product_id: mismatch.productId,
        type: movementType,
        quantity: Math.abs(quantityDelta),
        unit_cost: targetCost > 0 ? targetCost : undefined,
        total_cost: targetCost > 0 ? roundAmount(targetCost * Math.abs(quantityDelta)) : undefined,
        notes: `Reconciled mismatch with purchase. Stock adjusted from ${currentQty} to ${targetQty}.`,
      });
    }

    // 5. Reload products in store
    await useBusinessStore.getState().fetchProducts(mismatch.businessId);

    // 6. Remove mismatch
    await removeMismatch(mismatch.id);
    return true;
  } catch (err) {
    console.error('[mismatchService] reconcileStockToMatchPurchase failed:', err);
    return false;
  }
}

export async function reconcilePurchaseToMatchStock(mismatch: Mismatch): Promise<boolean> {
  try {
    const targetQty = mismatch.targetQuantity ?? mismatch.quantity;
    const targetCost = mismatch.targetUnitCost ?? mismatch.unitCost;

    if (!mismatch.purchaseId) {
      // If no purchase exists, we can create one!
      // In a "stock_to_purchase_declined" mismatch, no purchase exists.
      // We record a purchase with default supplier name "Direct Inventory Sync"
      const { data: generatedNumber, error: numberError } = await supabase.rpc('generate_purchase_number', {
        p_business_id: mismatch.businessId,
      });
      if (numberError) throw numberError;

      const subtotal = roundAmount(targetQty * targetCost);

      const { data: insertedPurchase, error: insertPurchaseError } = await supabase
        .from('purchases')
        .insert({
          business_id: mismatch.businessId,
          branch_id: mismatch.branchId,
          supplier_id: null,
          purchase_number: generatedNumber ?? `PUR-${Date.now()}`,
          total_amount: subtotal,
          discount_amount: 0,
          amount_paid: subtotal,
          amount_owed: 0,
          payment_status: 'paid',
          notes: `Automatically recorded to reconcile stock addition of ${mismatch.productName}.`,
          purchase_date: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single();

      if (insertPurchaseError) throw insertPurchaseError;

      const purchaseId = insertedPurchase.id;

      await supabase.from('purchase_items').insert({
        purchase_id: purchaseId,
        product_id: mismatch.productId,
        quantity: targetQty,
        unit_cost: targetCost,
        total_cost: subtotal,
      });

      // Reload purchases in store
      await usePurchaseStore.getState().fetchPurchases(mismatch.businessId, mismatch.branchId);
      await removeMismatch(mismatch.id);
      return true;
    }

    // If purchase already exists, update the specific item
    const purchaseId = mismatch.purchaseId;
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*, items:purchase_items(*)')
      .eq('id', purchaseId)
      .single();

    if (purchaseError) throw purchaseError;

    // Update item quantity
    const updatedItems = (purchase.items || []).map((item: any) => {
      if (item.product_id === mismatch.productId) {
        return {
          ...item,
          quantity: targetQty,
          unit_cost: targetCost,
          total_cost: roundAmount(targetQty * targetCost),
        };
      }
      return item;
    });

    // If item doesn't exist in purchase, add it
    const hasItem = (purchase.items || []).some((item: any) => item.product_id === mismatch.productId);
    if (!hasItem) {
      updatedItems.push({
        purchase_id: purchaseId,
        product_id: mismatch.productId,
        quantity: targetQty,
        unit_cost: targetCost,
        total_cost: roundAmount(targetQty * targetCost),
      });
    }

    // Delete existing purchase items
    await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);

    // Re-insert updated items
    const { error: insertItemsError } = await supabase.from('purchase_items').insert(
      updatedItems.map((item: any) => ({
        purchase_id: purchaseId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
      }))
    );

    if (insertItemsError) throw insertItemsError;

    // Calculate new totals
    const subtotal = updatedItems.reduce((acc: number, item: any) => acc + item.total_cost, 0);
    const discount = purchase.discount_amount || 0;
    const totalAmount = roundAmount(subtotal - discount);
    const amountPaid = purchase.amount_paid || 0;
    const amountOwed = roundAmount(totalAmount - amountPaid);
    const paymentStatus = amountOwed <= 0 ? 'paid' : amountPaid <= 0 ? 'credit' : 'partial';

    // Update purchase table
    const { error: updatePurchaseError } = await supabase
      .from('purchases')
      .update({
        total_amount: totalAmount,
        amount_owed: amountOwed,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchaseId);

    if (updatePurchaseError) throw updatePurchaseError;

    // Sync supplier debt if exists
    const { data: debt } = await supabase
      .from('supplier_debts')
      .select('id')
      .eq('purchase_id', purchaseId)
      .maybeSingle();

    if (debt) {
      if (amountOwed <= 0) {
        await supabase
          .from('supplier_debts')
          .update({
            original_amount: totalAmount,
            balance: 0,
            status: 'settled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', debt.id);
      } else {
        await supabase
          .from('supplier_debts')
          .update({
            original_amount: totalAmount,
            balance: amountOwed,
            status: 'outstanding',
            updated_at: new Date().toISOString(),
          })
          .eq('id', debt.id);
      }
    }

    // Reload purchases in store
    await usePurchaseStore.getState().fetchPurchases(mismatch.businessId, mismatch.branchId);

    // Remove mismatch
    await removeMismatch(mismatch.id);
    return true;
  } catch (err) {
    console.error('[mismatchService] reconcilePurchaseToMatchStock failed:', err);
    return false;
  }
}
