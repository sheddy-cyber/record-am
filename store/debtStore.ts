import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { CustomerDebt } from '@/types';
import { cacheCustomerDebts, readCachedCustomerDebts, removeCachedRow } from '@/lib/offlineStore';
import { deleteCustomerDebtRecord } from '@/lib/recordDeletion';
import { hasArrayChanged } from '@/lib/storeUtils';

interface DebtState {
  debts: CustomerDebt[];
  isLoading: boolean;
  error: string | null;

  hydrateCache: (businessId: string, branchId: string) => Promise<void>;
  fetchDebts: (businessId: string, branchId: string) => Promise<void>;
  removeDebtBySaleId: (saleId: string, businessId: string, branchId: string) => Promise<void>;
  deleteDebt: (debtId: string, businessId: string, branchId: string) => Promise<void>;
  reset: () => void;
}

export const useDebtStore = create<DebtState>((set, get) => ({
  debts: [],
  isLoading: false,
  error: null,

  hydrateCache: async (businessId, branchId) => {
    try {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeDebts = cachedDebts.filter(d => d.status !== 'settled');
      
      if (hasArrayChanged(get().debts, activeDebts)) {
        set({ debts: activeDebts });
      }
    } catch {}
  },

  fetchDebts: async (businessId, branchId) => {
    try {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeCached = cachedDebts.filter(d => d.status !== 'settled');
      if (hasArrayChanged(get().debts, activeCached)) {
        set({ debts: activeCached });
      }
    } catch {}

    const currentDebts = get().debts;
    if (currentDebts.length === 0) set({ isLoading: true });
    set({ error: null });

    try {
      const { data, error } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .neq('status', 'settled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const serverDebts = (data as CustomerDebt[]) ?? [];
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const serverDebtIds = new Set(serverDebts.map((debt) => debt.id));
      const cachedDebtsMap = new Map(cachedDebts.map(d => [d.id, d]));
      
      const mergedDebts = serverDebts.map(serverDebt => {
        const cached = cachedDebtsMap.get(serverDebt.id);
        if (cached && new Date(cached.updated_at).getTime() > new Date(serverDebt.updated_at).getTime()) {
          return cached;
        }
        return serverDebt;
      });

      const nextCache = [
        ...mergedDebts,
        ...cachedDebts.filter((debt) => !serverDebtIds.has(debt.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const nextDebts = nextCache.filter(d => d.status !== 'settled');

      if (hasArrayChanged(get().debts, nextDebts)) {
        set({ debts: nextDebts });
      }
      
      await cacheCustomerDebts(businessId, branchId, nextCache);
    } catch (err: any) {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeCached = cachedDebts.filter(d => d.status !== 'settled');
      if (activeCached.length > 0) {
        if (hasArrayChanged(get().debts, activeCached)) {
          set({ debts: activeCached, error: null });
        } else {
          set({ error: null });
        }
      } else {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
  },


  removeDebtBySaleId: async (saleId, businessId, branchId) => {
    // Optimistically remove from in-memory state
    const next = get().debts.filter((d) => d.sale_id !== saleId);
    set({ debts: next });

    // Evict from offline cache too
    try {
      const cached = await readCachedCustomerDebts(businessId, branchId);
      const nextCache = cached.filter((d) => d.sale_id !== saleId);
      await cacheCustomerDebts(businessId, branchId, nextCache);
    } catch {}
  },

  deleteDebt: async (debtId, businessId, branchId) => {
    // Optimistically remove from in-memory state
    const next = get().debts.filter((d) => d.id !== debtId);
    set({ debts: next });

    // Evict from offline cache
    try {
      const cached = await readCachedCustomerDebts(businessId, branchId);
      const nextCache = cached.filter((d) => d.id !== debtId);
      await cacheCustomerDebts(businessId, branchId, nextCache);
      await removeCachedRow({ businessId, branchId }, 'customer_debts', debtId);
    } catch {}

    // Delete from Supabase
    await deleteCustomerDebtRecord(debtId);
  },

  reset: () =>
    set({
      debts: [],
      isLoading: false,
      error: null,
    }),
}));
