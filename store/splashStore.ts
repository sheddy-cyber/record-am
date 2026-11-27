import { create } from 'zustand';

/**
 * Tells the launch splash when the signed-in app has loaded its first screen
 * (the Bootloader has read the device cache), so the splash fades straight
 * onto real content instead of an empty loading view.
 */
interface SplashState {
  booted: boolean;
  markBooted: () => void;
}

export const useSplashStore = create<SplashState>((set, get) => ({
  booted: false,
  markBooted: () => {
    if (!get().booted) set({ booted: true });
  },
}));
