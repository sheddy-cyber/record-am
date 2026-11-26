import { create } from 'zustand';

/**
 * Which sales are selected on the Sales tab (for merging receipts or bulk
 * delete). Kept out of the screen's own state so that selecting a card
 * re-renders only what shows the selection (the cards, the header and the
 * action bar) in one commit, instead of the whole Sales screen.
 */
interface SaleSelectionState {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
  add: (id: string) => void;
  setAll: (ids: string[]) => void;
  clear: () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useSaleSelection = create<SaleSelectionState>((set, get) => ({
  ids: EMPTY,
  toggle: (id) => {
    const next = new Set(get().ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ ids: next.size ? next : EMPTY });
  },
  add: (id) => {
    if (get().ids.has(id)) return;
    const next = new Set(get().ids);
    next.add(id);
    set({ ids: next });
  },
  setAll: (ids) => set({ ids: ids.length ? new Set(ids) : EMPTY }),
  clear: () => {
    if (get().ids.size) set({ ids: EMPTY });
  },
}));
