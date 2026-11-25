import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Icon, IconName } from '@/components/icons';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { haptics } from '@/lib/haptics';

export * from './RoleGate';
export * from './PermissionDenied';
export * from './GlobalDialog';
export * from './ConfirmationModal';
export * from './BottomSheetModal';
export { confirmModal, showAlertDialog, useConfirmModal } from '@/store/alertStore';

type AnyStyle = StyleProp<ViewStyle> | ViewStyle[];

// ─── Press feedback ─────────────────────────────────────────────────────────
// One shared press curve for every tappable surface: a quick dip on touch-down
// (so the UI answers before the finger lifts) and a soft spring back.

function usePressAnimation(activeScale: number, activeOpacity: number) {
  const progress = useRef(new Animated.Value(0)).current;
  const pressIn = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 60,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(progress, {
      toValue: 0,
      speed: 36,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };
  const animatedStyle = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, activeOpacity] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, activeScale] }) }],
  };
  return { pressIn, pressOut, animatedStyle };
}

function splitFlex(style: AnyStyle) {
  const flat = (StyleSheet.flatten(style as StyleProp<ViewStyle>) || {}) as ViewStyle;
  const outer: ViewStyle = {};
  if (flat.flex !== undefined) outer.flex = flat.flex;
  if (flat.alignSelf !== undefined) outer.alignSelf = flat.alignSelf;
  if (flat.width !== undefined) outer.width = flat.width;
  return { flat, outer, hasFlex: flat.flex !== undefined };
}

// ─── PressableScale ─────────────────────────────────────────────────────────

export interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  activeScale?: number;
  activeOpacity?: number;
  disabled?: boolean;
  haptic?: boolean;
  style?: AnyStyle;
  containerStyle?: AnyStyle;
  accessibilityLabel?: string;
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  onLongPress,
  activeScale = 0.97,
  activeOpacity = 0.85,
  disabled = false,
  haptic = false,
  style,
  containerStyle,
  accessibilityLabel,
}) => {
  const { pressIn, pressOut, animatedStyle } = usePressAnimation(activeScale, activeOpacity);
  const { outer, hasFlex } = splitFlex(style);

  return (
    <Pressable
      onPress={() => {
        if (haptic) haptics.tap();
        onPress?.();
      }}
      onLongPress={onLongPress}
      onPressIn={disabled ? undefined : pressIn}
      onPressOut={disabled ? undefined : pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[outer, containerStyle as StyleProp<ViewStyle>]}
    >
      <Animated.View style={[style as StyleProp<ViewStyle>, hasFlex && { width: '100%' }, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

// ─── Button ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent' | 'tinted';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: IconName;
  haptic?: boolean;
}

const BUTTON_THEME: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: COLORS.ink, fg: '#FFFFFF' },
  accent: { bg: COLORS.accent, fg: '#FFFFFF' },
  secondary: { bg: COLORS.card, fg: COLORS.text.primary, border: COLORS.border },
  tinted: { bg: COLORS.surface2, fg: COLORS.text.primary },
  ghost: { bg: 'transparent', fg: COLORS.text.primary },
  danger: { bg: COLORS.danger, fg: '#FFFFFF' },
  success: { bg: COLORS.success, fg: '#FFFFFF' },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  haptic,
}) => {
  const theme = BUTTON_THEME[variant] ?? BUTTON_THEME.primary;
  const heights = { sm: 38, md: 48, lg: 54 };
  const paddings = { sm: 14, md: 20, lg: 24 };
  const fontSizes = { sm: 14, md: 15.5, lg: 16.5 };
  const radii = { sm: 11, md: 14, lg: 16 };
  const inactive = disabled || loading;
  const { pressIn, pressOut, animatedStyle } = usePressAnimation(0.97, 0.88);
  const { outer, hasFlex } = splitFlex(style);

  return (
    <Pressable
      onPress={() => {
        if (haptic ?? (variant === 'primary' || variant === 'accent')) haptics.tap();
        onPress();
      }}
      onPressIn={inactive ? undefined : pressIn}
      onPressOut={inactive ? undefined : pressOut}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={outer}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: radii[size],
            borderCurve: 'continuous',
            minHeight: heights[size],
            paddingHorizontal: paddings[size],
            backgroundColor: theme.bg,
            borderWidth: theme.border ? 1 : 0,
            borderColor: theme.border,
            opacity: disabled ? 0.4 : 1,
          },
          style,
          hasFlex && { width: '100%' },
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={theme.fg} size="small" />
        ) : icon ? (
          <Icon name={icon} size={fontSizes[size] + 2} color={theme.fg} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            {
              fontSize: fontSizes[size],
              fontFamily: FONT.semiBold,
              color: theme.fg,
              letterSpacing: -0.2,
            },
            textStyle,
          ]}
        >
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// ─── IconButton ─────────────────────────────────────────────────────────────

