import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Customer, Sale, CustomerDebt, SaleItem, PaymentStatus } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';
import { fetchAllPages, hasArrayChanged, reconcileList } from '@/lib/storeUtils';
import { attachProductSummaries, maskSaleItemCosts, saleItemsTable } from '@/lib/dataAccess';

export interface CustomerWithStats extends Customer {
  total_spent: number;
  total_transactions: number;
  outstanding_debt: number;
  last_purchase?: string;
}

interface CustomerState {
  customers: CustomerWithStats[];
  selectedCustomer: CustomerWithStats | null;
  customerSales: Sale[];
  customerDebts: CustomerDebt[];
  /** The customer that customerSales and customerDebts belong to. */
  customerDetailId: string | null;
  /** True only while a customer is opened for the first time and nothing is known yet. */
  isDetailLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchCustomers: (businessId: string) => Promise<void>;
  hydrateCache: (businessId: string) => Promise<void>;
  fetchCustomerDetail: (customerId: string, businessId: string) => Promise<void>;
  createCustomer: (data: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  removeDebt: (params: {
    debtId: string;
    saleId?: string;
    customerId?: string;
    customerName?: string;
    balance: number;
    businessId?: string;
  }) => Promise<void>;
  setSelectedCustomer: (customer: CustomerWithStats | null) => void;
  reset: () => void;
}

const customerRequests = new Map<string, Promise<void>>();
const detailRequests = new Map<string, Promise<void>>();
/** Last sales and debts seen per customer, so reopening a customer is instant. */
const customerDetailCache = new Map<string, { sales: Sale[]; debts: CustomerDebt[] }>();

type SaleStat = { customer_id: string; total_amount: number; created_at: string };
type DebtStat = { customer_id: string; balance: number };

async function loadCustomers(businessId: string): Promise<void> {
  const get = useCustomerStore.getState;
  const set = useCustomerStore.setState;

  if (get().customers.length === 0) {
    try {
      const cached = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
      if (cached.length > 0 && get().customers.length === 0) set({ customers: cached });
    } catch {}
  }
  if (get().customers.length === 0) set({ isLoading: true });
  if (get().error) set({ error: null });

  try {
    // Three queries for the whole business instead of two per customer.
    const [customerResult, sales, debts] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name'),
      fetchAllPages<SaleStat>((from, to) =>
        supabase
          .from('sales')
          .select('customer_id, total_amount, created_at')
          .eq('business_id', businessId)
          .not('customer_id', 'is', null)
          .order('id')
          .range(from, to),
      ),
      fetchAllPages<DebtStat>((from, to) =>
        supabase
          .from('customer_debts')
          .select('customer_id, balance')
          .eq('business_id', businessId)
          .not('customer_id', 'is', null)
          .neq('status', 'settled')
          .order('id')
          .range(from, to),
      ),
    ]);
    if (customerResult.error) throw customerResult.error;

    const spent = new Map<string, { total: number; count: number; last?: string; lastTime: number }>();
    for (const sale of sales) {
      const entry = spent.get(sale.customer_id) ?? { total: 0, count: 0, lastTime: -Infinity };
      entry.total += Number(sale.total_amount) || 0;
      entry.count += 1;
      const time = Date.parse(sale.created_at);
      if (time > entry.lastTime) {
        entry.lastTime = time;
        entry.last = sale.created_at;
      }
      spent.set(sale.customer_id, entry);
    }
    const owed = new Map<string, number>();
    for (const debt of debts) {
      owed.set(debt.customer_id, (owed.get(debt.customer_id) ?? 0) + (Number(debt.balance) || 0));
    }

    const customersWithStats: CustomerWithStats[] = (customerResult.data ?? []).map((c) => {
      const stats = spent.get(c.id);
      return {
        ...c,
        total_spent: stats?.total ?? 0,
        total_transactions: stats?.count ?? 0,
        outstanding_debt: owed.get(c.id) ?? 0,
        last_purchase: stats?.last,
      };
    });

    if (hasArrayChanged(get().customers, customersWithStats)) {
      set({ customers: reconcileList(get().customers, customersWithStats) });
    }
    await upsertCachedRows({ businessId }, 'customers', customersWithStats);
  } catch (err: any) {
    const cachedCustomers = await readCachedRows<CustomerWithStats>({ businessId }, 'customers').catch(
      () => [] as CustomerWithStats[],
    );
    if (cachedCustomers.length > 0) {
      if (hasArrayChanged(get().customers, cachedCustomers)) {
        set({ customers: reconcileList(get().customers, cachedCustomers) });
      }
    } else {
      set({ error: err?.message ?? 'Unable to load customers.' });
    }
  } finally {
    if (get().isLoading) set({ isLoading: false });
  }
}

