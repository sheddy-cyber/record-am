import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Customer, Sale, CustomerDebt } from '@/types';

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

  fetchCustomers: async (businessId) => {
    set({ isLoading: true, error: null });
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

      set({ customers: customersWithStats });
    } catch (err: any) {
      set({ error: err.message });
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

      set({
        customerSales: (sales as Sale[]) ?? [],
        customerDebts: (debts as CustomerDebt[]) ?? [],
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  createCustomer: async (data) => {
    set({ isSaving: true, error: null });
    try {
      const { data: customer, error } = await supabase
        .from('customers')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      const withStats: CustomerWithStats = {
        ...customer,
        total_spent: 0,
        total_transactions: 0,
        outstanding_debt: 0,
      };

      set((state) => ({ customers: [withStats, ...state.customers] }));
      return customer;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updateCustomer: async (id, data) => {
    set({ isSaving: true });
    try {
      const { error } = await supabase
        .from('customers')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        customers: state.customers.map((c) =>
          c.id === id ? { ...c, ...data } : c
        ),
        selectedCustomer: state.selectedCustomer?.id === id
          ? { ...state.selectedCustomer, ...data }
          : state.selectedCustomer,
      }));
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteCustomer: async (id) => {
    try {
      await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', id);

      set((state) => ({
        customers: state.customers.filter((c) => c.id !== id),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
}));