export const IconButton: React.FC<{
  icon: IconName;
  onPress: () => void;
  size?: number;
  variant?: 'plain' | 'tinted' | 'filled' | 'outline';
  color?: string;
  badge?: number | boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
}> = ({ icon, onPress, size = 38, variant = 'tinted', color, badge, accessibilityLabel, disabled, style }) => {
  const bg =
    variant === 'filled' ? COLORS.ink : variant === 'tinted' ? COLORS.surface2 : variant === 'outline' ? COLORS.card : 'transparent';
  const fg = color ?? (variant === 'filled' ? '#FFFFFF' : COLORS.text.primary);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      activeScale={0.9}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: COLORS.border,
          opacity: disabled ? 0.4 : 1,
        },
        style as ViewStyle,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: typeof badge === 'number' ? 17 : 10,
            height: typeof badge === 'number' ? 17 : 10,
            paddingHorizontal: typeof badge === 'number' ? 4 : 0,
            borderRadius: 9,
            backgroundColor: COLORS.accent,
            borderWidth: 2,
            borderColor: COLORS.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {typeof badge === 'number' ? (
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: FONT.semiBold }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
};

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: AnyStyle;
  onPress?: () => void;
  variant?: 'default' | 'muted' | 'flat' | 'interactive';
}

export const Card: React.FC<CardProps> = ({ children, style, onPress, variant = 'default' }) => {
  const baseStyle: ViewStyle = {
    backgroundColor: variant === 'muted' ? COLORS.surface2 : COLORS.card,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    borderWidth: variant === 'muted' ? 0 : StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SP.card,
  };

  if (onPress) {
    return (
      <PressableScale onPress={onPress} activeScale={0.985} activeOpacity={0.92} style={[baseStyle, style as ViewStyle]}>
        {children}
      </PressableScale>
    );
  }

  return <View style={[baseStyle, style as StyleProp<ViewStyle>]}>{children}</View>;
};

