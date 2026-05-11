import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Business, Branch, UserProfile, UserRole } from '@/types';

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

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[Record Am] getSession error:', error.message);
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
            set({
              currentBusiness: membership.businesses as Business,
              currentBranch: membership.branches as Branch,
              userRole: membership.role as UserRole,
            });
          }
        } catch (err) {
          console.warn('[Record Am] Could not load business membership:', err);
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

