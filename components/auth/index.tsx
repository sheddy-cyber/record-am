import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '@/constants';

// ─── Step Transition ──────────────────────────────────────────────────────────
// Slide + fade between auth steps. New steps enter from the right when moving
// forward and from the left when moving back, for a smooth screen-by-screen feel.
export function useStepTransition(step: number) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const previous = useRef(step);

  useEffect(() => {
    const direction = step >= previous.current ? 1 : -1;
    previous.current = step;
    translateX.setValue(direction * 48);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [step, opacity, translateX]);

  return { opacity, transform: [{ translateX }] };
}

// ─── Step Progress Bar ────────────────────────────────────────────────────────
export function AuthProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 4,
            borderRadius: RADIUS.full,
            backgroundColor: index <= step ? COLORS.accent : 'rgba(250,250,248,0.14)',
          }}
        />
      ))}
    </View>
  );
}

// ─── Back Button ──────────────────────────────────────────────────────────────
export function AuthBackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: 40,
        height: 40,
        borderRadius: RADIUS.sm,
        backgroundColor: 'rgba(250,250,248,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name="arrow-left" size={20} color={COLORS.text.inverse} />
    </TouchableOpacity>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────
const STRENGTH = [
  { label: 'Too short', color: COLORS.danger },
  { label: 'Weak', color: COLORS.danger },
  { label: 'Fair', color: COLORS.warning },
  { label: 'Good', color: COLORS.info },
  { label: 'Strong', color: COLORS.success },
];

export function scorePassword(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);
  const meta = STRENGTH[score];
  return (
    <View style={{ marginTop: -8, marginBottom: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: 3,
              borderRadius: RADIUS.full,
              backgroundColor: index < score ? meta.color : COLORS.border,
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: meta.color }}>{meta.label}</Text>
    </View>
  );
}
