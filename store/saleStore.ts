import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

interface SaleState {
  pinnedProductIds: string[];
  soldProductQuantities: Record<string, number>;
  hasLoadedPinned: boolean;
  hasLoadedSold: boolean;

  loadPinnedProductIds: (businessId: string) => Promise<void>;
  togglePinnedProduct: (businessId: string, productId: string) => Promise<void>;
  loadSoldProductQuantities: (businessId: string, branchId: string) => Promise<void>;
}

export const useSaleStore = create<SaleState>((set, get) => ({
  pinnedProductIds: [],
  soldProductQuantities: {},
  hasLoadedPinned: false,
  hasLoadedSold: false,

  loadPinnedProductIds: async (businessId: string) => {
    if (get().hasLoadedPinned) return;
    try {
      const stored = await AsyncStorage.getItem(`pinned_products_${businessId}`);
      if (stored) {
        set({ pinnedProductIds: JSON.parse(stored) as string[], hasLoadedPinned: true });
      } else {
        set({ pinnedProductIds: [], hasLoadedPinned: true });
      }
    } catch {
      set({ pinnedProductIds: [], hasLoadedPinned: true });
    }
  },

  togglePinnedProduct: async (businessId: string, productId: string) => {
    const current = get().pinnedProductIds;
    let updated;
    if (current.includes(productId)) {
      updated = current.filter((id) => id !== productId);
    } else {
      updated = [...current, productId];
    }
    set({ pinnedProductIds: updated });
    try {
      await AsyncStorage.setItem(`pinned_products_${businessId}`, JSON.stringify(updated));
    } catch {}
  },

  loadSoldProductQuantities: async (businessId: string, branchId: string) => {
    if (get().hasLoadedSold) return;
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity,
          sale:sales!inner(business_id, branch_id)
        `)
        .eq('sale.business_id', businessId)
        .eq('sale.branch_id', branchId);

      if (error) throw error;

      const totals = ((data as Array<{ product_id: string; quantity: number }> | null) ?? []).reduce(
        (accumulator, item) => {
          const pId = item.product_id;
          if (!pId) return accumulator;
          accumulator[pId] = (accumulator[pId] ?? 0) + Number(item.quantity ?? 0);
          return accumulator;
        },
        {} as Record<string, number>
      );

      set({ soldProductQuantities: totals, hasLoadedSold: true });
    } catch {
      set({ soldProductQuantities: {}, hasLoadedSold: true });
    }
  },
}));