const markForgiven = (sales: Sale[], debts: CustomerDebt[], withItems: (sale: Sale) => Sale['items']) => {
  const activeDebtSaleIds = new Set(
    debts.filter((d) => d.status !== 'settled').map((d) => d.sale_id).filter(Boolean),
  );
  return sales.map((sale) => {
    const isForgiven =
      sale.payment_status === 'forgiven' ||
      sale.notes?.includes('[Debt Forgiven]') ||
      sale.notes?.includes('[record-am-forgiven]') ||
      (sale.amount_owed > 0 && !activeDebtSaleIds.has(sale.id));

    return {
      ...sale,
      amount_owed: isForgiven ? 0 : sale.amount_owed,
      payment_status: isForgiven ? ('forgiven' as PaymentStatus) : sale.payment_status,
      notes: isForgiven && !sale.notes?.includes('[Debt Forgiven]') && !sale.notes?.includes('[record-am-forgiven]')
        ? (sale.notes ? `${sale.notes} [Debt Forgiven]` : '[Debt Forgiven]')
        : sale.notes,
      items: withItems(sale),
    };
  });
};

/** Shows a customer's records if that customer is still open, keeping unchanged rows. */
function showCustomerDetail(customerId: string, sales: Sale[], debts: CustomerDebt[]) {
  const state = useCustomerStore.getState();
  if (state.customerDetailId !== customerId) {
    customerDetailCache.set(customerId, { sales, debts });
    return;
  }
  const nextSales = reconcileList(state.customerSales, sales);
  const nextDebts = reconcileList(state.customerDebts, debts);
  customerDetailCache.set(customerId, { sales: nextSales, debts: nextDebts });
  if (nextSales !== state.customerSales || nextDebts !== state.customerDebts || state.isDetailLoading) {
    useCustomerStore.setState({ customerSales: nextSales, customerDebts: nextDebts, isDetailLoading: false });
  }
}

