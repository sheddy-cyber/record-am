import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { PaymentAccount, PaymentAccountChannel } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  replaceCachedRows,
  upsertCachedRows,
} from '@/lib/offlineStore';
import { hasArrayChanged } from '@/lib/storeUtils';

interface PaymentAccountState {
  accounts: PaymentAccount[];
  isLoading: boolean;
  error: string | null;

  hydrateCache: (businessId: string) => Promise<void>;
  fetchAccounts: (businessId: string) => Promise<void>;
  createAccount: (params: {
    businessId: string;
    name: string;
    accountNumber?: string;
    channel: PaymentAccountChannel;
  }) => Promise<PaymentAccount | null>;
  updateAccount: (id: string, updates: Partial<PaymentAccount>) => Promise<boolean>;
  deleteAccount: (id: string) => Promise<boolean>;
  reset: () => void;
}

export const usePaymentAccountStore = create<PaymentAccountState>((set, get) => ({
  accounts: [],
  isLoading: false,
  error: null,

  hydrateCache: async (businessId: string) => {
    try {
      const cached = await readCachedRows<PaymentAccount>({ businessId }, 'payment_accounts');
      const active = cached.filter((acc) => acc.is_active);
      if (hasArrayChanged(get().accounts, active)) {
        set({ accounts: active });
      }
    } catch (_) {}
  },

  fetchAccounts: async (businessId: string) => {
    try {
      const cached = await readCachedRows<PaymentAccount>({ businessId }, 'payment_accounts');
      const activeCached = cached.filter((acc) => acc.is_active);
      if (hasArrayChanged(get().accounts, activeCached)) {
        set({ accounts: activeCached });
      }
    } catch (_) {}

    if (get().accounts.length === 0) set({ isLoading: true });
    set({ error: null });

    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const serverRows = (data as PaymentAccount[]) ?? [];
      const cached = await readCachedRows<PaymentAccount>({ businessId }, 'payment_accounts');
      const serverIds = new Set(serverRows.map((r) => r.id));
      const cachedMap = new Map(cached.map((r) => [r.id, r]));

      const merged = serverRows.map((serverRow) => {
        const local = cachedMap.get(serverRow.id);
        if (local && new Date(local.updated_at).getTime() > new Date(serverRow.updated_at).getTime()) {
          return local;
        }
        return serverRow;
      });

      const nextCache = [
        ...merged,
        ...cached.filter((r) => !serverIds.has(r.id)),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const activeNext = nextCache.filter((r) => r.is_active);
      if (hasArrayChanged(get().accounts, activeNext)) {
        set({ accounts: activeNext });
      }

      await replaceCachedRows({ businessId }, 'payment_accounts', nextCache);
    } catch (err: any) {
      const cached = await readCachedRows<PaymentAccount>({ businessId }, 'payment_accounts');
      const active = cached.filter((r) => r.is_active);
      if (active.length > 0) {
        if (hasArrayChanged(get().accounts, active)) {
          set({ accounts: active, error: null });
        }
      } else {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createAccount: async (params) => {
    const timestamp = nowIso();
    const id = createLocalId();
    const account: PaymentAccount = {
      id,
      business_id: params.businessId,
      name: params.name.trim(),
      account_number: params.accountNumber?.trim() || undefined,
      channel: params.channel,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };

    // Update in-memory state immediately
    const nextAccounts = [...get().accounts, account];
    set({ accounts: nextAccounts });

    // Cache locally & queue sync mutation
    try {
      await upsertCachedRows({ businessId: params.businessId }, 'payment_accounts', [account]);
      await enqueueMutations([
        {
          operation: 'upsert',
          table: 'payment_accounts',
          payload: account,
          onConflict: 'id',
          description: `Create payment account ${account.name}`,
        },
      ]);
    } catch (err) {
      console.log('[paymentAccountStore] offline queue failed:', err);
    }

    // Try direct remote sync if online
    try {
      await supabase.from('payment_accounts').upsert(account);
    } catch (_) {}

    return account;
  },

  updateAccount: async (id, updates) => {
    const timestamp = nowIso();
    const existing = get().accounts.find((a) => a.id === id);
    if (!existing) return false;

    const updated: PaymentAccount = {
      ...existing,
      ...updates,
      updated_at: timestamp,
    };

    set({
      accounts: get().accounts.map((a) => (a.id === id ? updated : a)),
    });

    try {
      await upsertCachedRows({ businessId: existing.business_id }, 'payment_accounts', [updated]);
      await enqueueMutations([
        {
          operation: 'update',
          table: 'payment_accounts',
          payload: updated,
          match: { id },
          description: `Update payment account ${updated.name}`,
        },
      ]);
      await supabase.from('payment_accounts').update(updated).eq('id', id);
      return true;
    } catch (_) {
      return true; // Succeeded locally
    }
  },

  deleteAccount: async (id) => {
    const existing = get().accounts.find((a) => a.id === id);
    if (!existing) return false;

    const softDeleted: PaymentAccount = {
      ...existing,
      is_active: false,
      updated_at: nowIso(),
    };

    set({
      accounts: get().accounts.filter((a) => a.id !== id),
    });

    try {
      await upsertCachedRows({ businessId: existing.business_id }, 'payment_accounts', [softDeleted]);
      await enqueueMutations([
        {
          operation: 'update',
          table: 'payment_accounts',
          payload: { is_active: false, updated_at: softDeleted.updated_at },
          match: { id },
          description: `Deactivate payment account ${existing.name}`,
        },
      ]);
      await supabase.from('payment_accounts').update({ is_active: false }).eq('id', id);
      return true;
    } catch (_) {
      return true; // Succeeded locally
    }
  },

  reset: () => set({ accounts: [], isLoading: false, error: null }),
}));