// ─── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  subtext?: string;
  trend?: number;
  onPress?: () => void;
  style?: ViewStyle;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  iconColor = COLORS.text.secondary,
  iconBg = COLORS.surface2,
  subtext,
  trend,
  onPress,
  style,
}) => (
  <Card onPress={onPress} style={style ? [{ flex: 1 }, style] : { flex: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ ...TYPE.footnote, color: COLORS.text.muted, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={15} color={iconColor} />
      </View>
    </View>
    <Text style={{ ...TYPE.stat, color: COLORS.text.primary }} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    {subtext ? (
      <Text style={{ ...TYPE.footnote, color: COLORS.text.muted, marginTop: 4 }} numberOfLines={2}>
        {subtext}
      </Text>
    ) : null}
    {trend !== undefined ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <Icon
          name={trend >= 0 ? 'trending-up' : 'trending-down'}
          size={13}
          color={trend >= 0 ? COLORS.success : COLORS.danger}
        />
        <Text
          style={{
            fontSize: 12,
            fontFamily: FONT.medium,
            color: trend >= 0 ? COLORS.successText : COLORS.dangerText,
            fontVariant: ['tabular-nums'],
          }}
        >
          {Math.abs(trend).toFixed(1)}%
        </Text>
      </View>
    ) : null}
  </Card>
);

// ─── Chips & badges ─────────────────────────────────────────────────────────

export type SmartChipVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';

const TONES: Record<SmartChipVariant, { bg: string; text: string; dot: string }> = {
  neutral: { bg: COLORS.surface2, text: COLORS.text.secondary, dot: COLORS.text.muted },
  success: { bg: COLORS.successLight, text: COLORS.successText, dot: COLORS.success },
  warning: { bg: COLORS.warningLight, text: COLORS.warningText, dot: COLORS.warning },
  danger: { bg: COLORS.dangerLight, text: COLORS.dangerText, dot: COLORS.danger },
  info: { bg: COLORS.infoLight, text: COLORS.infoText, dot: COLORS.info },
  accent: { bg: COLORS.accentLight, text: COLORS.accentDark, dot: COLORS.accent },
  primary: { bg: COLORS.ink, text: '#FFFFFF', dot: '#FFFFFF' },
};

export interface SmartChipProps {
  label: string;
  dot?: boolean;
  /** Kept for compatibility: renders the stronger, dotted style. */
  deep?: boolean;
  dotColor?: string;
  icon?: IconName;
  variant?: SmartChipVariant;
  size?: 'xs' | 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const SmartChip: React.FC<SmartChipProps> = ({
  label,
  dot = false,
  deep = false,
  dotColor,
  icon,
  variant = 'neutral',
  size = 'sm',
  style,
  textStyle,
}) => {
  const t = TONES[variant] ?? TONES.neutral;
  const showDot = (dot || deep) && !icon && variant !== 'primary';
  const textSize = size === 'xs' ? 10.5 : size === 'sm' ? 11.5 : 12.5;
  const padH = size === 'xs' ? 7 : size === 'sm' ? 9 : 11;
  const padV = size === 'xs' ? 2.5 : size === 'sm' ? 3.5 : 5;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.bg,
          borderRadius: RADIUS.full,
          paddingHorizontal: padH,
          paddingVertical: padV,
          gap: 5,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={textSize + 1.5} color={t.text} /> : null}
      {showDot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor ?? t.dot }} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          { fontSize: textSize, fontFamily: FONT.medium, color: t.text, letterSpacing: 0.05 },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

type BadgeVariant = SmartChipVariant;

export const Badge: React.FC<{ label: string; variant?: BadgeVariant; size?: 'sm' | 'md' }> = ({
  label,
  variant = 'neutral',
  size = 'md',
}) => <SmartChip label={label} variant={variant} size={size === 'sm' ? 'xs' : 'sm'} />;

// ─── Divider ────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ style?: ViewStyle; inset?: number }> = ({ style, inset = 0 }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: inset }, style]} />
);

// ─── Empty State ────────────────────────────────────────────────────────────

export const EmptyState: React.FC<{
  icon: IconName;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  compact?: boolean;
}> = ({ icon, title, description, action, compact }) => (
  <View
    style={{
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: compact ? 24 : 48,
      paddingHorizontal: 32,
    }}
  >
    <View
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: COLORS.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
      }}
    >
      <Icon name={icon} size={22} color={COLORS.text.muted} />
    </View>
    <Text style={{ ...TYPE.h3, color: COLORS.text.primary, textAlign: 'center' }}>{title}</Text>
    {description ? (
      <Text
        style={{
          ...TYPE.callout,
          color: COLORS.text.muted,
          textAlign: 'center',
          marginTop: 6,
          maxWidth: 300,
        }}
      >
        {description}
      </Text>
    ) : null}
    {action ? (
      <Button title={action.label} onPress={action.onPress} size="sm" variant="secondary" style={{ marginTop: 18 }} />
    ) : null}
  </View>
);

// ─── Loading ────────────────────────────────────────────────────────────────
// Stays blank for the first beat: most loads finish before a spinner would
// help, and a flash of spinner reads as slowness.

export const LoadingScreen: React.FC<{ message?: string; delay?: number }> = ({ message, delay = 350 }) => {
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface }}>
      {visible ? <ActivityIndicator size="small" color={COLORS.text.muted} /> : null}
      {visible && message ? (
        <Text style={{ marginTop: 12, ...TYPE.caption, color: COLORS.text.muted }}>{message}</Text>
      ) : null}
    </View>
  );
};

