// ============================================================
// RECORD AM - Voice assistant store
//
// Flow: open → listening → (silence detected | tap) → processing → preview →
// executing → completed. Every async step is tied to a session number so a
// result that arrives after the sheet was closed or restarted is dropped
// instead of resurrecting old state.
// ============================================================

import { create } from 'zustand';
import Toast from 'react-native-toast-message';
import { VoiceAction, VoiceAssistantState } from '@/types/voice';
import {
  buildTranscriptionPrompt,
  RecordingSession,
  startAudioRecording,
  stopSpeech,
  transcribeAudioFile,
} from '@/lib/voice/audioService';
import { parseVoiceCommand } from '@/lib/voice/parser';
import { executeVoiceAction } from '@/lib/voice/actionExecutor';
import { getAppSettings } from '@/lib/appSettings';
import { haptics } from '@/lib/haptics';
import { useBusinessStore } from './businessStore';
import { useCustomerStore } from './customerStore';
import { useAuthStore } from './authStore';

/** Hard ceiling for one utterance. */
export const MAX_RECORDING_SECONDS = 30;
/** Silence after speech that ends the recording automatically. */
const END_OF_SPEECH_MS = 1300;
/** If nothing is said at all, give up after this long. */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** Loudness (0..1) above which we treat the input as speech. */
const SPEECH_THRESHOLD = 0.4;

interface VoiceStoreState {
  isOpen: boolean;
  state: VoiceAssistantState;
  transcription: string;
  audioLevel: number;
  recordingSeconds: number;
  lastAudioUri: string | null;
  action: VoiceAction | null;
  error: string | null;
  autoConfirmSeconds: number;
  isAutoConfirmPaused: boolean;
  /** True once the user has started speaking in the current recording. */
  heardSpeech: boolean;

  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => void;
  processText: (text: string) => Promise<void>;
  confirmAction: () => Promise<void>;
  pauseAutoConfirm: () => void;
  resumeAutoConfirm: () => void;
  reset: () => void;
}

// ── Module-level runtime (not render state) ──────────────────────────────────
let session = 0;
let recordingSession: RecordingSession | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;
let startedAt = 0;
let lastVoiceAt = 0;
let loudFrames = 0;
let smoothed = 0;
let lastEmitted = 0;

function clearTimers() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

function abortInflight() {
  inflight?.abort();
  inflight = null;
}

function vocabulary() {
  const products = useBusinessStore.getState().products;
  const customers = useCustomerStore.getState().customers;
  return buildTranscriptionPrompt(
    products.filter((p) => p.is_active !== false).map((p) => p.name),
    customers.slice(0, 40).map((c) => c.name),
  );
}

const IDLE = {
  state: 'idle' as VoiceAssistantState,
  transcription: '',
  audioLevel: 0,
  recordingSeconds: 0,
  lastAudioUri: null,
  action: null,
  error: null,
  heardSpeech: false,
};

