// ============================================================
// RECORD AM - Voice Command Console (Light Mode)
// Clean, tactile, and intuitive dictation void of AI cliches
// ============================================================

import React, { useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useVoiceStore, MAX_RECORDING_SECONDS } from '@/store/voiceStore';
import { VoiceWaveAnimation } from './VoiceWaveAnimation';
import { VoiceActionCard } from './VoiceActionCard';
import { COLORS, FONT, RADIUS } from '@/constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 50;

// Exactly 5 clean, uncategorized real-world commands
const EXAMPLE_COMMANDS = [
  'Sold 3 shirts 15,000 cash with 1k discount to Emeka',
  'Sold 2 shoes 40,000, 15k cash and 25k transfer',
  'Add stock of 20 flash drives, cost 10,000 and sell for 15,000',
  'Change flash drive selling price to 16,000',
  'Counted 45 malt in shop during audit',
];

export const VoiceControlModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    isOpen,
    state,
    transcription,
    audioLevel,
    recordingSeconds,
    action,
    error,
    autoConfirmSeconds,
    isAutoConfirmPaused,
    close,
    startListening,
    stopListening,
    saveApiKeyAndTranscribe,
    processText,
    confirmAction,
    pauseAutoConfirm,
    resumeAutoConfirm,
    reset,
  } = useVoiceStore();

  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<'groq' | 'gemini'>('groq');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // ── Swipe-to-dismiss via Reanimated ──
  const translateY = useSharedValue(0);

  const dismissModal = useCallback(() => {
    close();
  }, [close]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(6)
    .failOffsetX([-25, 25])
    .onUpdate((event) => {
      'worklet';
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > DISMISS_THRESHOLD || event.velocityY > 300) {
        // Smoothly glide off-screen (120ms) then close, avoiding freezing in mid-air
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 120 }, () => {
          runOnJS(dismissModal)();
        });
      } else {
        // Did not pull down enough: smoothly glide back with no bounce
        translateY.value = withTiming(0, { duration: 140 });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => {
    'worklet';
    const opacity = Math.max(0, Math.min(1, 1 - translateY.value / 80));
    return { opacity };
  });

  // Reset translateY when modal opens
  React.useEffect(() => {
    if (isOpen) {
      translateY.value = 0;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isListening = state === 'listening';
  const isProcessing = state === 'processing';
  const isPreview = state === 'preview' && action !== null;
  const isExecuting = state === 'executing';
  const isCompleted = state === 'completed';
  const isError = state === 'error';
  const isNeedsKey = state === 'needs_key';

  const handleMicPress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    const txt = textInput.trim();
    setTextInput('');
    processText(txt);
  };

  const handleSelectHint = (hint: string) => {
    processText(hint);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      await saveApiKeyAndTranscribe(selectedProvider, apiKeyInput.trim());
      setApiKeyInput('');
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        {/* Animated Dim Backdrop Overlay: fades in sync with drag */}
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.backdropOverlay, animatedBackdropStyle]}
          pointerEvents="none"
        />

        {/* Backdrop: tapping above the sheet dismisses */}
        <Pressable
          style={styles.backdropTapArea}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss voice modal"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <Animated.View
            style={[
              styles.sheetContainer,
              { paddingBottom: insets.bottom + 16 },
              animatedSheetStyle,
            ]}
          >
            {/* ── Top Drag Surface (Pill handle + Header text area) ── */}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.topDragArea}>
                <View style={styles.handleContainer}>
                  <View style={styles.sheetHandle} />
                </View>

                {/* ── Clean Header (Without status pill / ticker) ── */}
                <View style={styles.header}>
                  <Text style={styles.title}>Voice Input</Text>
                  <Text style={styles.subtitle}>
                    Dictate transactions, price changes, or inventory audits
                  </Text>
                </View>
              </Animated.View>
            </GestureDetector>

            {/* ── Close Button (Top right, outside GestureDetector) ── */}
            <TouchableOpacity
              onPress={close}
              style={styles.closeBtn}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Close voice modal"
            >
              <Feather name="x" size={17} color="#64748B" />
            </TouchableOpacity>

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                bounces={true}
                overScrollMode="always"
              >
                {/* ── Inline Error Alert (if any) ── */}
                {isError && (
                  <View style={styles.errorBanner}>
                    <Feather name="alert-circle" size={14} color="#DC2626" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* ── Setup Card: API Key Configuration ── */}
                {isNeedsKey && (
                  <View style={styles.apiKeyCard}>
                    <View style={styles.apiKeyHeader}>
                      <Feather name="terminal" size={15} color={COLORS.ink} />
                      <Text style={styles.apiKeyTitle}>Speech Recognition Setup</Text>
                    </View>
                    <Text style={styles.apiKeyDesc}>
                      Connect your free Groq Whisper or Gemini API key to transcribe speech offline or online.
                    </Text>

                    {/* Provider Tabs */}
                    <View style={styles.providerRow}>
                      <TouchableOpacity
                        onPress={() => setSelectedProvider('groq')}
                        style={[
                          styles.providerTab,
                          selectedProvider === 'groq' && styles.providerTabActive,
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.providerTabText,
                            selectedProvider === 'groq' && styles.providerTabTextActive,
                          ]}
                        >
                          Groq Whisper
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSelectedProvider('gemini')}
                        style={[
                          styles.providerTab,
                          selectedProvider === 'gemini' && styles.providerTabActive,
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.providerTabText,
                            selectedProvider === 'gemini' && styles.providerTabTextActive,
                          ]}
                        >
                          Gemini Flash
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.apiKeyInputRow}>
                      <TextInput
                        style={styles.apiKeyInput}
                        placeholder={
                          selectedProvider === 'groq'
                            ? 'Paste Groq key (gsk_...)'
                            : 'Paste Gemini key (AIza...)'
                        }
                        placeholderTextColor="#94A3B8"
                        value={apiKeyInput}
                        onChangeText={setApiKeyInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        onPress={handleSaveApiKey}
                        style={[
                          styles.saveKeyBtn,
                          (!apiKeyInput.trim() || isSavingKey) && { opacity: 0.5 },
                        ]}
                        disabled={!apiKeyInput.trim() || isSavingKey}
                        activeOpacity={0.8}
                      >
                        {isSavingKey ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.saveKeyBtnText}>Save Key</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* ── Dictation Console (When not previewing action) ── */}
                {!isPreview && !isExecuting && !isCompleted && !isNeedsKey && (
                  <View style={styles.dictationConsole}>
                    {/* Studio Audio Level Meter */}
                    <VoiceWaveAnimation
                      isListening={isListening}
                      audioLevel={audioLevel}
                    />

                    {/* Primary Dictation Trigger Button */}
                    <TouchableOpacity
                      onPress={handleMicPress}
                      activeOpacity={0.85}
                      style={[
                        styles.micButton,
                        isListening ? styles.micButtonListening : styles.micButtonIdle,
                      ]}
                    >
                      <Feather
                        name={isListening ? 'square' : 'mic'}
                        size={24}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>

                    {/* Clean Hardware Recording Timer Display */}
                    {isListening ? (
                      <View style={styles.timerBadge}>
                        <Feather name="clock" size={11} color="#DC2626" />
                        <Text style={styles.timerText}>
                          00:{String(recordingSeconds).padStart(2, '0')} / 00:{String(MAX_RECORDING_SECONDS).padStart(2, '0')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.micStatusLabel}>
                        {isProcessing ? 'Processing command...' : `Tap mic to speak (${MAX_RECORDING_SECONDS}s max)`}
                      </Text>
                    )}
                  </View>
                )}

                {/* ── Dictated Command Card (Captured text) ── */}
                {transcription ? (
                  <View style={styles.transcriptCard}>
                    <View style={styles.transcriptHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Feather name="mic" size={11} color="#64748B" />
                        <Text style={styles.transcriptLabel}>DICTATED COMMAND</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setTextInput(transcription);
                          setShowTextInput(true);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                        style={styles.transcriptEditBtn}
                      >
                        <Feather name="edit-2" size={11} color="#64748B" />
                        <Text style={styles.transcriptEditText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.transcriptText}>"{transcription}"</Text>
                  </View>
                ) : null}

                {/* ── Action Preview & Confirmation Card ── */}
                {isPreview && action && (
                  <VoiceActionCard
                    action={action}
                    onConfirm={confirmAction}
                    onCancel={reset}
                    autoConfirmSeconds={autoConfirmSeconds}
                    isPaused={isAutoConfirmPaused}
                    onTogglePause={
                      isAutoConfirmPaused ? resumeAutoConfirm : pauseAutoConfirm
                    }
                  />
                )}

                {/* ── Uncategorized Example Commands (At most 5) ── */}
                {!isPreview && !isExecuting && !isCompleted && (
                  <View style={styles.shortcutsSection}>
                    <Text style={styles.shortcutsSectionTitle}>EXAMPLE COMMANDS</Text>
                    <View style={styles.shortcutItemsList}>
                      {EXAMPLE_COMMANDS.map((cmd, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => handleSelectHint(cmd)}
                          style={styles.shortcutPill}
                          activeOpacity={0.7}
                        >
                          <Feather name="corner-down-right" size={11} color="#94A3B8" />
                          <Text style={styles.shortcutPillText} numberOfLines={1}>
                            {cmd}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Manual Command Input Bar ── */}
                <View style={styles.commandBarSection}>
                  <TouchableOpacity
                    onPress={() => setShowTextInput(!showTextInput)}
                    style={styles.toggleCommandBar}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={showTextInput ? 'chevron-up' : 'terminal'}
                      size={13}
                      color="#64748B"
                    />
                    <Text style={styles.toggleCommandBarText}>
                      {showTextInput ? 'Hide keyboard input' : 'Or type a command manually'}
                    </Text>
                  </TouchableOpacity>

                  {showTextInput && (
                    <View style={styles.commandInputRow}>
                      <TextInput
                        style={styles.commandInput}
                        placeholder="e.g. Sold 2 coke 1000 cash..."
                        placeholderTextColor="#94A3B8"
                        value={textInput}
                        onChangeText={setTextInput}
                        onSubmitEditing={handleSendText}
                        returnKeyType="send"
                        autoFocus
                      />
                      <TouchableOpacity
                        onPress={handleSendText}
                        style={[
                          styles.commandSendBtn,
                          !textInput.trim() && { opacity: 0.4 },
                        ]}
                        disabled={!textInput.trim()}
                        activeOpacity={0.8}
                      >
                        <Feather name="arrow-up" size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>
            </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  backdropOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdropTapArea: {
    flex: 1,
  },
  keyboardAvoid: {
    width: '100%',
    maxHeight: '90%',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '100%',
    paddingTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  topDragArea: {
    width: '100%',
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  closeBtn: {
    position: 'absolute',
    right: 18,
    top: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    elevation: 0,
    shadowOpacity: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingRight: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: FONT.semiBold,
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#64748B',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT.medium,
    color: '#DC2626',
  },
  dictationConsole: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  micButtonIdle: {
    backgroundColor: COLORS.ink, // Signature Deep Steel Azure brand
    borderWidth: 1,
    borderColor: 'rgba(0, 51, 92, 0.3)',
  },
  micButtonListening: {
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  micStatusLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: '#64748B',
    marginTop: 8,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 10,
  },
  timerText: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  transcriptCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  transcriptLabel: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: '#64748B',
    letterSpacing: 0.6,
  },
  transcriptEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: RADIUS.xs,
  },
  transcriptEditText: {
    fontSize: 10,
    fontFamily: FONT.semiBold,
    color: '#475569',
  },
  transcriptText: {
    fontSize: 14,
    fontFamily: FONT.medium,
    color: '#0F172A',
    lineHeight: 20,
  },
  shortcutsSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  shortcutsSectionTitle: {
    fontSize: 10,
    fontFamily: FONT.semiBold,
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  shortcutItemsList: {
    gap: 6,
  },
  shortcutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shortcutPillText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#334155',
    flex: 1,
  },
  commandBarSection: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 4,
  },
  toggleCommandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  toggleCommandBarText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  commandInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  commandInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  commandSendBtn: {
    backgroundColor: COLORS.ink,
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiKeyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  apiKeyTitle: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: '#0F172A',
  },
  apiKeyDesc: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 10,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  providerTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  providerTabActive: {
    backgroundColor: '#EFF6FF',
    borderColor: COLORS.ink,
  },
  providerTabText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  providerTabTextActive: {
    color: COLORS.ink,
    fontFamily: FONT.semiBold,
  },
  apiKeyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  apiKeyInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  saveKeyBtn: {
    backgroundColor: COLORS.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveKeyBtnText: {
    fontSize: 12,
    fontFamily: FONT.semiBold,
    color: '#FFFFFF',
  },
});
