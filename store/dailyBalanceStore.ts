import { create } from 'zustand';
import { format } from 'date-fns';
import { BalanceEntry, closeDailySummary, getDailyBalanceSnapshot, reopenDailySummary } from '@/lib/dailyBalance';
import { DailySummary } from '@/types';

interface DailyBalanceState {
  summary: DailySummary | null;
  entries: BalanceEntry[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectedDate: string;

  setSelectedDate: (date: string) => void;
  fetchDailyBalance: (businessId: string, branchId: string, date?: string) => Promise<void>;
  closeDay: (
    businessId: string,
    branchId: string,
    userId: string,
    actualCash: number,
    notes: string
  ) => Promise<boolean>;
  reopenDay: (businessId: string, branchId: string) => Promise<boolean>;
}

export const useDailyBalanceStore = create<DailyBalanceState>((set, get) => ({
  summary: null,
  entries: [],
  isLoading: false,
  isSaving: false,
  error: null,
  selectedDate: format(new Date(), 'yyyy-MM-dd'),

  setSelectedDate: (date) => set({ selectedDate: date }),

  fetchDailyBalance: async (businessId, branchId, date) => {
    set({ isLoading: true, error: null });
    const targetDate = date ?? get().selectedDate;

    try {
      const snapshot = await getDailyBalanceSnapshot(businessId, branchId, targetDate);
      set({ summary: snapshot.summary, entries: snapshot.entries });
    } catch (err: any) {
      console.error('[dailyBalance]', err);
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  closeDay: async (businessId, branchId, userId, actualCash, notes) => {
    set({ isSaving: true });
    const { summary } = get();
    if (!summary) {
      set({ isSaving: false });
      return false;
    }

    try {
      const closedSummary = await closeDailySummary({
        businessId,
        branchId,
        userId,
        summary,
        actualCash,
        notes,
      });
      set({ summary: closedSummary });
      return true;
    } catch (err: any) {
      console.error('[closeDay]', err);
      set({ error: err.message });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  reopenDay: async (businessId, branchId) => {
    set({ isSaving: true });
    const { summary } = get();
    if (!summary?.id) {
      set({ isSaving: false });
      return false;
    }

    try {
      await reopenDailySummary(businessId, branchId, summary.summary_date);
      const snapshot = await getDailyBalanceSnapshot(businessId, branchId, summary.summary_date);
      set({ summary: snapshot.summary, entries: snapshot.entries });
      return true;
    } catch (err: any) {
      console.error('[reopenDay]', err);
      set({ error: err.message });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));