export const useVoiceStore = create<VoiceStoreState>((set, get) => {
  /** Turns text into a previewable action (shared by speech and typing). */
  const understand = async (text: string, mySession: number) => {
    const settings = await getAppSettings();
    if (mySession !== session) return;
    const controller = new AbortController();
    inflight = controller;
    try {
      const action = await parseVoiceCommand(
        text,
        useBusinessStore.getState().products,
        useCustomerStore.getState().customers,
        { branchId: useAuthStore.getState().currentBranch?.id, signal: controller.signal },
      );
      if (mySession !== session) return;
      if (action.type === 'UNKNOWN') {
        haptics.warning();
        set({ state: 'error', action, error: action.suggestion || "I couldn't work out what to record from that." });
        return;
      }
      haptics.selection();
      set({
        state: 'preview',
        action,
        error: null,
        autoConfirmSeconds: Number(settings.voiceAutoConfirmSeconds ?? 0),
        isAutoConfirmPaused: false,
      });
    } finally {
      if (inflight === controller) inflight = null;
    }
  };

  return {
    isOpen: false,
    ...IDLE,
    autoConfirmSeconds: 0,
    isAutoConfirmPaused: true,

    open: () => {
      session += 1;
      clearTimers();
      abortInflight();
      set({ isOpen: true, ...IDLE, autoConfirmSeconds: 0, isAutoConfirmPaused: true });
      void get().startListening();
    },

    close: () => {
      session += 1;
      clearTimers();
      abortInflight();
      const rec = recordingSession;
      recordingSession = null;
      rec?.cancel().catch(() => {});
      void stopSpeech();
      set({ isOpen: false, ...IDLE });
    },

    startListening: async () => {
      session += 1;
      const mySession = session;
      clearTimers();
      abortInflight();
      if (recordingSession) {
        const old = recordingSession;
        recordingSession = null;
        old.cancel().catch(() => {});
      }
      set({ ...IDLE, state: 'listening', isAutoConfirmPaused: true });

      startedAt = Date.now();
      lastVoiceAt = 0;
      loudFrames = 0;
      smoothed = 0;
      lastEmitted = 0;

      try {
        const rec = await startAudioRecording((level) => {
          if (mySession !== session) return;
          // Smooth the meter so the waveform breathes rather than flickers.
          smoothed = smoothed * 0.55 + level * 0.45;
          const now = Date.now();
          if (level >= SPEECH_THRESHOLD) {
            loudFrames += 1;
            lastVoiceAt = now;
            if (loudFrames >= 2 && !get().heardSpeech) set({ heardSpeech: true });
          }
          if (Math.abs(smoothed - lastEmitted) > 0.03) {
            lastEmitted = smoothed;
            set({ audioLevel: smoothed });
          }
          // End of speech: the user spoke and has now been quiet for a beat.
          if (get().heardSpeech && lastVoiceAt && now - lastVoiceAt > END_OF_SPEECH_MS && now - startedAt > 900) {
            void get().stopListening();
          }
        });

        if (mySession !== session) {
          rec.cancel().catch(() => {});
          return;
        }
        recordingSession = rec;
        haptics.press();

        tickTimer = setInterval(() => {
          if (mySession !== session) return;
          const elapsed = Date.now() - startedAt;
          set({ recordingSeconds: Math.floor(elapsed / 1000) });
          if (!get().heardSpeech && elapsed > NO_SPEECH_TIMEOUT_MS) {
            get().cancelListening();
            set({ state: 'error', error: "I didn't hear anything. Tap the mic and speak, or type the command." });
          } else if (elapsed >= MAX_RECORDING_SECONDS * 1000) {
            void get().stopListening();
          }
        }, 250);
      } catch (err: any) {
        if (mySession !== session) return;
        clearTimers();
        set({ state: 'error', error: err?.message || 'The microphone could not be started.' });
      }
    },

    cancelListening: () => {
      clearTimers();
      const rec = recordingSession;
      recordingSession = null;
      rec?.cancel().catch(() => {});
      set({ audioLevel: 0 });
    },

    stopListening: async () => {
      const rec = recordingSession;
      if (!rec || get().state !== 'listening') return;
      recordingSession = null;
      clearTimers();
      const mySession = session;
      haptics.tap();
      set({ state: 'processing', audioLevel: 0 });

      try {
        const uri = await rec.stop();
        if (mySession !== session) return;
        if (!uri) {
          set({ state: 'error', error: 'Nothing was recorded. Please try again.' });
          return;
        }

        // Speech goes through the voice-command server function, which holds
        // the provider key; no key is ever kept in the app.
        const controller = new AbortController();
        inflight = controller;
        let text = '';
        try {
          text = await transcribeAudioFile(uri, vocabulary(), controller.signal);
        } finally {
          if (inflight === controller) inflight = null;
        }
        if (mySession !== session) return;

        if (!text) {
          set({ state: 'error', error: "I couldn't make out any words. Try again a little closer to the phone." });
          return;
        }
        set({ transcription: text });
        await understand(text, mySession);
      } catch (err: any) {
        if (mySession !== session) return;
        haptics.error();
        set({ state: 'error', error: err?.message || 'Something went wrong while processing your voice.' });
      }
    },

    processText: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      get().cancelListening();
      session += 1;
      const mySession = session;
      set({ state: 'processing', transcription: trimmed, error: null, action: null });
      try {
        await understand(trimmed, mySession);
      } catch (err: any) {
        if (mySession !== session) return;
        set({ state: 'error', error: err?.message || 'Could not process that command.' });
      }
    },

    confirmAction: async () => {
      const { action, state } = get();
      if (!action || action.type === 'UNKNOWN' || state === 'executing') return;
      const mySession = session;
      set({ state: 'executing', isAutoConfirmPaused: true });
      try {
        const settings = await getAppSettings();
        const result = await executeVoiceAction(action, settings.voiceTtsEnabled ?? true);
        if (mySession !== session) return;
        haptics.success();
        set({ state: 'completed' });
        Toast.show({ type: 'success', text1: 'Saved', text2: result.message });
        closeTimer = setTimeout(() => {
          if (mySession === session) get().close();
        }, 1100);
      } catch (err: any) {
        if (mySession !== session) return;
        haptics.error();
        set({ state: 'error', error: err?.message || 'That could not be saved.' });
      }
    },

    pauseAutoConfirm: () => set({ isAutoConfirmPaused: true }),
    resumeAutoConfirm: () => set({ isAutoConfirmPaused: false }),

    reset: () => {
      session += 1;
      clearTimers();
      abortInflight();
      set({ ...IDLE, autoConfirmSeconds: 0, isAutoConfirmPaused: true });
    },
  };
});
