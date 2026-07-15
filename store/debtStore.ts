import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { CustomerDebt } from '@/types';
import { cacheCustomerDebts, readCachedCustomerDebts } from '@/lib/offlineStore';

interface DebtState {
  debts: CustomerDebt[];
  isLoading: boolean;
  error: string | null;

  hydrateCache: (businessId: string, branchId: string) => Promise<void>;
  fetchDebts: (businessId: string, branchId: string) => Promise<void>;
}

export const useDebtStore = create<DebtState>((set, get) => ({
  debts: [],
  isLoading: false,
  error: null,

  hydrateCache: async (businessId, branchId) => {
    try {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeDebts = cachedDebts.filter(d => d.status !== 'settled');
      
      if (JSON.stringify(activeDebts) !== JSON.stringify(get().debts)) {
        set({ debts: activeDebts });
      }
    } catch {}
  },

  fetchDebts: async (businessId, branchId) => {
    try {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeCached = cachedDebts.filter(d => d.status !== 'settled');
      if (JSON.stringify(activeCached) !== JSON.stringify(get().debts)) {
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

      if (JSON.stringify(nextDebts) !== JSON.stringify(get().debts)) {
        set({ debts: nextDebts });
      }
      
      await cacheCustomerDebts(businessId, branchId, nextCache);
    } catch (err: any) {
      const cachedDebts = await readCachedCustomerDebts(businessId, branchId);
      const activeCached = cachedDebts.filter(d => d.status !== 'settled');
      if (activeCached.length > 0) {
        if (JSON.stringify(activeCached) !== JSON.stringify(get().debts)) {
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
}));