/** Shimmering placeholder block for content that is still loading. */
export const Skeleton: React.FC<{ width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle }> = ({
  width = '100%',
  height = 14,
  radius = 7,
  style,
}) => {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: COLORS.surface2, opacity: pulse }, style]}
    />
  );
};

// ─── Section Header ─────────────────────────────────────────────────────────

export const SectionHeader: React.FC<{
  title: string;
  action?: { label: string; onPress: () => void };
  rightAction?: React.ReactNode;
  color?: string;
  style?: TextStyle;
}> = ({ title, action, rightAction, color, style }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 4,
      minHeight: 22,
    }}
  >
    <Text style={[{ fontSize: 13.5, fontFamily: FONT.semiBold, color: color || COLORS.text.secondary, letterSpacing: -0.05 }, style]}>
      {title}
    </Text>
    {rightAction ||
      (action ? (
        <Pressable onPress={action.onPress} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ fontSize: 13.5, fontFamily: FONT.medium, color: COLORS.accentDark }}>{action.label}</Text>
        </Pressable>
      ) : null)}
  </View>
);

// ─── Grouped lists (inset, Settings-style) ──────────────────────────────────

export const Group: React.FC<{ children: React.ReactNode; title?: string; footer?: string; style?: ViewStyle }> = ({
  children,
  title,
  footer,
  style,
}) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginBottom: 24 }, style]}>
      {title ? <SectionHeader title={title} /> : null}
      <View
        style={{
          backgroundColor: COLORS.card,
          borderRadius: RADIUS.lg,
          borderCurve: 'continuous',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.border,
          overflow: 'hidden',
        }}
      >
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 ? <Divider inset={56} /> : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? (
        <Text style={{ ...TYPE.footnote, color: COLORS.text.muted, marginTop: 8, paddingHorizontal: 4, lineHeight: 17 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
};

// ─── List Row ───────────────────────────────────────────────────────────────

export const ListRow: React.FC<{
  title: string;
  subtitle?: string | React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  style?: ViewStyle;
}> = ({ title, subtitle, left, right, icon, iconColor, iconBg, onPress, showChevron = true, destructive, style }) => {
  const content = (
    <>
      {left ??
        (icon ? (
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              borderCurve: 'continuous',
              backgroundColor: iconBg ?? COLORS.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={16} color={iconColor ?? (destructive ? COLORS.danger : COLORS.text.primary)} />
          </View>
        ) : null)}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontFamily: FONT.regular,
            color: destructive ? COLORS.danger : COLORS.text.primary,
            letterSpacing: -0.15,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text numberOfLines={2} style={{ ...TYPE.footnote, color: COLORS.text.muted, marginTop: 2, lineHeight: 16 }}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
      {showChevron && onPress ? <Icon name="chevron-right" size={16} color={COLORS.text.faint} /> : null}
    </>
  );
  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SP.card,
    gap: 12,
    minHeight: 52,
  };
  if (!onPress) return <View style={[rowStyle, style]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: COLORS.surface2 }}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: COLORS.surface2 }, style]}
    >
      {content}
    </Pressable>
  );
};

// ─── Icon Box ───────────────────────────────────────────────────────────────

export const IconBox: React.FC<{
  icon: IconName;
  color?: string;
  bg?: string;
  size?: number;
  box?: number;
}> = ({ icon, color = COLORS.text.primary, bg = COLORS.surface2, size = 17, box = 38 }) => (
  <View
    style={{
      width: box,
      height: box,
      borderRadius: Math.round(box * 0.3),
      borderCurve: 'continuous',
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Icon name={icon} size={size} color={color} backgroundColor={bg} />
  </View>
);

// ─── Avatar ─────────────────────────────────────────────────────────────────

const AVATAR_TONES = [
  { bg: '#F6E7DF', fg: '#9A4527' },
  { bg: '#E6F0E9', fg: '#24663F' },
  { bg: '#E3EBF3', fg: '#2F5A84' },
  { bg: '#F6EDDA', fg: '#8A5A12' },
  { bg: '#EFE7F0', fg: '#6C4A70' },
  { bg: '#EDEAE3', fg: '#57534C' },
];

export const Avatar: React.FC<{ name?: string | null; size?: number; tone?: number }> = ({ name, size = 36, tone }) => {
  const clean = (name || '').trim();
  const initials =
    clean
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase() || '·';
  const hash = tone ?? clean.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const t = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontFamily: FONT.semiBold, color: t.fg }}>{initials}</Text>
    </View>
  );
};