async function loadCustomerDetail(customerId: string, businessId: string): Promise<void> {
  try {
    const [salesResult, debtsResult] = await Promise.all([
      supabase
        .from('sales')
        .select(`*, items:${saleItemsTable()}(*)`)
        .eq('customer_id', customerId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('customer_debts')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
    ]);
    if (salesResult.error) throw salesResult.error;
    if (debtsResult.error) throw debtsResult.error;

    const newDebts = (debtsResult.data as CustomerDebt[]) ?? [];
    const newSales = markForgiven((salesResult.data as Sale[]) ?? [], newDebts, (sale) =>
      attachProductSummaries(maskSaleItemCosts(sale.items ?? [])),
    );
    showCustomerDetail(customerId, newSales, newDebts);
  } catch (err: any) {
    // Offline or failed: use what this device already has.
    try {
      const [cachedSales, cachedDebts, cachedSaleItems] = await Promise.all([
        readCachedRows<Sale>({ businessId }, 'sales'),
        readCachedRows<CustomerDebt>({ businessId }, 'customer_debts'),
        readCachedRows<SaleItem>({ businessId }, 'sale_items').catch(() => [] as SaleItem[]),
      ]);
      const newDebts = cachedDebts.filter((d) => d.customer_id === customerId);
      const newSales = markForgiven(
        cachedSales.filter((s) => s.customer_id === customerId).slice(0, 20),
        newDebts,
        (sale) =>
          maskSaleItemCosts(
            attachProductSummaries(
              sale.items && sale.items.length > 0 ? sale.items : cachedSaleItems.filter((i) => i.sale_id === sale.id),
            ),
          ),
      );
      showCustomerDetail(customerId, newSales, newDebts);
    } catch {
      useCustomerStore.setState({ error: err?.message ?? 'Unable to load this customer.' });
    }
  } finally {
    const state = useCustomerStore.getState();
    if (state.customerDetailId === customerId && state.isDetailLoading) {
      useCustomerStore.setState({ isDetailLoading: false });
    }
  }
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  customerSales: [],
  customerDebts: [],
  customerDetailId: null,
  isDetailLoading: false,
  isLoading: false,
  isSaving: false,
  error: null,

  hydrateCache: async (businessId) => {
    try {
      const cachedCustomers = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
      if (cachedCustomers.length > 0) {
        if (hasArrayChanged(get().customers, cachedCustomers)) {
          set({ customers: reconcileList(get().customers, cachedCustomers) });
        }
      }
    } catch {}
  },

  fetchCustomers: (businessId) => {
    // The boot sequence, the list screen, realtime events and debt changes
    // often ask at once; they share one request.
    const existing = customerRequests.get(businessId);
    if (existing) return existing;
    const request = loadCustomers(businessId).finally(() => customerRequests.delete(businessId));
    customerRequests.set(businessId, request);
    return request;
  },

  fetchCustomerDetail: (customerId, businessId) => {
    if (get().customerDetailId !== customerId) {
      // Switch to this customer straight away: what we last saw for them, or
      // nothing (the screen shows placeholders), never the previous customer.
      const remembered = customerDetailCache.get(customerId);
      set({
        customerDetailId: customerId,
        customerSales: remembered?.sales ?? [],
        customerDebts: remembered?.debts ?? [],
        isDetailLoading: !remembered,
      });
    }
    const key = `${businessId}:${customerId}`;
    const existing = detailRequests.get(key);
    if (existing) return existing;
    const request = loadCustomerDetail(customerId, businessId).finally(() => detailRequests.delete(key));
    detailRequests.set(key, request);
    return request;
  },

  createCustomer: async (data) => {
    set({ isSaving: true, error: null });
    try {
      if (!data.business_id || !data.name) {
        throw new Error('Customer business and name are required.');
      }

      const timestamp = nowIso();
      const customer: Customer = {
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

      const withStats: CustomerWithStats = {
        ...customer,
        total_spent: 0,
        total_transactions: 0,
        outstanding_debt: 0,
      };

      set((state) => ({ customers: [withStats, ...state.customers] }));
      await Promise.all([
        upsertCachedRows({ businessId: customer.business_id }, 'customers', [withStats]),
        enqueueMutations([
          {
            operation: 'upsert',
            table: 'customers',
            payload: customer,
            onConflict: 'id',
            description: `Sync customer ${customer.name}`,
          },
        ]),
      ]);
      return customer;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updateCustomer: async (id, data) => {
    set({ isSaving: true, error: null });
    try {
      const timestamp = nowIso();
      const patch = { ...data, updated_at: timestamp };

      const targetCustomer = get().customers.find((c) => c.id === id);
      const businessId = targetCustomer?.business_id;

      set((state) => ({
        customers: state.customers.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        ),
        selectedCustomer: state.selectedCustomer?.id === id
          ? { ...state.selectedCustomer, ...patch }
          : state.selectedCustomer,
      }));

      if (businessId) {
        const cached = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
        const updated = cached.map((c) => (c.id === id ? { ...c, ...patch } : c));
        await upsertCachedRows({ businessId }, 'customers', updated);
      }

      await enqueueMutations([
        {
          operation: 'update',
          table: 'customers',
          payload: patch,
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: `Sync customer update`,
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteCustomer: async (id) => {
    set({ error: null });
    try {
      const timestamp = nowIso();
      const targetCustomer = get().customers.find((c) => c.id === id);
      const businessId = targetCustomer?.business_id;

      set((state) => ({
        customers: state.customers.filter((c) => c.id !== id),
        selectedCustomer: state.selectedCustomer?.id === id ? null : state.selectedCustomer,
      }));

      if (businessId) {
        const cached = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
        const updated = cached.filter((c) => c.id !== id);
        await upsertCachedRows({ businessId }, 'customers', updated);
      }

      await enqueueMutations([
        {
          operation: 'update',
          table: 'customers',
          payload: { is_active: false, updated_at: timestamp },
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: `Sync customer deletion`,
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  removeDebt: async ({
    debtId,
    saleId,
    customerId,
    customerName,
    balance,
    businessId,
  }) => {
    set((state) => {
      const nextCustomerDebts = state.customerDebts.filter(
        (d) => d.id !== debtId && d.sale_id !== debtId,
      );

      const nextCustomerSales = state.customerSales.map((s) => {
        if (saleId && s.id === saleId) {
          return {
            ...s,
            amount_owed: 0,
            payment_status: 'forgiven' as PaymentStatus,
            notes: s.notes ? `${s.notes} [Debt Forgiven]` : '[Debt Forgiven]',
          };
        }
        return s;
      });

      const nextCustomers = state.customers.map((c) => {
        const isMatch =
          (customerId && c.id === customerId) ||
          (customerName && c.name.trim().toLowerCase() === customerName.trim().toLowerCase());
        if (!isMatch) return c;
        const newDebt = Math.max(0, Number((c.outstanding_debt - balance).toFixed(2)));
        return {
          ...c,
          outstanding_debt: newDebt,
        };
      });

      let nextSelected = state.selectedCustomer;
      if (nextSelected) {
        const isMatch =
          (customerId && nextSelected.id === customerId) ||
          (customerName && nextSelected.name.trim().toLowerCase() === customerName.trim().toLowerCase());
        if (isMatch) {
          nextSelected = {
            ...nextSelected,
            outstanding_debt: Math.max(0, Number((nextSelected.outstanding_debt - balance).toFixed(2))),
          };
        }
      }

      if (state.customerDetailId) {
        customerDetailCache.set(state.customerDetailId, { sales: nextCustomerSales, debts: nextCustomerDebts });
      }

      return {
        customerDebts: nextCustomerDebts,
        customerSales: nextCustomerSales,
        customers: nextCustomers,
        selectedCustomer: nextSelected,
      };
    });

    if (businessId) {
      try {
        const cached = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
        const updated = cached.map((c) => {
          const isMatch =
            (customerId && c.id === customerId) ||
            (customerName && c.name.trim().toLowerCase() === customerName.trim().toLowerCase());
          if (!isMatch) return c;
          const newDebt = Math.max(0, Number((c.outstanding_debt - balance).toFixed(2)));
          return {
            ...c,
            outstanding_debt: newDebt,
          };
        });
        await upsertCachedRows({ businessId }, 'customers', updated);
      } catch (_) {}

      void get().fetchCustomers(businessId);
    }
  },

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),

  reset: () => {
    customerDetailCache.clear();
    set({
      customers: [],
      selectedCustomer: null,
      customerSales: [],
      customerDebts: [],
      customerDetailId: null,
      isDetailLoading: false,
      isLoading: false,
      isSaving: false,
      error: null,
    });
  },
}));
