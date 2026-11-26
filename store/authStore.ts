import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useTabStore } from '@/store/tabStore';
import { flushOfflineQueue } from '@/lib/offlineStore';
import { cancelAllNotifications } from '@/lib/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useBusinessStore } from '@/store/businessStore';
import { visibleBranches } from '@/lib/dataAccess';
import { useCustomerStore } from '@/store/customerStore';
import { useSupplierStore } from '@/store/supplierStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useSaleStore } from '@/store/saleStore';
import { useDebtStore } from '@/store/debtStore';
import { useDailyBalanceStore } from '@/store/dailyBalanceStore';
import { Business, Branch, UserProfile, UserRole } from '@/types';

export function resetAllAppStores() {
  try { useNotificationStore.getState().reset(); } catch (_) {}
  try { useBusinessStore.getState().reset(); } catch (_) {}
  try { useCustomerStore.getState().reset(); } catch (_) {}
  try { useSupplierStore.getState().reset(); } catch (_) {}
  try { usePurchaseStore.getState().reset(); } catch (_) {}
  try { useDashboardStore.getState().reset(); } catch (_) {}
  try { useAnalyticsStore.getState().reset(); } catch (_) {}
  try { useSaleStore.getState().reset(); } catch (_) {}
  try { useDebtStore.getState().reset(); } catch (_) {}
  try { useDailyBalanceStore.getState().reset(); } catch (_) {}
}

const AUTH_CONTEXT_STORAGE_KEY = 'record-am:auth-context:v1';
const SELECTED_BRANCH_KEY_PREFIX = 'record-am:active-branch:v1';

const selectedBranchStorageKey = (userId: string, businessId: string) =>
  `${SELECTED_BRANCH_KEY_PREFIX}:${userId}:${businessId}`;

const readSelectedBranchId = async (userId: string, businessId: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(selectedBranchStorageKey(userId, businessId));
  } catch {
    return null;
  }
};

const saveSelectedBranchId = async (userId: string, businessId: string, branchId: string) => {
  try {
    await AsyncStorage.setItem(selectedBranchStorageKey(userId, businessId), branchId);
  } catch {
    // Preference storage failure should never block navigation.
  }
};

interface CachedAuthContext {
  user?: User | null;
  profile: UserProfile | null;
  currentBusiness: Business | null;
  currentBranch: Branch | null;
  userRole: UserRole | null;
  staffId?: string | null;
}

