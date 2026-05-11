import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { BRAND, COLORS, FONT, RADIUS, SHADOW, SP, TYPE } from '@/constants';

type StatusBarMode = 'light' | 'dark';

// ─── Screen Shell ───────────────────────────────────────────────────────────
// Clean full-screen container. No decorative overlays — just solid color.
export function ScreenShell({
  children,
  backgroundColor = COLORS.surface,
  statusBarStyle = 'dark',
}: {
  children: React.ReactNode;
  backgroundColor?: string;
  statusBarStyle?: StatusBarMode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}

// ─── Brand Mark (Logo) ──────────────────────────────────────────────────────
// Clean geometric monogram — a stylized "R" in a rounded square.
export function BrandMark({
  size = 36,
  accent = COLORS.accent,
  background = COLORS.ink,
}: {
  size?: number;
  accent?: string;
  background?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="12" fill={background} />
      {/* Stylized "R" */}
      <Path
        d="M16 36V12h8.5c2.2 0 3.9.6 5.1 1.7 1.2 1.1 1.9 2.7 1.9 4.6 0 1.5-.4 2.7-1.2 3.7-.8 1-1.9 1.6-3.3 1.9L32 36h-4.5l-4.5-11.5H20.5V36H16Zm4.5-15.5h4c1.1 0 2-.3 2.6-.9.6-.6.9-1.4.9-2.4 0-1-.3-1.7-.9-2.3-.6-.6-1.5-.9-2.6-.9h-4v6.5Z"
        fill={accent}
      />
    </Svg>
  );
}

// ─── Brand Wordmark ─────────────────────────────────────────────────────────
export function BrandWordmark({
  invert = false,
  size = 24,
  showTagline = false,
}: {
  invert?: boolean;
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <View>
      <Text
        style={{
          fontSize: size,
          fontFamily: FONT.bold,
          color: invert ? COLORS.text.inverse : COLORS.text.primary,
          letterSpacing: -0.3,
        }}
      >
        {BRAND.name}
      </Text>
      {showTagline ? (
        <Text
          style={{
            fontSize: 12,
            fontFamily: FONT.regular,
            color: invert ? 'rgba(248,250,252,0.55)' : COLORS.text.muted,
            marginTop: 2,
          }}
        >
          {BRAND.tagline}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Screen Header ──────────────────────────────────────────────────────────
// Clean dark header for main screens. Minimal: title + optional subtitle.
export function ScreenHeader({
  title,
  subtitle,
  right,
  left,
  theme = 'dark',
  style,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  theme?: 'dark' | 'light';
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const bg = isDark ? COLORS.ink : COLORS.card;
  const titleColor = isDark ? COLORS.text.inverse : COLORS.text.primary;
  const subtitleColor = isDark ? 'rgba(248,250,252,0.5)' : COLORS.text.muted;

  return (
    <View
      style={[
        {
          backgroundColor: bg,
          paddingTop: insets.top + 14,
          paddingHorizontal: SP.page,
          paddingBottom: 18,
          ...(isDark ? {} : SHADOW.sm),
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {left ? <View style={{ minWidth: 40 }}>{left}</View> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.h2, color: titleColor }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: subtitleColor, marginTop: 3 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View> : null}
      </View>
    </View>
  );
}

// ─── Header Action Button ───────────────────────────────────────────────────
export function HeaderAction({
  icon,
  label,
  onPress,
  theme = 'dark',
}: {
  icon?: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
  theme?: 'dark' | 'light';
}) {
  const isDark = theme === 'dark';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        minHeight: 40,
        minWidth: 40,
        paddingHorizontal: label ? 14 : 10,
        borderRadius: RADIUS.sm,
        backgroundColor: isDark ? 'rgba(248,250,252,0.08)' : COLORS.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {icon ? (
        <Feather name={icon} size={16} color={isDark ? COLORS.text.inverse : COLORS.text.primary} />
      ) : null}
      {label ? (
        <Text
          style={{
            fontSize: 13,
            fontFamily: FONT.medium,
            color: isDark ? COLORS.text.inverse : COLORS.text.primary,
          }}
        >
          {label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Overlay Header (sub-page / full-screen forms) ──────────────────────────
export function OverlayHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + 14,
        paddingHorizontal: SP.page,
        paddingBottom: 18,
        backgroundColor: COLORS.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        ...SHADOW.sm,
      }}
    >
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.7}
        style={{
          width: 40,
          height: 40,
          borderRadius: RADIUS.sm,
          backgroundColor: COLORS.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="arrow-left" size={18} color={COLORS.text.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ ...TYPE.h3, color: COLORS.text.primary }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Flat Section (bordered container) ──────────────────────────────────────
export function FlatSection({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
