import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';

// ─── Step Transition ──────────────────────────────────────────────────────────
// Slide + fade between steps: forward enters from the right, back from the left.
export function useStepTransition(step: number) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const previous = useRef(step);
  const mounted = useRef(false);

  useEffect(() => {
    // No entry animation on first mount: a native-driver animation started
    // during a navigation mount can fail to commit and leave content invisible.
    if (!mounted.current) {
      mounted.current = true;
      previous.current = step;
      return;
    }
    const direction = step >= previous.current ? 1 : -1;
    previous.current = step;
    translateX.setValue(direction * 32);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, speed: 22, bounciness: 0, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [step, opacity, translateX]);

  return { opacity, transform: [{ translateX }] };
}

// ─── Step Progress ────────────────────────────────────────────────────────────
export function AuthProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 3,
            borderRadius: RADIUS.full,
            backgroundColor: index <= step ? COLORS.text.primary : COLORS.borderDark,
          }}
        />
      ))}
    </View>
  );
}

// ─── Back Button ──────────────────────────────────────────────────────────────
export function AuthBackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        marginLeft: -8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Icon name="chevron-left" size={26} color={COLORS.text.primary} />
    </Pressable>
  );
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────
// Every pre-app screen shares one shape: a quiet top bar, a serif headline,
// one short sentence, the form, and a footer line.
export function AuthScaffold({
  title,
  subtitle,
  eyebrow,
  onBack,
  topRight,
  progress,
  showMark = false,
  notice,
  children,
  footer,
  contentStyle,
}: {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: string;
  onBack?: () => void;
  topRight?: React.ReactNode;
  progress?: { step: number; total: number };
  showMark?: boolean;
  notice?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: SP.xl, paddingTop: insets.top + 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          {onBack ? <AuthBackButton onPress={onBack} /> : <View />}
          {topRight}
        </View>

        {progress ? (
          <View style={{ marginTop: 6 }}>
            <AuthProgress step={progress.step} total={progress.total} />
          </View>
        ) : null}

        <View style={{ marginTop: showMark ? 20 : 28, marginBottom: 28 }}>
          {showMark ? (
            <View style={{ marginBottom: 28 }}>
              <BrandMark size={52} />
            </View>
          ) : null}
          {eyebrow ? (
            <Text style={{ ...TYPE.footnote, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 8 }}>{eyebrow}</Text>
          ) : null}
          <Text style={{ ...TYPE.largeTitle, color: COLORS.text.primary }}>{title}</Text>
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <Text style={{ ...TYPE.body, fontSize: 16, lineHeight: 23, color: COLORS.text.secondary, marginTop: 10 }}>
                {subtitle}
              </Text>
            ) : (
              <View style={{ marginTop: 10 }}>{subtitle}</View>
            )
          ) : null}
          {notice ? <View style={{ marginTop: 18 }}>{notice}</View> : null}
        </View>

        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>

        {footer ? <View style={{ marginTop: 28, alignItems: 'center' }}>{footer}</View> : null}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

/** "Already have an account? Sign in" style footer line. */
export function AuthFooterLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <Text style={{ ...TYPE.callout, fontSize: 14.5, color: COLORS.text.muted }}>{prompt} </Text>
      <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ fontSize: 14.5, fontFamily: FONT.semiBold, color: COLORS.text.primary }}>{action}</Text>
      </Pressable>
    </View>
  );
}

/** Soft inline notice used for offline / info states on auth screens. */
export function AuthNotice({ tone = 'info', icon = 'info', text }: { tone?: 'info' | 'danger'; icon?: 'info' | 'wifi-off'; text: string }) {
  const bg = tone === 'danger' ? COLORS.dangerLight : COLORS.surface2;
  const fg = tone === 'danger' ? COLORS.dangerText : COLORS.text.secondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: bg, borderRadius: 14, padding: 12 }}>
      <Icon name={icon} size={17} color={fg} />
      <Text style={{ flex: 1, ...TYPE.callout, color: fg }}>{text}</Text>
    </View>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────
const STRENGTH = [
  { label: 'Too short', color: COLORS.danger },
  { label: 'Weak', color: COLORS.danger },
  { label: 'Fair', color: COLORS.warning },
  { label: 'Good', color: COLORS.success },
  { label: 'Strong', color: COLORS.success },
];

export function scorePassword(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);
  const meta = STRENGTH[score];
  return (
    <View style={{ marginTop: -6, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={{ flex: 1, height: 3, borderRadius: RADIUS.full, backgroundColor: index < score ? meta.color : COLORS.border }}
          />
        ))}
      </View>
      <Text style={{ ...TYPE.footnote, fontFamily: FONT.medium, color: meta.color, minWidth: 60, textAlign: 'right' }}>{meta.label}</Text>
    </View>
  );
}
