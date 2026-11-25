// ============================================================
// RECORD AM - Haptics
// Thin, failure-proof wrapper. The native module is loaded lazily so a dev
// client built before expo-haptics was added keeps working (silently).
// ============================================================

import { Platform } from 'react-native';

type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') {
    mod = null;
    return mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

function run(fn: (h: HapticsModule) => Promise<unknown>) {
  const h = load();
  if (!h) return;
  try {
    fn(h).catch(() => {});
  } catch {
    // Native module missing from this binary; ignore.
  }
}

export const haptics = {
  /** A light tick for selections: tabs, segmented controls, toggles. */
  selection: () => run((h) => h.selectionAsync()),
  /** A soft tap for primary buttons. */
  tap: () => run((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  /** A firmer tap for important actions (start recording, confirm). */
  press: () => run((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium)),
  success: () => run((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),
  warning: () => run((h) => h.notificationAsync(h.NotificationFeedbackType.Warning)),
  error: () => run((h) => h.notificationAsync(h.NotificationFeedbackType.Error)),
};
