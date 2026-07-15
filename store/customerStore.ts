import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Customer, Sale, CustomerDebt } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';

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
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchCustomers: (businessId: string) => Promise<void>;
  hydrateCache: (businessId: string) => Promise<void>;
  fetchCustomerDetail: (customerId: string, businessId: string) => Promise<void>;
  createCustomer: (data: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  setSelectedCustomer: (customer: CustomerWithStats | null) => void;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  customerSales: [],
  customerDebts: [],
  isLoading: false,
  isSaving: false,
  error: null,

  hydrateCache: async (businessId) => {
    try {
      const cachedCustomers = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
      if (cachedCustomers.length > 0) {
        if (JSON.stringify(cachedCustomers) !== JSON.stringify(get().customers)) {
          set({ customers: cachedCustomers });
        }
      }
    } catch {}
  },

  fetchCustomers: async (businessId) => {
    try {
      const cachedCustomers = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
      if (cachedCustomers.length > 0) {
        if (JSON.stringify(cachedCustomers) !== JSON.stringify(get().customers)) {
          set({ customers: cachedCustomers });
        }
      }
    } catch {}

    const currentCustomers = get().customers;
    if (currentCustomers.length === 0) set({ isLoading: true });
    set({ error: null });

    try {
      // Fetch customers
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      // For each customer, fetch aggregated stats
      const customersWithStats: CustomerWithStats[] = await Promise.all(
        (customers ?? []).map(async (c) => {
          const { data: sales } = await supabase
            .from('sales')
            .select('total_amount, created_at')
            .eq('customer_id', c.id)
            .order('created_at', { ascending: false });

          const { data: debts } = await supabase
            .from('customer_debts')
            .select('balance')
            .eq('customer_id', c.id)
            .neq('status', 'settled');

          const totalSpent = sales?.reduce((s, r) => s + r.total_amount, 0) ?? 0;
          const outstandingDebt = debts?.reduce((s, r) => s + r.balance, 0) ?? 0;

          return {
            ...c,
            total_spent: totalSpent,
            total_transactions: sales?.length ?? 0,
            outstanding_debt: outstandingDebt,
            last_purchase: sales?.[0]?.created_at,
          };
        })
      );

      if (JSON.stringify(customersWithStats) !== JSON.stringify(get().customers)) {
        set({ customers: customersWithStats });
      }
      await upsertCachedRows({ businessId }, 'customers', customersWithStats);
    } catch (err: any) {
      const cachedCustomers = await readCachedRows<CustomerWithStats>({ businessId }, 'customers');
      if (cachedCustomers.length > 0) {
        if (JSON.stringify(cachedCustomers) !== JSON.stringify(get().customers)) {
          set({ customers: cachedCustomers, error: null });
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

  fetchCustomerDetail: async (customerId, businessId) => {
    set({ isLoading: true });
    try {
      const { data: sales } = await supabase
        .from('sales')
        .select('*, items:sale_items(*, product:products(name, unit))')
        .eq('customer_id', customerId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: debts } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      const newSales = (sales as Sale[]) ?? [];
      const newDebts = (debts as CustomerDebt[]) ?? [];
      
      if (
        JSON.stringify(newSales) !== JSON.stringify(get().customerSales) ||
        JSON.stringify(newDebts) !== JSON.stringify(get().customerDebts)
      ) {
        set({ customerSales: newSales, customerDebts: newDebts });
      }
    } catch (err: any) {
      // Try loading from cache if server fails
      try {
        const [cachedSales, cachedDebts] = await Promise.all([
          readCachedRows<Sale>({ businessId }, 'sales'),
          readCachedRows<CustomerDebt>({ businessId }, 'customer_debts'),
        ]);
        const newSales = cachedSales.filter((s) => s.customer_id === customerId).slice(0, 20);
        const newDebts = cachedDebts.filter((d) => d.customer_id === customerId);

        if (
          JSON.stringify(newSales) !== JSON.stringify(get().customerSales) ||
          JSON.stringify(newDebts) !== JSON.stringify(get().customerDebts)
        ) {
          set({ customerSales: newSales, customerDebts: newDebts });
        }
      } catch {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
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

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
}));
