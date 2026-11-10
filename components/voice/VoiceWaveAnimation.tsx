// ============================================================
// RECORD AM - Studio Audio Level Meter (Light Mode)
// Clean, hardware-inspired sound visualizer void of AI cliches
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '@/constants';

interface VoiceWaveAnimationProps {
  isListening: boolean;
  audioLevel: number; // 0 to 1
  size?: number;
}

export const VoiceWaveAnimation: React.FC<VoiceWaveAnimationProps> = ({
  isListening,
  audioLevel,
}) => {
  // 7 vertical audio frequency bars
  const barHeights = [
    useRef(new Animated.Value(6)).current,
    useRef(new Animated.Value(10)).current,
    useRef(new Animated.Value(16)).current,
    useRef(new Animated.Value(22)).current,
    useRef(new Animated.Value(16)).current,
    useRef(new Animated.Value(10)).current,
    useRef(new Animated.Value(6)).current,
  ];

  useEffect(() => {
    if (!isListening) {
      barHeights.forEach((b) => {
        Animated.timing(b, {
          toValue: 6,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    // Dynamic scale driven by audioLevel (normalized 0 to 1)
    const factor = Math.max(0.2, Math.min(1.0, audioLevel || 0.4));
    const targetHeights = [
      8 + factor * 14,
      12 + factor * 22,
      18 + factor * 28,
      24 + factor * 32,
      18 + factor * 28,
      12 + factor * 20,
      8 + factor * 12,
    ];

    const anims = barHeights.map((bar, i) =>
      Animated.spring(bar, {
        toValue: targetHeights[i],
        friction: 5,
        tension: 80,
        useNativeDriver: false,
      })
    );

    Animated.parallel(anims).start();
  }, [isListening, audioLevel]);

  return (
    <View style={styles.meterContainer}>
      {barHeights.map((barAnim, idx) => {
        const isCenter = idx === 3;
        return (
          <Animated.View
            key={idx}
            style={[
              styles.bar,
              {
                height: barAnim,
                backgroundColor: isListening
                  ? isCenter
                    ? COLORS.ink
                    : '#3B82F6'
                  : '#CBD5E1',
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  meterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bar: {
    width: 3.5,
    minHeight: 6,
    maxHeight: 38,
    borderRadius: 2,
  },
});
