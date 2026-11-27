// ============================================================
// RECORD AM - Audio capture & speech-to-text
//
// Latency budget matters more than fidelity here: speech is recorded at 16 kHz
// mono (a fraction of the old 44.1 kHz / 128 kbps upload), every network call
// has a hard timeout, and transcription is primed with the shop's own product
// names so "Peak" is heard as "Peak", not "peek".
// ============================================================

import {
  AudioModule,
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import * as Speech from 'expo-speech';
// SDK 54: the path-based helpers live under /legacy; importing them from the
// package root throws at runtime.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export interface RecordingSession {
  recorder: AudioRecorder;
  stop: () => Promise<string | null>;
  cancel: () => Promise<void>;
}

export class VoiceTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} took too long. Check your connection and try again.`);
    this.name = 'VoiceTimeoutError';
  }
}

export class VoiceProxyUnavailableError extends Error {
  constructor() {
    super("Voice isn't available right now. Tap the keyboard button to type it instead.");
    this.name = 'VoiceProxyUnavailableError';
  }
}

/** fetch() with a hard deadline and an optional outer abort signal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
  outer?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener('abort', onOuterAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (outer?.aborted) throw err;
    if (err?.name === 'AbortError') throw new VoiceTimeoutError(label);
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

// ─── Permissions & capture ──────────────────────────────────────────────────

export async function requestMicPermission(): Promise<boolean> {
  try {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return true;
    const asked = await requestRecordingPermissionsAsync();
    return asked.granted;
  } catch (err) {
    console.warn('[voice] permission error:', err);
    return false;
  }
}

// Speech-tuned: 16 kHz mono AAC at 32 kbps. expo-audio takes the common fields
// plus the current platform's block flattened into one object.
const COMMON = { extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 32000, isMeteringEnabled: true };
const SPEECH_RECORDING = Platform.select<Record<string, unknown>>({
  ios: { ...COMMON, outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  android: { ...COMMON, outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_recognition' },
  default: { ...COMMON, mimeType: 'audio/webm', bitsPerSecond: 32000 },
});

const METER_INTERVAL_MS = 80;

/**
 * Starts recording. `onLevel` receives a 0..1 loudness value every ~80 ms,
 * which the store uses both for the waveform and to detect the end of speech.
 */
export async function startAudioRecording(onLevel?: (level: number) => void): Promise<RecordingSession> {
  const granted = await requestMicPermission();
  if (!granted) {
    throw new Error('Record Am needs microphone access. You can allow it in your phone settings.');
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });

  const recorder = new AudioModule.AudioRecorder(SPEECH_RECORDING as any) as AudioRecorder;
  await recorder.prepareToRecordAsync();
  recorder.record();

  // expo-audio reports metering on request rather than by callback, so poll.
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  if (onLevel) {
    meterTimer = setInterval(() => {
      try {
        const status = recorder.getStatus();
        if (status.isRecording && typeof status.metering === 'number') {
          // Metering is dBFS (-160..0). Speech sits roughly between -45 and -10.
          onLevel(Math.max(0, Math.min(1, (status.metering + 55) / 45)));
        }
      } catch {
        // The recorder may already be released; the next stop/cancel cleans up.
      }
    }, METER_INTERVAL_MS);
  }

  let finished = false;
  const finish = async (): Promise<string | null> => {
    if (meterTimer) clearInterval(meterTimer);
    meterTimer = null;
    if (finished) return recorder.uri;
    finished = true;
    try {
      if (recorder.isRecording) await recorder.stop();
      return recorder.uri;
    } catch (e) {
      console.warn('[voice] stop error:', e);
      return null;
    } finally {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
    }
  };

  const releaseNative = () => {
    try {
      (recorder as any).release?.();
    } catch {}
  };

  return {
    recorder,
    stop: async () => {
      const uri = await finish();
      releaseNative();
      return uri;
    },
    cancel: async () => {
      const uri = await finish();
      releaseNative();
      if (uri) {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {}
      }
    },
  };
}

// ─── Transcription ──────────────────────────────────────────────────────────

/** Builds the vocabulary hint sent with each transcription request. */
export function buildTranscriptionPrompt(productNames: string[], customerNames: string[] = []): string {
  const base =
    'Shop records in Nigeria. Words: sold, sell, bought, restock, stock, debt, owes, paid, balance, expense, cash, transfer, POS, naira, k for thousand.';
  const vocab = [...productNames, ...customerNames].map((n) => n.trim()).filter(Boolean);
  let prompt = base;
  for (const name of vocab) {
    if (prompt.length + name.length + 2 > 820) break; // Whisper reads ~224 tokens of prompt
    prompt += ` ${name},`;
  }
  return prompt.replace(/,$/, '.');
}

/** Transcription through the `voice-command` Supabase Edge Function (keys stay on the server). */
async function transcribeWithProxy(fileUri: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const audio = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const invoke = supabase.functions.invoke('voice-command', {
    body: { task: 'transcribe', audio, mimeType: 'audio/m4a', prompt },
  });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new VoiceTimeoutError('Transcription')), 18000));
  const abort = new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled'))));
  const { data, error } = (await Promise.race([invoke, timeout, abort])) as { data: any; error: any };
  if (error) {
    const status = error?.context?.status ?? error?.status;
    if (status === 404 || /not found|failed to send|relay/i.test(String(error?.message))) {
      throw new VoiceProxyUnavailableError();
    }
    throw new Error(error.message || 'Transcription failed.');
  }
  return String(data?.text || '').trim();
}

/**
 * Transcribes a recording through the `voice-command` server function, which
 * holds the speech provider's key. The app never holds a provider key.
 */
export async function transcribeAudioFile(fileUri: string, prompt: string, signal?: AbortSignal): Promise<string> {
  if (!fileUri) return '';
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || ('size' in info && (info.size ?? 0) < 600)) return '';
  } catch {}
  return transcribeWithProxy(fileUri, prompt, signal);
}

// ─── Spoken feedback ────────────────────────────────────────────────────────

export async function speakVoiceFeedback(text: string, enabled = true) {
  if (!enabled || !text) return;
  try {
    if (await Speech.isSpeakingAsync()) await Speech.stop();
    Speech.speak(text, { language: 'en', rate: 1.0, pitch: 1.0 });
  } catch {}
}

export async function stopSpeech() {
  try {
    await Speech.stop();
  } catch {}
}
