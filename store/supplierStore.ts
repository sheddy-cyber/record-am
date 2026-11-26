import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Supplier, Purchase, SupplierDebt, PurchaseItem } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';
import { fetchAllPages, hasArrayChanged, reconcileList } from '@/lib/storeUtils';

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
  /** The supplier that supplierPurchases and supplierDebts belong to. */
  supplierDetailId: string | null;
  /** True only while a supplier is opened for the first time and nothing is known yet. */
  isDetailLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchSuppliers: (businessId: string) => Promise<void>;
  hydrateCache: (businessId: string) => Promise<void>;
  fetchSupplierDetail: (supplierId: string, businessId: string) => Promise<void>;
  createSupplier: (data: Partial<Supplier>) => Promise<Supplier | null>;
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  setSelectedSupplier: (supplier: SupplierWithStats | null) => void;
  reset: () => void;
}

const supplierRequests = new Map<string, Promise<void>>();
const detailRequests = new Map<string, Promise<void>>();
/** Last purchases and debts seen per supplier, so reopening a supplier is instant. */
const supplierDetailCache = new Map<string, { purchases: Purchase[]; debts: SupplierDebt[] }>();

type PurchaseStat = { supplier_id: string; total_amount: number; created_at: string };
type DebtStat = { supplier_id: string; balance: number };

async function loadSuppliers(businessId: string): Promise<void> {
  const get = useSupplierStore.getState;
  const set = useSupplierStore.setState;

  if (get().suppliers.length === 0) {
    try {
      const cached = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers');
      if (cached.length > 0 && get().suppliers.length === 0) set({ suppliers: cached });
    } catch {}
  }
  if (get().suppliers.length === 0) set({ isLoading: true });
  if (get().error) set({ error: null });

  try {
    // Three queries for the whole business instead of two per supplier.
    const [supplierResult, purchases, debts] = await Promise.all([
      supabase
        .from('suppliers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name'),
      fetchAllPages<PurchaseStat>((from, to) =>
        supabase
          .from('purchases')
          .select('supplier_id, total_amount, created_at')
          .eq('business_id', businessId)
          .not('supplier_id', 'is', null)
          .order('id')
          .range(from, to),
      ),
      fetchAllPages<DebtStat>((from, to) =>
        supabase
          .from('supplier_debts')
          .select('supplier_id, balance')
          .eq('business_id', businessId)
          .not('supplier_id', 'is', null)
          .neq('status', 'settled')
          .order('id')
          .range(from, to),
      ),
    ]);
    if (supplierResult.error) throw supplierResult.error;

    const bought = new Map<string, { total: number; count: number; last?: string; lastTime: number }>();
    for (const purchase of purchases) {
      const entry = bought.get(purchase.supplier_id) ?? { total: 0, count: 0, lastTime: -Infinity };
      entry.total += Number(purchase.total_amount) || 0;
      entry.count += 1;
      const time = Date.parse(purchase.created_at);
      if (time > entry.lastTime) {
        entry.lastTime = time;
        entry.last = purchase.created_at;
      }
      bought.set(purchase.supplier_id, entry);
    }
    const owed = new Map<string, number>();
    for (const debt of debts) {
      owed.set(debt.supplier_id, (owed.get(debt.supplier_id) ?? 0) + (Number(debt.balance) || 0));
    }

    const suppliersWithStats: SupplierWithStats[] = (supplierResult.data ?? []).map((s) => {
      const stats = bought.get(s.id);
      return {
        ...s,
        total_purchased: stats?.total ?? 0,
        total_orders: stats?.count ?? 0,
        outstanding_debt: owed.get(s.id) ?? 0,
        last_order: stats?.last,
      };
    });

    if (hasArrayChanged(get().suppliers, suppliersWithStats)) {
      set({ suppliers: reconcileList(get().suppliers, suppliersWithStats) });
    }
    await upsertCachedRows({ businessId }, 'suppliers', suppliersWithStats);
  } catch (err: any) {
    const cachedSuppliers = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers').catch(
      () => [] as SupplierWithStats[],
    );
    if (cachedSuppliers.length > 0) {
      if (hasArrayChanged(get().suppliers, cachedSuppliers)) {
        set({ suppliers: reconcileList(get().suppliers, cachedSuppliers) });
      }
    } else {
      set({ error: err?.message ?? 'Unable to load suppliers.' });
    }
  } finally {
    if (get().isLoading) set({ isLoading: false });
  }
}

/** Shows a supplier's records if that supplier is still open, keeping unchanged rows. */
function showSupplierDetail(supplierId: string, purchases: Purchase[], debts: SupplierDebt[]) {
  const state = useSupplierStore.getState();
  if (state.supplierDetailId !== supplierId) {
    supplierDetailCache.set(supplierId, { purchases, debts });
    return;
  }
  const nextPurchases = reconcileList(state.supplierPurchases, purchases);
  const nextDebts = reconcileList(state.supplierDebts, debts);
  supplierDetailCache.set(supplierId, { purchases: nextPurchases, debts: nextDebts });
  if (nextPurchases !== state.supplierPurchases || nextDebts !== state.supplierDebts || state.isDetailLoading) {
    useSupplierStore.setState({ supplierPurchases: nextPurchases, supplierDebts: nextDebts, isDetailLoading: false });
  }
}

