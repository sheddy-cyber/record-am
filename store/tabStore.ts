import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface TabState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  parentScrollRef: any;
  setParentScrollRef: (ref: any) => void;
}

export const useTabStore = create<TabState>()(
  subscribeWithSelector((set) => ({
    activeTab: 'dashboard',
    setActiveTab: (tab) => set({ activeTab: tab }),
    parentScrollRef: null,
    setParentScrollRef: (ref) => set({ parentScrollRef: ref }),
  }))
);
