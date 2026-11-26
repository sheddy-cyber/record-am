import React from 'react';
import { Image, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, IconName } from '@/components/icons';
import { PressableScale } from '@/components/ui';
import { BRAND, COLORS, FONT, PALETTE, RADIUS, SP, TYPE } from '@/constants';

type StatusBarMode = 'light' | 'dark';

const DARK_BACKGROUNDS = new Set<string>([COLORS.ink, COLORS.primary, '#0F172A', '#1E3A8A']);

// ─── Screen Shell ───────────────────────────────────────────────────────────
export function ScreenShell({
  children,
  backgroundColor = COLORS.surface,
}: {
  children: React.ReactNode;
  backgroundColor?: string;
  /** @deprecated the app is light throughout; kept for call-site compatibility. */
  statusBarStyle?: StatusBarMode;
}) {
  const insets = useSafeAreaInsets();
  const bg = DARK_BACKGROUNDS.has(backgroundColor) ? COLORS.surface : backgroundColor;
  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingBottom: insets.bottom }}>
      <StatusBar style="dark" />
      {children}
    </View>
  );
}

// ─── Brand ──────────────────────────────────────────────────────────────────
// The mark is drawn, not bitmapped, so it stays crisp at every size.
// Geometry mirrors scripts/generate-brand-assets.js.

const SQUIRCLE = (() => {
  const n = 5;
  const steps = 96;
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = 50 + 50 * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = 50 + 50 * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

export function BrandGlyph({ size = 24, color = PALETTE.clay }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="28 26 44 52">
      <Path d="M37.5 70 V50.5 C37.5 40.5 44.5 33.5 55 33.5" fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" />
      <Circle cx={62.5} cy={64.5} r={6.8} fill={color} />
    </Svg>
  );
}

export function BrandMark({
  size = 48,
  tone = 'clay',
}: {
  size?: number;
  tone?: 'clay' | 'ink' | 'paper';
  /** @deprecated */
  style?: unknown;
  /** @deprecated */
  badge?: boolean;
  /** @deprecated */
  badgeBg?: string;
}) {
  const bg = tone === 'clay' ? PALETTE.clay : tone === 'ink' ? PALETTE.ink : PALETTE.white;
  const fg = tone === 'paper' ? PALETTE.clay : '#FAF6EF';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={SQUIRCLE} fill={bg} />
      <Path
        d="M37.5 70 V50.5 C37.5 40.5 44.5 33.5 55 33.5"
        transform="translate(50 52) scale(1.18) translate(-50 -52)"
        fill="none"
        stroke={fg}
        strokeWidth={11}
        strokeLinecap="round"
      />
      <Circle cx={62.5} cy={64.5} r={6.8} fill={fg} transform="translate(50 52) scale(1.18) translate(-50 -52)" />
    </Svg>
  );
}

export function BrandWordmark({
  size = 24,
  showTagline = false,
  invert = false,
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
          fontFamily: FONT.display,
          color: invert ? COLORS.text.inverse : COLORS.text.primary,
          letterSpacing: -size * 0.025,
        }}
      >
        {BRAND.name}
      </Text>
      {showTagline ? (
        <Text style={{ ...TYPE.caption, color: invert ? 'rgba(250,249,246,0.6)' : COLORS.text.muted, marginTop: 2 }}>
          {BRAND.tagline}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Business Avatar ────────────────────────────────────────────────────────
export function BusinessAvatar({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  const [imageError, setImageError] = React.useState(false);
  React.useEffect(() => setImageError(false), [logoUrl]);

  const initials = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.3),
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentLight,
  };

  if (logoUrl && !imageError) {
    return (
      <View style={[frame, { backgroundColor: COLORS.card, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border }]}>
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setImageError(true)} />
      </View>
    );
  }

  return (
    <View style={frame}>
      <Text style={{ fontSize: size * 0.4, fontFamily: FONT.display, color: COLORS.accentDark }}>{initials || 'B'}</Text>
    </View>
  );
}

