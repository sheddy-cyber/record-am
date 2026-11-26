// ============================================================
// RECORD AM - Voice sheet
// Speak (or type) one thing that happened in the shop; check the preview;
// save. Recording ends by itself when you stop talking.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/icons';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { Button, SegmentedControl } from '@/components/ui';
import { COLORS, FONT, TYPE } from '@/constants';
import { openVoiceActionInForm } from '@/lib/voice/handoff';
import { haptics } from '@/lib/haptics';
import { useVoiceStore } from '@/store/voiceStore';
import { VoiceActionCard } from './VoiceActionCard';
import { VoiceWaveAnimation } from './VoiceWaveAnimation';

const EXAMPLES = [
  'Sold two Peak Milk to Chidi, cash',
  'Mama Ngozi paid 5k for her debt',
  'Restock 24 Coke at 280 each',
  'Paid 15,000 for shop rent by transfer',
  'Three eggs broke this morning',
];

export function VoiceControlModal() {
  const isOpen = useVoiceStore((s) => s.isOpen);
  const state = useVoiceStore((s) => s.state);
  const transcription = useVoiceStore((s) => s.transcription);
  const action = useVoiceStore((s) => s.action);
  const error = useVoiceStore((s) => s.error);
  const heardSpeech = useVoiceStore((s) => s.heardSpeech);
  const seconds = useVoiceStore((s) => s.recordingSeconds);
  const autoConfirmSeconds = useVoiceStore((s) => s.autoConfirmSeconds);
  const autoPaused = useVoiceStore((s) => s.isAutoConfirmPaused);

  const { close, startListening, stopListening, processText, confirmAction, pauseAutoConfirm, saveApiKeyAndTranscribe } =
    useVoiceStore.getState();

  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [provider, setProvider] = useState<'groq' | 'gemini'>('groq');
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const exampleIndex = useRef(Math.floor(Math.random() * EXAMPLES.length));

  // Reset local UI each time the sheet opens.
  useEffect(() => {
    if (isOpen) {
      setTyping(false);
      setText('');
      exampleIndex.current = (exampleIndex.current + 1) % EXAMPLES.length;
    }
  }, [isOpen]);

  // Optional auto-save countdown (Settings → Voice). Any touch on the preview pauses it.
  useEffect(() => {
    if (state !== 'preview' || autoConfirmSeconds <= 0 || autoPaused) {
      setCountdown(0);
      return;
    }
    setCountdown(autoConfirmSeconds);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          void confirmAction();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, autoConfirmSeconds, autoPaused, action, confirmAction]);

  const listening = state === 'listening';
  const thinking = state === 'processing';
  const previewing = (state === 'preview' || state === 'executing') && action && action.type !== 'UNKNOWN';
  const done = state === 'completed';
  const failed = state === 'error';
  const needsKey = state === 'needs_key';

  const header = (() => {
    if (listening) return { title: 'Listening', subtitle: heardSpeech ? 'Pause when you’re done. I’ll stop on my own.' : 'Say what happened, in your own words.' };
    if (thinking) return { title: 'One moment', subtitle: 'Working out what to record' };
    if (previewing) return { title: 'Check, then save', subtitle: 'Nothing is recorded until you tap Save.' };
    if (done) return { title: 'Saved', subtitle: undefined };
    if (failed) return { title: 'Let’s try that again', subtitle: undefined };
    if (needsKey) return { title: 'Set up voice', subtitle: 'A one-time step before your first command.' };
    return { title: 'Voice', subtitle: 'Tap the mic and speak.' };
  })();

  const submitText = (value?: string) => {
    const t = (value ?? text).trim();
    if (!t) return;
    setText('');
    setTyping(false);
    void processText(t);
  };

  const editTranscript = () => {
    setText(transcription);
    setTyping(true);
  };

  // Buttons live in the sheet's pinned footer, so they stay above the
  // navigation bar and keyboard however long the content gets.
  const controls =
    previewing && action ? (
      <View style={styles.footer}>
        <Button
          title="Edit"
          variant="secondary"
          size="lg"
          style={{ flex: 1 }}
          disabled={state === 'executing'}
          onPress={() => {
            close();
            openVoiceActionInForm(action);
          }}
        />
        <Button
          title={countdown > 0 ? `Save · ${countdown}` : 'Save'}
          size="lg"
          style={{ flex: 1.6 }}
          loading={state === 'executing'}
          onPress={() => void confirmAction()}
        />
      </View>
    ) : !done && !needsKey ? (
      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            haptics.selection();
            if (listening) useVoiceStore.getState().cancelListening();
            if (listening) useVoiceStore.setState({ state: 'idle' });
            setTyping((v) => !v);
          }}
          style={({ pressed }) => [styles.sideKey, pressed && { opacity: 0.6 }]}
          accessibilityLabel={typing ? 'Use voice' : 'Type instead'}
        >
          <Icon name={typing ? 'mic' : 'keyboard'} size={20} color={COLORS.text.primary} />
        </Pressable>

        <Pressable
          disabled={thinking}
          onPress={() => {
            if (listening) void stopListening();
            else {
              setTyping(false);
              void startListening();
            }
          }}
          style={({ pressed }) => [
            styles.mainKey,
            listening && { backgroundColor: COLORS.accent },
            thinking && { backgroundColor: COLORS.surface2 },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
          accessibilityLabel={listening ? 'Finish speaking' : 'Start speaking'}
        >
          {thinking ? (
            <ActivityIndicator color={COLORS.text.secondary} />
          ) : listening ? (
            <View style={styles.stopGlyph} />
          ) : (
            <Icon name="mic" size={26} color="#FFFFFF" strokeWidth={2} />
          )}
        </Pressable>

        <View style={styles.sideKey} />
      </View>
    ) : null;

  return (
    <BottomSheetModal visible={isOpen} onClose={close} title={header.title} subtitle={header.subtitle} maxHeight="92%" scroll={false} footer={controls}>
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onTouchStart={() => {
          if (state === 'preview' && countdown > 0) pauseAutoConfirm();
        }}
      >
        {/* ── Listening / thinking ─────────────────────────────────── */}
        {(listening || thinking) && !typing ? (
          <View style={styles.stage}>
            <VoiceWaveAnimation mode={thinking ? 'thinking' : 'listening'} />
            {thinking && transcription ? (
              <Text style={styles.quote}>“{transcription}”</Text>
            ) : listening && !heardSpeech ? (
              <Text style={styles.hint}>For example: “{EXAMPLES[exampleIndex.current]}”</Text>
            ) : (
              <Text style={[styles.hint, { fontVariant: ['tabular-nums'] }]}>0:{String(seconds).padStart(2, '0')}</Text>
            )}
          </View>
        ) : null}

        {/* ── Preview ──────────────────────────────────────────────── */}
        {previewing && action ? (
          <View style={{ gap: 12 }}>
            {transcription ? (
              <Pressable onPress={editTranscript} style={({ pressed }) => [styles.heard, pressed && { opacity: 0.6 }]}>
                <Text style={styles.heardText} numberOfLines={2}>
                  “{transcription}”
                </Text>
                <Icon name="edit-2" size={14} color={COLORS.text.muted} />
              </Pressable>
            ) : null}
            <VoiceActionCard action={action} />
          </View>
        ) : null}

        {/* ── Done ─────────────────────────────────────────────────── */}
        {done ? (
          <View style={[styles.stage, { paddingVertical: 28 }]}>
            <View style={styles.doneBadge}>
              <Icon name="check" size={28} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          </View>
        ) : null}

        {/* ── Error ────────────────────────────────────────────────── */}
        {failed ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.errorText}>{error}</Text>
            {transcription ? (
              <Pressable onPress={editTranscript} style={({ pressed }) => [styles.heard, pressed && { opacity: 0.6 }]}>
                <Text style={styles.heardText} numberOfLines={3}>
                  I heard “{transcription}”
                </Text>
                <Icon name="edit-2" size={14} color={COLORS.text.muted} />
              </Pressable>
            ) : null}
            {!typing ? (
              <View style={styles.examples}>
                <Text style={styles.examplesTitle}>Things you can say</Text>
                {EXAMPLES.slice(0, 4).map((ex) => (
                  <Pressable key={ex} onPress={() => submitText(ex)} style={({ pressed }) => [styles.example, pressed && { opacity: 0.55 }]}>
                    <Text style={styles.exampleText}>{ex}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── One-time setup ───────────────────────────────────────── */}
        {needsKey ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.body}>
              Voice turns speech into text with a speech service. Ask whoever manages Record Am for your business to switch on the
              voice service, or paste your own free key below.
            </Text>
            <SegmentedControl
              value={provider}
              onChange={setProvider}
              options={[
                { value: 'groq', label: 'Groq (recommended)' },
                { value: 'gemini', label: 'Google Gemini' },
              ]}
            />
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder={provider === 'groq' ? 'gsk_…' : 'AIza…'}
              placeholderTextColor={COLORS.text.faint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.keyInput}
            />
            <Button
              title="Save and continue"
              loading={savingKey}
              disabled={!apiKey.trim()}
              onPress={async () => {
                setSavingKey(true);
                try {
                  await saveApiKeyAndTranscribe(provider, apiKey);
                  setApiKey('');
                } finally {
                  setSavingKey(false);
                }
              }}
            />
          </View>
        ) : null}

        {/* ── Typed command ────────────────────────────────────────── */}
        {typing ? (
          <View style={{ marginTop: previewing || failed ? 14 : 0, gap: 10 }}>
            <View style={styles.typeRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="e.g. Sold 3 Milo to Ada, transfer"
                placeholderTextColor={COLORS.text.faint}
                autoFocus
                multiline
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={() => submitText()}
                style={styles.typeInput}
              />
              <Pressable
                onPress={() => submitText()}
                disabled={!text.trim()}
                style={({ pressed }) => [styles.send, !text.trim() && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Send"
              >
                <Icon name="arrow-up" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', paddingTop: 14, paddingBottom: 6, gap: 18, minHeight: 150 },
  quote: {
    fontSize: 22,
    lineHeight: 29,
    fontFamily: FONT.displayRegular,
    color: COLORS.text.primary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  hint: { ...TYPE.callout, color: COLORS.text.muted, textAlign: 'center', paddingHorizontal: 16 },
  heard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  heardText: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: FONT.displayRegular, color: COLORS.text.secondary },
  doneBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { fontSize: 15.5, lineHeight: 22, fontFamily: FONT.regular, color: COLORS.text.primary },
  body: { ...TYPE.body, color: COLORS.text.secondary },
  examples: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  examplesTitle: { fontSize: 12.5, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 4 },
  example: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  exampleText: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.primary },
  keyInput: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  typeInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    minHeight: 34,
    maxHeight: 110,
    paddingTop: 8,
    paddingBottom: 6,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 12 },
  sideKey: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  mainKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopGlyph: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#FFFFFF' },
});
