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

  setSession: (session) => set({ session, user: session?.user ?? null }),
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
        if (cachedContext?.currentBusiness) {
          const cachedUser = cachedContext.user || (cachedContext.profile ? { id: cachedContext.profile.id } as User : null);
          if (cachedUser) {
            set({
              user: cachedUser,
              profile: cachedContext.profile,
              currentBusiness: cachedContext.currentBusiness,
              currentBranch: cachedContext.currentBranch,
              userRole: cachedContext.userRole,
            });
          }
        }
        if (error) console.warn('[Record Am] getSession error:', error.message);
        set({ isLoading: false, isInitialized: true });
        return;
      }

      set({ session, user: session?.user ?? null });

      if (session?.user) {

        // Load profile — non-fatal if it fails
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profile) set({ profile });
        } catch (err) {
          console.warn('[Record Am] Could not load profile:', err);
          if (cachedContext?.profile) {
            set({ profile: cachedContext.profile });
          }
        }

        // Load business membership — non-fatal if it fails
        try {
          const { data: membership } = await supabase
            .from('business_members')
            .select('*, businesses(*), branches(*)')
            .eq('user_id', session.user.id)
            .eq('is_active', true)
            .limit(1)
            .single();

          if (membership) {
            const nextBusiness = membership.businesses as Business;
            const nextBranch = membership.branches as Branch;
            const nextRole = membership.role as UserRole;
            set({
              currentBusiness: nextBusiness,
              currentBranch: nextBranch,
              userRole: nextRole,
            });
            await cacheAuthContext({
              user: session.user,
              profile: useAuthStore.getState().profile,
              currentBusiness: nextBusiness,
              currentBranch: nextBranch,
              userRole: nextRole,
            });
          }
        } catch (err) {
          console.warn('[Record Am] Could not load business membership:', err);
          if (cachedContext) {
            set({
              profile: cachedContext.profile,
              currentBusiness: cachedContext.currentBusiness,
              currentBranch: cachedContext.currentBranch,
              userRole: cachedContext.userRole,
            });
          }
        }
      }
    } catch (err) {
      // Network error or other — don't crash the app
      console.warn('[Record Am] Auth initialize error:', err);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },
}));