// ─── Screen Header ──────────────────────────────────────────────────────────
// Pushed screens get a compact bar (back · title · actions). Root screens get a
// large serif title, Apple-style, with actions aligned to the top edge.
export function ScreenHeader({
  title,
  subtitle,
  right,
  left,
  style,
  titleStyle,
  large,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  /** @deprecated headers are light throughout */
  theme?: 'dark' | 'light';
  style?: ViewStyle;
  titleStyle?: TextStyle;
  /** Force the large-title layout. Defaults to true when there is no `left` element. */
  large?: boolean;
  /** Small line shown above a large title (e.g. today's date). */
  eyebrow?: string;
}) {
  const insets = useSafeAreaInsets();
  const isLarge = large ?? !left;

  if (isLarge) {
    return (
      <View
        style={[
          { backgroundColor: COLORS.surface, paddingTop: insets.top + (left ? 4 : 10), paddingHorizontal: SP.page, paddingBottom: 14 },
          style,
        ]}
      >
        <StatusBar style="dark" />
        {left ? <View style={{ marginLeft: -6, marginBottom: 4, alignSelf: 'flex-start' }}>{left}</View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, paddingTop: 2 }}>
            {eyebrow ? (
              <Text style={{ ...TYPE.footnote, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 2 }} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text
              style={[{ ...TYPE.largeTitle, color: COLORS.text.primary }, titleStyle, { color: COLORS.text.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ ...TYPE.callout, color: COLORS.text.muted, marginTop: 2 }} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: COLORS.surface,
          paddingTop: insets.top + 6,
          paddingHorizontal: SP.page - 6,
          paddingBottom: 10,
        },
        style,
      ]}
    >
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        {left ? <View>{left}</View> : null}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text
            style={[{ fontSize: 17.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3 }, titleStyle, { color: COLORS.text.primary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
      </View>
    </View>
  );
}

// ─── Header Action Button ───────────────────────────────────────────────────
export function HeaderAction({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName;
  label?: string;
  onPress: () => void;
  /** @deprecated */
  theme?: 'dark' | 'light';
  accessibilityLabel?: string;
}) {
  const isBack = icon === 'arrow-left' || icon === 'chevron-left';
  const glyph: IconName | undefined = isBack ? 'chevron-left' : icon;
  return (
    <PressableScale
      onPress={onPress}
      activeScale={0.92}
      accessibilityLabel={accessibilityLabel ?? label ?? (isBack ? 'Back' : undefined)}
      style={{
        height: 38,
        minWidth: 38,
        paddingHorizontal: label ? 14 : 0,
        borderRadius: 19,
        backgroundColor: isBack && !label ? 'transparent' : COLORS.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {glyph ? <Icon name={glyph} size={isBack ? 24 : 17} color={COLORS.text.primary} /> : null}
      {label ? (
        <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.1 }}>{label}</Text>
      ) : null}
    </PressableScale>
  );
}

// ─── Overlay Header (modal screens) ─────────────────────────────────────────
export function OverlayHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: SP.page, paddingBottom: 12 }}>
      <StatusBar style="dark" />
      <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>
        <PressableScale
          onPress={onClose}
          activeScale={0.9}
          accessibilityLabel="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: COLORS.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={17} color={COLORS.text.secondary} />
        </PressableScale>
      </View>
      <Text style={{ ...TYPE.largeTitle, fontSize: 30, color: COLORS.text.primary }}>{title}</Text>
      {subtitle ? (
        <Text style={{ ...TYPE.callout, color: COLORS.text.muted, marginTop: 4 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

// ─── Flat Section (bordered container) ──────────────────────────────────────
export function FlatSection({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderRadius: RADIUS.lg,
          borderCurve: 'continuous',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Modal Shell ────────────────────────────────────────────────────────────
export function GlassModalShell({ children }: { children: React.ReactNode; statusBarStyle?: StatusBarMode }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar style="dark" />
      {children}
    </View>
  );
}
