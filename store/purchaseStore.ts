import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Purchase, PurchaseItem, Product } from '@/types';

export interface PurchaseCartItem {
  product: Product;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

interface PurchaseState {
  purchases: Purchase[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchPurchases: (businessId: string, branchId: string) => Promise<void>;
  recordPurchase: (params: {
    businessId: string;
    branchId: string;
    userId: string;
    supplierId?: string;
    supplierName: string;
    items: PurchaseCartItem[];
    amountPaid: number;
    notes?: string;
    purchaseDate: string;
  }) => Promise<Purchase | null>;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  purchases: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchPurchases: async (businessId, branchId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          *,
          supplier:suppliers(name, phone),
          items:purchase_items(*, product:products(name, unit))
        `)
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      set({ purchases: (data as Purchase[]) ?? [] });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  recordPurchase: async ({
    businessId, branchId, userId,
    supplierId, supplierName,
    items, amountPaid, notes, purchaseDate,
  }) => {
    set({ isSaving: true, error: null });
    try {
      const totalAmount = items.reduce((s, i) => s + i.total_cost, 0);
      const amountOwed = Math.max(0, totalAmount - amountPaid);
      const paymentStatus = amountPaid >= totalAmount ? 'paid'
        : amountPaid > 0 ? 'partial' : 'credit';

      // Generate purchase number
      const { data: purNumData } = await supabase.rpc('generate_purchase_number', {
        p_business_id: businessId,
      });

      // Create purchase record
      const { data: purchase, error: purError } = await supabase
        .from('purchases')
        .insert({
          business_id: businessId,
          branch_id: branchId,
          supplier_id: supplierId ?? null,
          purchase_number: purNumData ?? `PUR-${Date.now()}`,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          amount_owed: amountOwed,
          payment_status: paymentStatus,
          notes: notes ?? null,
          purchase_date: purchaseDate,
          recorded_by: userId,
        })
        .select()
        .single();

      if (purError) throw purError;

      // Create purchase items + update inventory
      for (const item of items) {
        await supabase.from('purchase_items').insert({
          purchase_id: purchase.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        });

        // Update inventory (stock in)
        const { data: existingInv } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('product_id', item.product.id)
          .eq('branch_id', branchId)
          .single();

        const currentQty = existingInv?.quantity ?? 0;

        await supabase.from('inventory').upsert({
          product_id: item.product.id,
          branch_id: branchId,
          quantity: currentQty + item.quantity,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'product_id,branch_id' });

        // Record stock movement
        await supabase.from('stock_movements').insert({
          business_id: businessId,
          branch_id: branchId,
          product_id: item.product.id,
          type: 'stock_in',
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          reference: purchase.purchase_number,
          notes: `Purchase from ${supplierName}`,
        });

        // Update product cost price if different
        await supabase.from('products')
          .update({ cost_price: item.unit_cost })
          .eq('id', item.product.id);
      }

      // Create supplier debt if not fully paid
      if (amountOwed > 0) {
        await supabase.from('supplier_debts').insert({
          business_id: businessId,
          supplier_id: supplierId ?? null,
          purchase_id: purchase.id,
          supplier_name: supplierName,
          original_amount: totalAmount,
          amount_paid: amountPaid,
          balance: amountOwed,
          status: paymentStatus === 'partial' ? 'partial' : 'outstanding',
        });
      }

      set((state) => ({ purchases: [purchase as Purchase, ...state.purchases] }));
      return purchase as Purchase;
    } catch (err: any) {
      console.error('[recordPurchase]', err);
      set({ error: err.message });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },
}));