async function loadSupplierDetail(supplierId: string, businessId: string): Promise<void> {
  try {
    const [purchaseResult, debtResult] = await Promise.all([
      supabase
        .from('purchases')
        .select('*, items:purchase_items(*, product:products(name, unit))')
        .eq('supplier_id', supplierId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('supplier_debts')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false }),
    ]);
    if (purchaseResult.error) throw purchaseResult.error;
    if (debtResult.error) throw debtResult.error;
    showSupplierDetail(
      supplierId,
      (purchaseResult.data as Purchase[]) ?? [],
      (debtResult.data as SupplierDebt[]) ?? [],
    );
  } catch (err: any) {
    // Offline or failed: use what this device already has.
    try {
      const [cachedPurchases, cachedDebts, cachedItems] = await Promise.all([
        readCachedRows<Purchase>({ businessId }, 'purchases'),
        readCachedRows<SupplierDebt>({ businessId }, 'supplier_debts'),
        readCachedRows<PurchaseItem>({ businessId }, 'purchase_items').catch(() => [] as PurchaseItem[]),
      ]);
      const newDebts = cachedDebts.filter((d) => d.supplier_id === supplierId);
      const newPurchases = cachedPurchases
        .filter((p) => p.supplier_id === supplierId)
        .slice(0, 20)
        .map((p) => ({
          ...p,
          items: p.items && p.items.length > 0 ? p.items : cachedItems.filter((i) => i.purchase_id === p.id),
        }));
      showSupplierDetail(supplierId, newPurchases, newDebts);
    } catch {
      useSupplierStore.setState({ error: err?.message ?? 'Unable to load this supplier.' });
    }
  } finally {
    const state = useSupplierStore.getState();
    if (state.supplierDetailId === supplierId && state.isDetailLoading) {
      useSupplierStore.setState({ isDetailLoading: false });
    }
  }
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  selectedSupplier: null,
  supplierPurchases: [],
  supplierDebts: [],
  supplierDetailId: null,
  isDetailLoading: false,
  isLoading: false,
  isSaving: false,
  error: null,

  hydrateCache: async (businessId) => {
    try {
      const cachedSuppliers = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers');
      if (cachedSuppliers.length > 0) {
        if (hasArrayChanged(get().suppliers, cachedSuppliers)) {
          set({ suppliers: reconcileList(get().suppliers, cachedSuppliers) });
        }
      }
    } catch {}
  },

  fetchSuppliers: (businessId) => {
    const existing = supplierRequests.get(businessId);
    if (existing) return existing;
    const request = loadSuppliers(businessId).finally(() => supplierRequests.delete(businessId));
    supplierRequests.set(businessId, request);
    return request;
  },

  fetchSupplierDetail: (supplierId, businessId) => {
    if (get().supplierDetailId !== supplierId) {
      const remembered = supplierDetailCache.get(supplierId);
      set({
        supplierDetailId: supplierId,
        supplierPurchases: remembered?.purchases ?? [],
        supplierDebts: remembered?.debts ?? [],
        isDetailLoading: !remembered,
      });
    }
    const key = `${businessId}:${supplierId}`;
    const existing = detailRequests.get(key);
    if (existing) return existing;
    const request = loadSupplierDetail(supplierId, businessId).finally(() => detailRequests.delete(key));
    detailRequests.set(key, request);
    return request;
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
    set({ isSaving: true, error: null });
    try {
      const timestamp = nowIso();
      const patch = { ...data, updated_at: timestamp };

      const targetSupplier = get().suppliers.find((s) => s.id === id);
      const businessId = targetSupplier?.business_id;

      set((state) => ({
        suppliers: state.suppliers.map((s) =>
          s.id === id ? { ...s, ...patch } : s
        ),
        selectedSupplier: state.selectedSupplier?.id === id
          ? { ...state.selectedSupplier, ...patch }
          : state.selectedSupplier,
      }));

      if (businessId) {
        const cached = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers');
        const updated = cached.map((s) => (s.id === id ? { ...s, ...patch } : s));
        await upsertCachedRows({ businessId }, 'suppliers', updated);
      }

      await enqueueMutations([
        {
          operation: 'update',
          table: 'suppliers',
          payload: patch,
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: `Sync supplier update`,
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteSupplier: async (id) => {
    set({ error: null });
    try {
      const timestamp = nowIso();
      const targetSupplier = get().suppliers.find((s) => s.id === id);
      const businessId = targetSupplier?.business_id;

      set((state) => ({
        suppliers: state.suppliers.filter((s) => s.id !== id),
        selectedSupplier: state.selectedSupplier?.id === id ? null : state.selectedSupplier,
      }));

      if (businessId) {
        const cached = await readCachedRows<SupplierWithStats>({ businessId }, 'suppliers');
        const updated = cached.filter((s) => s.id !== id);
        await upsertCachedRows({ businessId }, 'suppliers', updated);
      }

      await enqueueMutations([
        {
          operation: 'update',
          table: 'suppliers',
          payload: { is_active: false, updated_at: timestamp },
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: `Sync supplier deletion`,
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),

  reset: () => {
    supplierDetailCache.clear();
    set({
      suppliers: [],
      selectedSupplier: null,
      supplierPurchases: [],
      supplierDebts: [],
      supplierDetailId: null,
      isDetailLoading: false,
      isLoading: false,
      isSaving: false,
      error: null,
    });
  },
}));
