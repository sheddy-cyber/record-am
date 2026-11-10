// ============================================================
// RECORD AM - Voice Trigger Button (Upwork/Figma Style)
// Precision floating dock button void of AI cliches
// ============================================================

import React from 'react';
import { TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useVoiceStore } from '@/store/voiceStore';
import { COLORS, FONT, RADIUS } from '@/constants';

interface VoiceFloatingButtonProps {
  label?: string;
  style?: object;
  variant?: 'fab' | 'pill' | 'header';
}

export const VoiceFloatingButton: React.FC<VoiceFloatingButtonProps> = ({
  label = 'Dictate',
  style,
  variant = 'fab',
}) => {
  const open = useVoiceStore((s) => s.open);

  if (variant === 'header') {
    return (
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.7}
        style={[styles.headerButton, style]}
      >
        <Feather name="mic" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    );
  }

  if (variant === 'pill') {
    return (
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.8}
        style={[styles.pillButton, style]}
      >
        <Feather name="mic" size={14} color={COLORS.ink} />
        <Text style={styles.pillLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }

  // Default Floating Dock Tool
  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.85}
      style={[styles.fabWrapper, style]}
    >
      <View style={styles.fabInner}>
        <Feather name="mic" size={20} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fabWrapper: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    zIndex: 99,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  fabInner: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.ink, // Navigation menu bar deep steel azure brand
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FACC15',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
  },
  pillLabel: {
    fontSize: 12,
    fontFamily: FONT.semiBold,
    color: COLORS.ink,
    letterSpacing: 0.3,
  },
});
