import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Supplier, Purchase, SupplierDebt } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';

export interface SupplierWithStats extends Supplier {
  total_purchased: number;
  total_orders: number;
  outstanding_debt: number;
  last_order?: string;
}

interface SupplierState {
  suppliers: SupplierWithStats[];
  selectedSupplier: SupplierWithStats | null;
  supplierPurchases: Purchase[];
  supplierDebts: SupplierDebt[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchSuppliers: (businessId: string) => Promise<void>;
  fetchSupplierDetail: (supplierId: string, businessId: string) => Promise<void>;
  createSupplier: (data: Partial<Supplier>) => Promise<Supplier | null>;
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  setSelectedSupplier: (supplier: SupplierWithStats | null) => void;
}

export const useSupplierStore = create<SupplierState>((set) => ({
  suppliers: [],
  selectedSupplier: null,
  supplierPurchases: [],
  supplierDebts: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchSuppliers: async (businessId) => {
    set({ isLoading: true, error: null });
    try {
      const { data: suppliers, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const suppliersWithStats: SupplierWithStats[] = await Promise.all(
        (suppliers ?? []).map(async (s) => {
          const { data: purchases } = await supabase
            .from('purchases')
            .select('total_amount, created_at')
            .eq('supplier_id', s.id)
            .order('created_at', { ascending: false });

          const { data: debts } = await supabase
            .from('supplier_debts')
            .select('balance')
            .eq('supplier_id', s.id)
            .neq('status', 'settled');

          return {
            ...s,
            total_purchased: purchases?.reduce((sum, p) => sum + p.total_amount, 0) ?? 0,
            total_orders: purchases?.length ?? 0,
            outstanding_debt: debts?.reduce((sum, d) => sum + d.balance, 0) ?? 0,
            last_order: purchases?.[0]?.created_at,
          };
        })
      );

      set({ suppliers: suppliersWithStats });
      await upsertCachedRows({ businessId }, 'suppliers', suppliersWithStats);
    } catch (err: any) {
      const cachedSuppliers = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers');
      if (cachedSuppliers.length > 0) {
        set({ suppliers: cachedSuppliers, error: null });
      } else {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSupplierDetail: async (supplierId, businessId) => {
    set({ isLoading: true });
    try {
      const { data: purchases } = await supabase
        .from('purchases')
        .select('*, items:purchase_items(*, product:products(name, unit))')
        .eq('supplier_id', supplierId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: debts } = await supabase
        .from('supplier_debts')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });

      set({
        supplierPurchases: (purchases as Purchase[]) ?? [],
        supplierDebts: (debts as SupplierDebt[]) ?? [],
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  createSupplier: async (data) => {
    set({ isSaving: true, error: null });
    try {
      if (!data.business_id || !data.name) {
        throw new Error('Supplier business and name are required.');
      }

      const timestamp = nowIso();
      const supplier: Supplier = {
        id: data.id ?? createLocalId(),
        business_id: data.business_id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        notes: data.notes,
        is_active: data.is_active ?? true,
        created_at: data.created_at ?? timestamp,
        updated_at: timestamp,
      };

      const withStats: SupplierWithStats = {
        ...supplier,
        total_purchased: 0,
        total_orders: 0,
        outstanding_debt: 0,
      };

      set((state) => ({ suppliers: [withStats, ...state.suppliers] }));
      await Promise.all([
        upsertCachedRows({ businessId: supplier.business_id }, 'suppliers', [withStats]),
        enqueueMutations([
          {
            operation: 'upsert',
            table: 'suppliers',
            payload: supplier,
            onConflict: 'id',
            description: `Sync supplier ${supplier.name}`,
          },
        ]),
      ]);
      return supplier;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updateSupplier: async (id, data) => {
    set({ isSaving: true });
    try {
      const { error } = await supabase
        .from('suppliers')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        suppliers: state.suppliers.map((s) =>
          s.id === id ? { ...s, ...data } : s
        ),
        selectedSupplier: state.selectedSupplier?.id === id
          ? { ...state.selectedSupplier, ...data }
          : state.selectedSupplier,
      }));
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteSupplier: async (id) => {
    try {
      await supabase
        .from('suppliers')
        .update({ is_active: false })
        .eq('id', id);

      set((state) => ({
        suppliers: state.suppliers.filter((s) => s.id !== id),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
}));
