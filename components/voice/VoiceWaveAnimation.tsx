// ============================================================
// RECORD AM - Live level meter
// A strip of bars that scrolls with the last ~2 seconds of mic level, the way
// a voice memo does. While the app is thinking, the bars settle into a slow
// ripple so the user knows it is still working.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { COLORS } from '@/constants';
import { useVoiceStore } from '@/store/voiceStore';

const BARS = 32;
const MIN = 4;
const MAX = 56;

export function VoiceWaveAnimation({ mode }: { mode: 'listening' | 'thinking' | 'idle' }) {
  const level = useVoiceStore((s) => s.audioLevel);
  const [history, setHistory] = useState<number[]>(() => Array(BARS).fill(0));

  useEffect(() => {
    if (mode !== 'listening') return;
    setHistory((prev) => [...prev.slice(1), level]);
  }, [level, mode]);

  useEffect(() => {
    if (mode === 'listening') setHistory(Array(BARS).fill(0));
  }, [mode]);

  if (mode === 'thinking') return <Ripple />;

  return (
    <View style={{ height: MAX, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3.5 }}>
      {history.map((v, i) => {
        // Older samples fade slightly so the eye reads the newest edge.
        const age = i / (BARS - 1);
        const h = mode === 'idle' ? MIN : Math.max(MIN, Math.round(MIN + v * (MAX - MIN)));
        return (
          <View
            key={i}
            style={{
              width: 4,
              height: h,
              borderRadius: 2,
              backgroundColor: v > 0.05 && mode === 'listening' ? COLORS.accent : COLORS.borderDark,
              opacity: 0.35 + age * 0.65,
            }}
          />
        );
      })}
    </View>
  );
}

function Ripple() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View style={{ height: MAX, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3.5 }}>
      {Array.from({ length: BARS }).map((_, i) => {
        // A gentle travelling wave: each bar is the same sine, shifted in phase.
        const phase = i / BARS;
        const samples = Array.from({ length: 9 }, (__, k) => k / 8);
        const scaleY = t.interpolate({
          inputRange: samples,
          outputRange: samples.map((x) => 1 + 1.5 * Math.max(0, Math.sin((x - phase) * Math.PI * 2))),
        });
        return (
          <Animated.View
            key={i}
            style={{
              width: 4,
              height: 8,
              borderRadius: 2,
              backgroundColor: COLORS.text.faint,
              transform: [{ scaleY }],
            }}
          />
        );
      })}
    </View>
  );
}