// ─── Segmented control ──────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: COLORS.surface2,
          borderRadius: 12,
          borderCurve: 'continuous',
          padding: 3,
        },
        style,
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!active) {
                haptics.selection();
                onChange(opt.value);
              }
            }}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 9,
              borderCurve: 'continuous',
              alignItems: 'center',
              backgroundColor: active ? COLORS.card : 'transparent',
              shadowColor: COLORS.shadow,
              shadowOpacity: active ? 0.06 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: active ? 1 : 0,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13.5,
                fontFamily: active ? FONT.semiBold : FONT.medium,
                color: active ? COLORS.text.primary : COLORS.text.secondary,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Filter pills (horizontal) ──────────────────────────────────────────────

export const Pill: React.FC<{
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
}> = ({ label, active, onPress, icon, count }) => (
  <Pressable
    onPress={() => {
      haptics.selection();
      onPress?.();
    }}
    style={({ pressed }) => ({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 17,
      backgroundColor: active ? COLORS.ink : COLORS.card,
      borderWidth: active ? 0 : StyleSheet.hairlineWidth,
      borderColor: COLORS.borderDark,
      opacity: pressed ? 0.8 : 1,
    })}
  >
    {icon ? <Icon name={icon} size={14} color={active ? '#FFFFFF' : COLORS.text.secondary} /> : null}
    <Text style={{ fontSize: 13.5, fontFamily: FONT.medium, color: active ? '#FFFFFF' : COLORS.text.primary }}>
      {label}
    </Text>
    {count !== undefined ? (
      <Text
        style={{
          fontSize: 12,
          fontFamily: FONT.medium,
          color: active ? 'rgba(255,255,255,0.7)' : COLORS.text.muted,
          fontVariant: ['tabular-nums'],
        }}
      >
        {count}
      </Text>
    ) : null}
  </Pressable>
);

// ─── Money ──────────────────────────────────────────────────────────────────

export const formatMoney = (value: number, decimals = 0) =>
  `${value < 0 ? '-' : ''}${CURRENCY_SYMBOL}${Math.abs(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

export const AmountDisplay: React.FC<{
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  currency?: string;
}> = ({ amount, size = 'md', color = COLORS.text.primary, currency = CURRENCY_SYMBOL }) => {
  const sizes = { sm: 14, md: 18, lg: 24, xl: 32 };
  const formatted = Math.abs(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 });
  return (
    <Text
      style={{
        fontSize: sizes[size],
        fontFamily: size === 'xl' ? FONT.serif : FONT.semiBold,
        color,
        letterSpacing: -0.3,
        fontVariant: ['tabular-nums'],
      }}
    >
      {amount < 0 ? '-' : ''}
      {currency}
      {formatted}
    </Text>
  );
};

// ─── Payment Summary ────────────────────────────────────────────────────────

export const PaymentSummary: React.FC<{
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  tone?: 'default' | 'sales' | 'purchase';
  style?: ViewStyle;
}> = ({ totalAmount, amountPaid, amountOwed, style }) => {
  const fmt = (value: number) =>
    `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const line = (label: string, value: number, color: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontFamily: FONT.medium, color, fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
    </View>
  );
  return (
    <View style={[{ minWidth: 110, alignItems: 'flex-end' }, style]}>
      <Text
        style={{
          fontSize: 16,
          fontFamily: FONT.semiBold,
          color: COLORS.text.primary,
          textAlign: 'right',
          fontVariant: ['tabular-nums'],
        }}
      >
        {fmt(totalAmount)}
      </Text>
      <View style={{ marginTop: 4, width: '100%', gap: 2 }}>
        {line('Paid', amountPaid, amountPaid > 0 ? COLORS.successText : COLORS.text.muted)}
        {line('Credit', amountOwed, amountOwed > 0 ? COLORS.dangerText : COLORS.text.muted)}
      </View>
    </View>
  );
};
