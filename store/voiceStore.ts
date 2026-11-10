// ============================================================
// RECORD AM - Voice Assistant Store
// ============================================================

import { create } from 'zustand';
import { VoiceAction, VoiceAssistantState } from '@/types/voice';
import {
  RecordingSession,
  speakVoiceFeedback,
  startAudioRecording,
  transcribeAudioFile,
} from '@/lib/voice/audioService';
import { parseVoiceCommand } from '@/lib/voice/parser';
import { executeVoiceAction } from '@/lib/voice/actionExecutor';
import { useBusinessStore } from './businessStore';
import { useCustomerStore } from './customerStore';
import { useAuthStore } from './authStore';
import { getAppSettings, saveAppSettings } from '@/lib/appSettings';
import Toast from 'react-native-toast-message';

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

  // Actions
  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  saveApiKeyAndTranscribe: (provider: 'groq' | 'gemini', key: string) => Promise<void>;
  processText: (text: string) => Promise<void>;
  confirmAction: () => Promise<void>;
  pauseAutoConfirm: () => void;
  resumeAutoConfirm: () => void;
  reset: () => void;
}

export const MAX_RECORDING_SECONDS = 10;

let activeRecordingSession: RecordingSession | null = null;
let recordingIntervalTimer: any = null;
let autoStopTimeoutTimer: any = null;

