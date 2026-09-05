import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useTabStore } from '@/store/tabStore';
import { Business, Branch, UserProfile, UserRole } from '@/types';

const AUTH_CONTEXT_STORAGE_KEY = 'record-am:auth-context:v1';

interface CachedAuthContext {
  user?: User | null;
  profile: UserProfile | null;
  currentBusiness: Business | null;
  currentBranch: Branch | null;
  userRole: UserRole | null;
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
  isLoading: boolean;
  isInitialized: boolean;

  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setCurrentBusiness: (business: Business | null) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setUserRole: (role: UserRole | null) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  currentBusiness: null,
  currentBranch: null,
  userRole: null,
  isLoading: false,
  isInitialized: false,

  setSession: (session) => set((state) => {
    if (!session) {
      // A cached profile or business is useful only after a valid Supabase
      // session has been restored. Never let it stand in for authentication.
      return {
        session: null,
        user: null,
        profile: null,
        currentBusiness: null,
        currentBranch: null,
        userRole: null,
      };
    }

    const changedUser = Boolean(state.user && state.user.id !== session.user.id);
    return {
      session,
      user: session.user,
      ...(changedUser
        ? {
            profile: null,
            currentBusiness: null,
            currentBranch: null,
            userRole: null,
          }
        : {}),
    };
  }),
  setProfile: (profile) => set({ profile }),
  setCurrentBusiness: (business) => set({ currentBusiness: business }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setUserRole: (role) => set({ userRole: role }),

  signOut: async () => {
    try { await supabase.auth.signOut(); } catch (_) {}
    try { await AsyncStorage.removeItem(AUTH_CONTEXT_STORAGE_KEY); } catch (_) {}
    useTabStore.getState().setActiveTab('dashboard');
    set({
      session: null, user: null, profile: null,
      currentBusiness: null, currentBranch: null, userRole: null,
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
        set({
          session: null,
          user: null,
          profile: null,
          currentBusiness: null,
          currentBranch: null,
          userRole: null,
        });
        if (error) console.warn('[Record Am] getSession error:', error.message);
        set({ isLoading: false, isInitialized: true });
        return;
      }

      set({ session, user: session?.user ?? null });

      if (session?.user) {
        let hasInitializedFromCache = false;

        // 1. Optimistically load from cache immediately so splash screen dismisses instantly
        if (cachedContext && cachedContext.user?.id === session.user.id) {
          set({
            profile: cachedContext.profile,
            currentBusiness: cachedContext.currentBusiness,
            currentBranch: cachedContext.currentBranch,
            userRole: cachedContext.userRole,
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
              nextBranch = membership.branches as Branch;
              nextRole = membership.role as UserRole;
              set({
                currentBusiness: nextBusiness,
                currentBranch: nextBranch,
                userRole: nextRole,
              });
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

