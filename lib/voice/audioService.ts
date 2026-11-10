// ============================================================
// RECORD AM - Audio Recording & Speech Services
// ============================================================

import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface RecordingSession {
  recording: Audio.Recording;
  stop: () => Promise<string | null>;
}

/**
 * Checks and requests microphone permission.
 */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const perm = await Audio.getPermissionsAsync();
    if (perm.granted) return true;

    const req = await Audio.requestPermissionsAsync();
    return req.granted;
  } catch (err) {
    console.warn('[AudioService] permission error:', err);
    return false;
  }
}

/**
 * Starts audio recording with metering and duration callbacks.
 */
export async function startAudioRecording(
  onMeteringUpdate?: (metering: number) => void,
): Promise<RecordingSession | null> {
  const hasPermission = await requestMicPermission();
  if (!hasPermission) {
    throw new Error('Microphone permission denied. Please allow microphone access in your device settings.');
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
    });

    const recordingOptions: Audio.RecordingOptions = {
      isMeteringEnabled: true,
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.m4a',
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
      },
    };

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(recordingOptions);

    if (onMeteringUpdate) {
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          // Metering is in dB from -160 to 0. Normalize to 0..1
          const norm = Math.max(0, Math.min(1, (status.metering + 70) / 70));
          onMeteringUpdate(norm);
        }
      });
      await recording.setProgressUpdateInterval(100);
    }

    await recording.startAsync();

    return {
      recording,
      stop: async () => {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording) {
            await recording.stopAndUnloadAsync();
          }
          const uri = recording.getURI();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
          return uri;
        } catch (e) {
          console.warn('[AudioService] stop error:', e);
          return null;
        }
      },
    };
  } catch (err) {
    console.error('[AudioService] Failed to start recording:', err);
    throw err;
  }
}

/**
 * Transcribes audio via Gemini Multimodal API (supports raw audio direct from device)
 */
export async function transcribeAudioWithGemini(
  fileUri: string,
  apiKey: string,
): Promise<string> {
  const base64Audio = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mp4',
                data: base64Audio,
              },
            },
            {
              text: 'Listen to this audio snippet recorded by a retail shopkeeper. Transcribe the merchant command word-for-word. Return ONLY the transcribed text, without any explanations or quotation marks.',
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini transcription failed: ${errorText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Transcribes audio via Groq Whisper or OpenAI Whisper
 */
export async function transcribeAudioWithWhisper(
  fileUri: string,
  apiKey: string,
  provider: 'groq' | 'openai' = 'groq',
): Promise<string> {
  const endpoint =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';

  const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

  const formData = new FormData();
  const filename = fileUri.split('/').pop() || 'recording.m4a';

  // @ts-ignore - React Native FormData expects uri, name, type
  formData.append('file', {
    uri: Platform.OS === 'android' ? fileUri : fileUri.replace('file://', ''),
    name: filename,
    type: 'audio/m4a',
  });
  formData.append('model', model);
  formData.append('language', 'en');
  formData.append(
    'prompt',
    'Record Am shop transactions. Keywords: sold, sale, stock, restock, debt, owes, expense, cash, transfer, pos, naira.',
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper transcription failed: ${errorText}`);
  }

  const result = await response.json();
  return (result.text || '').trim();
}

/**
 * Unified transcribe function checking all available providers
 */
export async function transcribeAudioFile(
  fileUri: string,
  keys: { groqKey?: string; geminiKey?: string; openaiKey?: string },
): Promise<string> {
  if (!fileUri) return '';

  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || ('size' in fileInfo && fileInfo.size < 500)) {
      return '';
    }
  } catch (e) {
    console.warn('[AudioService] File check info warning:', e);
  }

  if (keys.groqKey) {
    return transcribeAudioWithWhisper(fileUri, keys.groqKey, 'groq');
  }
  if (keys.geminiKey) {
    return transcribeAudioWithGemini(fileUri, keys.geminiKey);
  }
  if (keys.openaiKey) {
    return transcribeAudioWithWhisper(fileUri, keys.openaiKey, 'openai');
  }
  throw new Error('No API key configured for speech recognition.');
}

/**
 * Speaks confirmation to user using device TTS.
 */
export async function speakVoiceFeedback(text: string, enabled = true) {
  if (!enabled || !text) return;

  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }

    Speech.speak(text, {
      language: 'en',
      rate: 1.0,
      pitch: 1.0,
    });
  } catch {}
}

/**
 * Stops any active speech.
 */
export async function stopSpeech() {
  try {
    await Speech.stop();
  } catch {}
}