function clearRecordingTimers() {
  if (recordingIntervalTimer) {
    clearInterval(recordingIntervalTimer);
    recordingIntervalTimer = null;
  }
  if (autoStopTimeoutTimer) {
    clearTimeout(autoStopTimeoutTimer);
    autoStopTimeoutTimer = null;
  }
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  isOpen: false,
  state: 'idle',
  transcription: '',
  audioLevel: 0,
  recordingSeconds: 0,
  lastAudioUri: null,
  action: null,
  error: null,
  autoConfirmSeconds: 0,
  isAutoConfirmPaused: true,

  open: () => {
    clearRecordingTimers();
    set({
      isOpen: true,
      state: 'idle',
      transcription: '',
      audioLevel: 0,
      recordingSeconds: 0,
      lastAudioUri: null,
      action: null,
      error: null,
      autoConfirmSeconds: 0,
      isAutoConfirmPaused: true,
    });
    // Immediately start listening on open for seamless Siri-like feel
    get().startListening();
  },

  close: () => {
    clearRecordingTimers();
    if (activeRecordingSession) {
      const session = activeRecordingSession;
      activeRecordingSession = null;
      try {
        session.stop().catch(() => {});
      } catch {}
    }
    set({
      isOpen: false,
      state: 'idle',
      transcription: '',
      audioLevel: 0,
      recordingSeconds: 0,
      lastAudioUri: null,
      action: null,
      error: null,
    });
  },

  startListening: async () => {
    clearRecordingTimers();
    try {
      set({
        state: 'listening',
        transcription: '',
        audioLevel: 0,
        recordingSeconds: 0,
        action: null,
        error: null,
        isAutoConfirmPaused: false,
      });

      const session = await startAudioRecording((level) => {
        set({ audioLevel: level });
      });

      if (!session) {
        set({
          state: 'error',
          error: 'Could not access microphone. Please check permissions.',
        });
        return;
      }

      activeRecordingSession = session;

      // Start recording seconds ticker
      recordingIntervalTimer = setInterval(() => {
        const currentSecs = get().recordingSeconds;
        const nextSecs = currentSecs + 1;
        set({ recordingSeconds: nextSecs });
        if (nextSecs >= MAX_RECORDING_SECONDS) {
          clearRecordingTimers();
          if (get().state === 'listening') {
            get().stopListening();
          }
        }
      }, 1000);

      // Auto-stop after max recording seconds
      autoStopTimeoutTimer = setTimeout(() => {
        if (get().state === 'listening') {
          get().stopListening();
        }
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (err: any) {
      clearRecordingTimers();
      set({
        state: 'error',
        error: err.message || 'Microphone error.',
      });
    }
  },

  stopListening: async () => {
    clearRecordingTimers();
    if (!activeRecordingSession) return;

    set({ state: 'processing', audioLevel: 0 });

    try {
      const fileUri = await activeRecordingSession.stop();
      activeRecordingSession = null;

      if (!fileUri) {
        set({ state: 'error', error: 'No audio recorded.' });
        return;
      }

      // Check settings and env for cloud API keys
      const settings: any = await getAppSettings();
      const groqKey =
        process.env.EXPO_PUBLIC_GROQ_API_KEY ||
        settings.groqApiKey;
      const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY || settings.openaiApiKey;
      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || settings.geminiApiKey;

      if (!groqKey && !geminiKey && !openaiKey) {
        set({
          state: 'needs_key',
          lastAudioUri: fileUri,
          error: 'Voice transcription requires a free Groq or Gemini API key.',
        });
        return;
      }

      const transcription = await transcribeAudioFile(fileUri, {
        groqKey,
        geminiKey,
        openaiKey,
      });

      if (!transcription || !transcription.trim()) {
        set({
          state: 'error',
          error: "Didn't catch any speech. Please tap the mic and try again.",
        });
        return;
      }

      set({ transcription, lastAudioUri: null });

      // Parse with NLU engine
      const products = useBusinessStore.getState().products;
      const customers = useCustomerStore.getState().customers;

      const chosenKey = geminiKey || groqKey || openaiKey;
      const chosenProvider: 'groq' | 'gemini' | 'openai' = chosenKey?.startsWith('AIza')
        ? 'gemini'
        : chosenKey?.startsWith('sk-')
        ? 'openai'
        : 'groq';

      const branchId = useAuthStore.getState().currentBranch?.id;

      const action = await parseVoiceCommand(transcription, products, customers, {
        apiKey: chosenKey,
        apiProvider: chosenProvider,
        branchId,
      });

      if (action.type === 'UNKNOWN') {
        set({
          state: 'error',
          action,
          error: action.suggestion || 'Could not recognize command.',
        });
        return;
      }

      set({
        state: 'preview',
        action,
        autoConfirmSeconds: settings.voiceAutoConfirmSeconds ?? 0,
        isAutoConfirmPaused: true,
      });
    } catch (err: any) {
      activeRecordingSession = null;
      set({
        state: 'error',
        error: err.message || 'Error processing audio.',
      });
    }
  },

  saveApiKeyAndTranscribe: async (provider: 'groq' | 'gemini', key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;

    if (provider === 'groq') {
      await saveAppSettings({ groqApiKey: trimmed });
    } else {
      await saveAppSettings({ geminiApiKey: trimmed });
    }

    const { lastAudioUri } = get();
    if (lastAudioUri) {
      set({ state: 'processing', error: null });
      try {
        const keys = provider === 'groq' ? { groqKey: trimmed } : { geminiKey: trimmed };
        const transcription = await transcribeAudioFile(lastAudioUri, keys);

        if (!transcription || !transcription.trim()) {
          set({
            state: 'error',
            error: "Didn't hear any speech in the recording. Tap the mic to speak again.",
          });
          return;
        }

        set({ transcription, lastAudioUri: null });

        const products = useBusinessStore.getState().products;
        const customers = useCustomerStore.getState().customers;

        const branchId = useAuthStore.getState().currentBranch?.id;

        const action = await parseVoiceCommand(transcription, products, customers, {
          apiKey: trimmed,
          apiProvider: provider,
          branchId,
        });

        if (action.type === 'UNKNOWN') {
          set({
            state: 'error',
            action,
            error: action.suggestion || 'Could not understand command.',
          });
          return;
        }

        const settings: any = await getAppSettings();
        set({
          state: 'preview',
          action,
          autoConfirmSeconds: settings.voiceAutoConfirmSeconds ?? 5,
          isAutoConfirmPaused: false,
        });
      } catch (err: any) {
        set({
          state: 'error',
          error: err.message || 'Transcription failed with this key.',
        });
      }
    } else {
      set({ state: 'idle', error: null });
    }
  },

  processText: async (text: string) => {
    if (!text.trim()) return;

    set({ state: 'processing', transcription: text, error: null });

    try {
      const settings: any = await getAppSettings();
      const apiKey =
        process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
        process.env.EXPO_PUBLIC_GROQ_API_KEY ||
        process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
        settings.geminiApiKey ||
        settings.groqApiKey;

      const products = useBusinessStore.getState().products;
      const customers = useCustomerStore.getState().customers;

      const branchId = useAuthStore.getState().currentBranch?.id;

      const action = await parseVoiceCommand(text, products, customers, {
        apiKey,
        apiProvider: apiKey?.startsWith('AIza') ? 'gemini' : 'groq',
        branchId,
      });

      if (action.type === 'UNKNOWN') {
        set({
          state: 'error',
          action,
          error: action.suggestion || 'Could not understand command. Check format.',
        });
        return;
      }

      set({
        state: 'preview',
        action,
        autoConfirmSeconds: settings.voiceAutoConfirmSeconds ?? 0,
        isAutoConfirmPaused: true,
      });
    } catch (err: any) {
      set({
        state: 'error',
        error: err.message || 'Failed to process command.',
      });
    }
  },

  confirmAction: async () => {
    const { action } = get();
    if (!action || action.type === 'UNKNOWN') return;

    set({ state: 'executing' });

    try {
      const settings: any = await getAppSettings();
      const ttsEnabled = settings.voiceTtsEnabled ?? true;

      const result = await executeVoiceAction(action, ttsEnabled);

      set({ state: 'completed' });

      Toast.show({
        type: 'success',
        text1: 'Action Completed',
        text2: result.message,
      });

      // Auto close after 1.5 seconds
      setTimeout(() => {
        get().close();
      }, 1500);
    } catch (err: any) {
      set({
        state: 'error',
        error: err.message || 'Execution failed.',
      });
    }
  },

  pauseAutoConfirm: () => {
    set({ isAutoConfirmPaused: true });
  },

  resumeAutoConfirm: () => {
    set({ isAutoConfirmPaused: false });
  },

  reset: () => {
    clearRecordingTimers();
    set({
      state: 'idle',
      transcription: '',
      audioLevel: 0,
      recordingSeconds: 0,
      lastAudioUri: null,
      action: null,
      error: null,
      autoConfirmSeconds: 5,
      isAutoConfirmPaused: false,
    });
  },
}));