const readCachedAuthContext = async (): Promise<CachedAuthContext | null> => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const cacheAuthContext = async (context: CachedAuthContext) => {
  try {
    await AsyncStorage.setItem(AUTH_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Cache write failures should never block app startup.
  }
};

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  currentBusiness: Business | null;
  currentBranch: Branch | null;
  userRole: UserRole | null;
  staffId: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setCurrentBusiness: (business: Business | null) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setUserRole: (role: UserRole | null) => void;
  setStaffId: (staffId: string | null) => void;
  switchBranch: (branch: Branch) => Promise<void>;
  /** Re-reads a staff member's role and branch, e.g. after the owner moves them. */
  refreshAssignment: () => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  currentBusiness: null,
  currentBranch: null,
  userRole: null,
  staffId: null,
  isLoading: false,
  isInitialized: false,

  setSession: (session) => set((state) => {
    if (!session) {
      resetAllAppStores();
      cancelAllNotifications().catch(() => {});
      return {
        session: null,
        user: null,
        profile: null,
        currentBusiness: null,
        currentBranch: null,
        userRole: null,
        staffId: null,
      };
    }

    const changedUser = Boolean(state.user && state.user.id !== session.user.id);
    if (changedUser) {
      resetAllAppStores();
      cancelAllNotifications().catch(() => {});
    }
    return {
      session,
      user: session.user,
      ...(changedUser
        ? {
            profile: null,
            currentBusiness: null,
            currentBranch: null,
            userRole: null,
            staffId: null,
          }
        : {}),
    };
  }),
  setProfile: (profile) => {
    set({ profile });
    const state = get();
    if (state.user) {
      void cacheAuthContext({
        user: state.user,
        profile,
        currentBusiness: state.currentBusiness,
        currentBranch: state.currentBranch,
        userRole: state.userRole,
        staffId: state.staffId,
      });
    }
  },
  setCurrentBusiness: (business) => {
    set({ currentBusiness: business });
    const state = get();
    if (state.user) {
      void cacheAuthContext({
        user: state.user,
        profile: state.profile,
        currentBusiness: business,
        currentBranch: state.currentBranch,
        userRole: state.userRole,
        staffId: state.staffId,
      });
    }
  },
  setCurrentBranch: (branch) => {
    set({ currentBranch: branch });
    const state = get();
    if (state.user && state.currentBusiness && branch) {
      void saveSelectedBranchId(state.user.id, state.currentBusiness.id, branch.id);
    }
    if (state.user) {
      void cacheAuthContext({
        user: state.user,
        profile: state.profile,
        currentBusiness: state.currentBusiness,
        currentBranch: branch,
        userRole: state.userRole,
        staffId: state.staffId,
      });
    }
  },
  setUserRole: (role) => set({ userRole: role }),
  setStaffId: (staffId) => set({ staffId }),

  switchBranch: async (branch) => {
    const state = get();
    if (!branch) return;
    // Staff stay in the branch they are assigned to; only the owner moves
    // between branches (the owner reassigns staff from Team).
    if (state.userRole && state.userRole !== 'owner' && branch.id !== state.currentBranch?.id) return;

    const changed = state.currentBranch?.id !== branch.id;
    if (changed) {
      try { useDashboardStore.getState().reset(); } catch (_) {}
      try { useAnalyticsStore.getState().reset(); } catch (_) {}
      try { useSaleStore.getState().resetBranchStats(); } catch (_) {}
      try { useDebtStore.getState().reset(); } catch (_) {}
      try { useDailyBalanceStore.getState().reset(); } catch (_) {}
      try { usePurchaseStore.getState().reset(); } catch (_) {}
    }

    set({ currentBranch: branch });
    if (state.user && state.currentBusiness) {
      await saveSelectedBranchId(state.user.id, state.currentBusiness.id, branch.id);
    }
    if (state.user) {
      await cacheAuthContext({
        user: state.user,
        profile: state.profile,
        currentBusiness: state.currentBusiness,
        currentBranch: branch,
        userRole: state.userRole,
        staffId: state.staffId,
      });
    }
  },

  refreshAssignment: async () => {
    const { user, currentBusiness, currentBranch, userRole } = get();
    if (!user || !currentBusiness || !userRole || userRole === 'owner') return;
    try {
      const { data: membership, error } = await supabase
        .from('business_members')
        .select('role, branch_id, is_active, branches(*)')
        .eq('user_id', user.id)
        .eq('business_id', currentBusiness.id)
        .maybeSingle();
      if (error || !membership) return;

      const role = membership.role as UserRole;
      if (role !== userRole) set({ userRole: role });

      const assigned = (membership.branches as unknown as Branch | null) ?? null;
      if (role !== 'owner' && assigned && assigned.id !== currentBranch?.id) {
        // Moved by the owner: reset branch data and work in the new branch.
        try { useDashboardStore.getState().reset(); } catch (_) {}
        try { useAnalyticsStore.getState().reset(); } catch (_) {}
        try { useSaleStore.getState().resetBranchStats(); } catch (_) {}
        try { useDebtStore.getState().reset(); } catch (_) {}
        try { useDailyBalanceStore.getState().reset(); } catch (_) {}
        try { usePurchaseStore.getState().reset(); } catch (_) {}
        set({ currentBranch: assigned });
        useBusinessStore.setState({ branches: [assigned] });
        await saveSelectedBranchId(user.id, currentBusiness.id, assigned.id);
        await cacheAuthContext({
          user,
          profile: get().profile,
          currentBusiness,
          currentBranch: assigned,
          userRole: role,
          staffId: get().staffId,
        });
      }
    } catch (_) {}
  },

  signOut: async () => {
    try { await flushOfflineQueue(); } catch (_) {}
    try { await cancelAllNotifications(); } catch (_) {}
    try { resetAllAppStores(); } catch (_) {}
    try { await supabase.auth.signOut(); } catch (_) {}
    try { await AsyncStorage.removeItem(AUTH_CONTEXT_STORAGE_KEY); } catch (_) {}
    useTabStore.getState().setActiveTab('dashboard');
    set({
      session: null, user: null, profile: null,
      currentBusiness: null, currentBranch: null, userRole: null, staffId: null,
    });
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Check env vars first
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key || url.includes('placeholder')) {
        console.warn('[Record Am] Supabase credentials not configured — skipping auth init');
        set({ isLoading: false, isInitialized: true });
        return;
      }

      const cachedContext = await readCachedAuthContext();

      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        resetAllAppStores();
        set({
          session: null,
          user: null,
          profile: null,
          currentBusiness: null,
          currentBranch: null,
          userRole: null,
          staffId: null,
        });
        if (error) console.warn('[Record Am] getSession error:', error.message);
        set({ isLoading: false, isInitialized: true });
        return;
      }

      set({ session, user: session?.user ?? null });

      if (session?.user) {
        useNotificationStore.getState().loadNotifications(session.user.id).catch(() => {});
        let hasInitializedFromCache = false;

        // 1. Optimistically load from cache immediately so splash screen dismisses instantly
        if (cachedContext && cachedContext.user?.id === session.user.id) {
          set({
            profile: cachedContext.profile,
            currentBusiness: cachedContext.currentBusiness,
            currentBranch: cachedContext.currentBranch,
            userRole: cachedContext.userRole,
            staffId: cachedContext.staffId ?? null,
            isLoading: false,
            isInitialized: true,
          });
          hasInitializedFromCache = true;
        }

        // 2. Fetch fresh data in the background (or foreground if no cache)
        const fetchFreshData = async () => {
          let nextProfile = cachedContext?.profile || null;
          let nextBusiness = cachedContext?.currentBusiness || null;
          let nextBranch = cachedContext?.currentBranch || null;
          let nextRole = cachedContext?.userRole || null;
          let nextStaffId = cachedContext?.staffId ?? null;

          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (profile) {
              nextProfile = profile;
              set({ profile });
            }
          } catch (err) {
            console.warn('[Record Am] Could not load profile:', err);
          }

          try {
            const { data: membership } = await supabase
              .from('business_members')
              .select('*, businesses(*), branches(*)')
              .eq('user_id', session.user.id)
              .eq('is_active', true)
              .limit(1)
              .single();

            if (membership) {
              nextBusiness = membership.businesses as Business;
              nextRole = membership.role as UserRole;
              nextStaffId = (membership as any).staff_id ?? null;

              const assignedBranch = (membership.branches as Branch | null) ?? null;
              nextBranch = assignedBranch;
              let fetchedBranches: Branch[] = [];

              if (nextBusiness?.id) {
                const { data: branchRows } = await supabase
                  .from('branches')
                  .select('*')
                  .eq('business_id', nextBusiness.id)
                  .order('is_main', { ascending: false })
                  .order('created_at', { ascending: true });

                const allBranches = (branchRows ?? []) as Branch[];
                fetchedBranches = allBranches;
                if (allBranches.length > 0) {

                  if (nextRole === 'owner') {
                    const preferredId =
                      get().currentBranch?.id ||
                      (await readSelectedBranchId(session.user.id, nextBusiness.id));
                    const matched =
                      (preferredId ? allBranches.find((b) => b.id === preferredId) : undefined) ||
                      (assignedBranch ? allBranches.find((b) => b.id === assignedBranch.id) : undefined) ||
                      allBranches.find((b) => b.is_main) ||
                      allBranches[0];
                    nextBranch = matched ?? assignedBranch;
                  } else if (assignedBranch) {
                    nextBranch =
                      allBranches.find((b) => b.id === assignedBranch.id) ?? assignedBranch;
                  } else {
                    nextBranch = allBranches.find((b) => b.is_main) ?? allBranches[0];
                  }
                }
              }

              set({
                currentBusiness: nextBusiness,
                currentBranch: nextBranch,
                userRole: nextRole,
                staffId: nextStaffId,
              });
              // Staff only ever see the branch they work in (set after the
              // role and branch above, which visibleBranches reads).
              if (fetchedBranches.length > 0) {
                useBusinessStore.setState({ branches: visibleBranches(fetchedBranches) });
              }
            }
          } catch (err) {
            console.warn('[Record Am] Could not load business membership:', err);
          }

          await cacheAuthContext({
            user: session.user,
            profile: nextProfile,
            currentBusiness: nextBusiness,
            currentBranch: nextBranch,
            userRole: nextRole,
            staffId: nextStaffId,
          });

          if (!hasInitializedFromCache) {
            set({ isLoading: false, isInitialized: true });
          }
        };

        if (hasInitializedFromCache) {
          // Fire and forget so we don't block
          fetchFreshData().catch(console.warn);
        } else {
          // Wait for it because we need data to proceed
          await fetchFreshData();
        }
      } else {
        set({ isLoading: false, isInitialized: true });
      }
    } catch (err) {
      // Network error or other — don't crash the app
      console.warn('[Record Am] Auth initialize error:', err);
      set({ isLoading: false, isInitialized: true });
    }
  },
}));

