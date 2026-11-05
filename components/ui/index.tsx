import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle, Modal, StyleSheet, Animated, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW, SP, TYPE } from '@/constants';

export * from './RoleGate';
export * from './PermissionDenied';
export * from './GlobalDialog';
export * from './ConfirmationModal';
export * from './BottomSheetModal';
export { confirmModal, showAlertDialog, useConfirmModal } from '@/store/alertStore';

// ─── PressableScale (Tactile Spring Physics) ─────────────────────────────────

export interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  activeScale?: number;
  activeOpacity?: number;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  containerStyle?: ViewStyle | ViewStyle[];
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  onLongPress,
  activeScale = 0.95,
  activeOpacity = 0.82,
  disabled = false,
  style,
  containerStyle,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: activeScale,
      duration: 70,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const flatStyle = StyleSheet.flatten(style) || {};
  const hasFlex = flatStyle.flex !== undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      activeOpacity={activeOpacity}
      delayPressIn={0}
      style={[
        hasFlex && { flex: flatStyle.flex },
        containerStyle,
      ]}
    >
      <Animated.View
        style={[
          style,
          hasFlex && { width: '100%' },
          { transform: [{ scale }] },
        ]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: keyof typeof Feather.glyphMap;
}

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
}) => {
  const containers: Record<ButtonVariant, ViewStyle> = {
    primary:   { backgroundColor: COLORS.ink },
    secondary: { backgroundColor: COLORS.card, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    danger:    { backgroundColor: COLORS.danger },
    ghost:     { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    success:   { backgroundColor: COLORS.success },
    accent:    { backgroundColor: COLORS.accent },
  };
  const textColors: Record<ButtonVariant, string> = {
    primary:   '#FFFFFF',
    secondary: COLORS.text.primary,
    danger:    '#FFFFFF',
    ghost:     COLORS.text.secondary,
    success:   '#FFFFFF',
    accent:    COLORS.onAccent,
  };
  const heights = { sm: 38, md: 46, lg: 52 };
  const paddings = { sm: 14, md: 20, lg: 24 };
  const fontSizes = { sm: 13, md: 14.5, lg: 15.5 };

  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 70,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const flatStyle = StyleSheet.flatten(style) || {};
  const hasFlex = flatStyle.flex !== undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={disabled || loading ? undefined : handlePressIn}
      onPressOut={disabled || loading ? undefined : handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.82}
      delayPressIn={0}
      style={[
        hasFlex && { flex: flatStyle.flex },
      ]}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: RADIUS.md,
            minHeight: heights[size],
            paddingHorizontal: paddings[size],
            opacity: disabled || loading ? 0.45 : 1,
            transform: [{ scale }],
          },
          containers[variant],
          style,
          hasFlex && { width: '100%' },
        ]}
      >
        {loading ? <ActivityIndicator color={textColors[variant]} size="small" /> : null}
        {!loading && icon ? <Feather name={icon} size={fontSizes[size] + 1} color={textColors[variant]} /> : null}
        <Text style={[{ fontSize: fontSizes[size], fontFamily: FONT.medium, color: textColors[variant], includeFontPadding: false, letterSpacing: -0.2 }, textStyle]}>
          {title}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  variant?: 'default' | 'muted' | 'flat' | 'interactive';
}

export const Card: React.FC<CardProps> = ({ children, style, onPress, variant = 'default' }) => {
  const bg = variant === 'muted' ? COLORS.surface2 : COLORS.card;
  const baseStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SP.card,
  };

  const scale = useRef(new Animated.Value(1)).current;

  if (onPress) {
    const handlePressIn = () => {
      Animated.timing(scale, {
        toValue: 0.985,
        duration: 70,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        speed: 40,
        bounciness: 6,
        useNativeDriver: true,
      }).start();
    };

    const flatStyle = StyleSheet.flatten(style) || {};
    const hasFlex = flatStyle.flex !== undefined;

    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.88}
        delayPressIn={0}
        style={[hasFlex && { flex: flatStyle.flex }]}
      >
        <Animated.View style={[baseStyle, style, hasFlex && { width: '100%' }, { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return <View style={[baseStyle, style]}>{children}</View>;
};

// ─── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
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
  iconColor = COLORS.ink,
  iconBg = COLORS.surface2,
  subtext,
  trend,
  onPress,
  style,
}) => (
  <Card onPress={onPress} style={style ? [{ flex: 1 }, style] : { flex: 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ ...TYPE.overline, color: COLORS.text.muted, marginBottom: 6 }}>{label}</Text>
        <Text style={{ ...TYPE.stat, color: COLORS.text.primary }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {subtext ? <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>{subtext}</Text> : null}
        {trend !== undefined ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 8,
              gap: 4,
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2.5,
              borderRadius: RADIUS.full,
              backgroundColor: trend >= 0 ? COLORS.successLight : COLORS.dangerLight,
            }}
          >
            <Feather name={trend >= 0 ? 'trending-up' : 'trending-down'} size={11} color={trend >= 0 ? COLORS.success : COLORS.danger} />
            <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: trend >= 0 ? COLORS.success : COLORS.danger }}>
              {Math.abs(trend).toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.md,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={17} color={iconColor} />
      </View>
    </View>
  </Card>
);

// ─── Smart Chip / Micro Tag (Upwork-Style) ──────────────────────────────────

export type SmartChipVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';

const chipThemes: Record<SmartChipVariant, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: COLORS.surface2, text: COLORS.text.secondary, border: COLORS.border, dot: COLORS.text.muted },
  success: { bg: COLORS.successLight, text: '#059669', border: '#a7f3d0', dot: COLORS.success },
  warning: { bg: COLORS.warningLight, text: '#d97706', border: '#fde68a', dot: COLORS.warning },
  danger:  { bg: COLORS.dangerLight, text: '#dc2626', border: '#fecaca', dot: COLORS.danger },
  info:    { bg: COLORS.infoLight, text: '#0284c7', border: '#bae6fd', dot: COLORS.info },
  accent:  { bg: COLORS.accentLight, text: COLORS.accentDark, border: '#FDE047', dot: COLORS.accent },
  primary: { bg: COLORS.navyLight, text: COLORS.ink, border: '#bae6fd', dot: COLORS.ink },
};

// Deep solid backgrounds with crisp white text for status pills
const dotChipThemes: Record<SmartChipVariant, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: '#374151', text: '#FFFFFF', border: '#4B5563', dot: '#FFFFFF' },
  success: { bg: '#15803D', text: '#FFFFFF', border: '#166534', dot: '#FFFFFF' },
  warning: { bg: '#B45309', text: '#FFFFFF', border: '#92400E', dot: '#FFFFFF' },
  danger:  { bg: '#B91C1C', text: '#FFFFFF', border: '#991B1B', dot: '#FFFFFF' },
  info:    { bg: '#0369A1', text: '#FFFFFF', border: '#075985', dot: '#FFFFFF' },
  accent:  { bg: '#EAB308', text: COLORS.onAccent, border: '#CA8A04', dot: COLORS.onAccent },
  primary: { bg: '#004E89', text: '#FFFFFF', border: '#003B68', dot: '#FFFFFF' },
};

export interface SmartChipProps {
  label: string;
  dot?: boolean;
  deep?: boolean;
  dotColor?: string;
  icon?: keyof typeof Feather.glyphMap;
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
  const isDeep =
    deep ||
    dot ||
    (!icon &&
      (variant === 'danger' ||
        variant === 'success' ||
        variant === 'warning' ||
        variant === 'primary' ||
        variant === 'accent'));
  const t = isDeep ? dotChipThemes[variant] : chipThemes[variant];
  const isXs = size === 'xs';
  const isSm = size === 'sm';

  const textSize = isXs ? 10 : isSm ? 11 : 12;
  const paddingH = isXs ? 7 : isSm ? 9 : 11;
  const paddingV = isXs ? 2 : isSm ? 3 : 4;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.bg,
          borderRadius: RADIUS.full,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.border,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          gap: isXs ? 4 : 5,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={textSize + 1} color={t.text} /> : null}
      <Text
        style={[
          {
            fontSize: textSize,
            fontFamily: isDeep ? FONT.semiBold : FONT.medium,
            color: t.text,
            letterSpacing: 0.1,
            includeFontPadding: false,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

// ─── Badge ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';

const badgeColors: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  neutral: { bg: COLORS.surface2, text: COLORS.text.secondary, border: COLORS.border },
  success: { bg: COLORS.successLight, text: '#059669', border: '#a7f3d0' },
  warning: { bg: COLORS.warningLight, text: '#d97706', border: '#fde68a' },
  danger:  { bg: COLORS.dangerLight, text: '#dc2626', border: '#fecaca' },
  info:    { bg: COLORS.infoLight, text: '#0284c7', border: '#bae6fd' },
  accent:  { bg: COLORS.accentLight, text: COLORS.accentDark, border: '#FDE047' },
  primary: { bg: COLORS.ink, text: '#FFFFFF', border: COLORS.ink },
};

export const Badge: React.FC<{ label: string; variant?: BadgeVariant; size?: 'sm' | 'md' }> = ({ label, variant = 'neutral', size = 'md' }) => {
  const c = badgeColors[variant];
  const isSm = size === 'sm';

  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: RADIUS.full,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        paddingHorizontal: isSm ? 7 : 9,
        paddingVertical: isSm ? 2 : 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: isSm ? 10 : 11, fontFamily: FONT.bold, color: c.text, letterSpacing: 0.1 }}>{label}</Text>
    </View>
  );
};

// ─── Divider ────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderSubtle }, style]} />
);

// ─── Empty State ────────────────────────────────────────────────────────────

export const EmptyState: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}> = ({ icon, title, description, action }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 44, paddingHorizontal: 28 }}>
    <View
      style={{
        width: 60,
        height: 60,
        borderRadius: RADIUS.full,
        backgroundColor: COLORS.surface2,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}
    >
      <Feather name={icon} size={24} color={COLORS.text.muted} />
    </View>
    <Text style={{ ...TYPE.h3, color: COLORS.text.primary, textAlign: 'center', marginBottom: 6 }}>{title}</Text>
    {description ? (
      <Text style={{ fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center', marginBottom: action ? 20 : 0, lineHeight: 20 }}>
        {description}
      </Text>
    ) : null}
    {action ? <Button title={action.label} onPress={action.onPress} size="sm" variant="primary" /> : null}
  </View>
);

// ─── Loading Screen ─────────────────────────────────────────────────────────

export const LoadingScreen: React.FC<{ message?: string }> = ({ message }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface }}>
    <ActivityIndicator size="large" color={COLORS.navy} />
    {message ? (
      <Text style={{ marginTop: 14, color: COLORS.text.muted, fontSize: 13.5, fontFamily: FONT.medium }}>{message}</Text>
    ) : null}
  </View>
);

// ─── Section Header ─────────────────────────────────────────────────────────

export const SectionHeader: React.FC<{
  title: string;
  action?: { label: string; onPress: () => void };
  rightAction?: React.ReactNode;
  color?: string;
  style?: TextStyle;
}> = ({
  title,
  action,
  rightAction,
  color,
  style,
}) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 }}>
    <Text style={[{ ...TYPE.overline, color: color || COLORS.text.muted }, style]}>{title}</Text>
    {rightAction || (action ? (
      <TouchableOpacity onPress={action.onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: COLORS.accentDark }}>{action.label}</Text>
      </TouchableOpacity>
    ) : null)}
  </View>
);

// ─── List Row ───────────────────────────────────────────────────────────────

export const ListRow: React.FC<{
  title: string;
  subtitle?: string | React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: ViewStyle;
}> = ({ title, subtitle, left, right, onPress, showChevron = true, style }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    disabled={!onPress}
    style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: SP.card, gap: 14 }, style]}
  >
    {left}
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.2 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, lineHeight: 17 }}>{subtitle}</Text>
      ) : null}
    </View>
    {right}
    {showChevron && onPress ? <Feather name="chevron-right" size={16} color={COLORS.text.muted} /> : null}
  </TouchableOpacity>
);

// ─── Icon Box ───────────────────────────────────────────────────────────────

export const IconBox: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  bg?: string;
  size?: number;
}> = ({ icon, color = '#FFFFFF', bg = COLORS.navy, size = 16 }) => (
  <View
    style={{
      width: 38,
      height: 38,
      borderRadius: RADIUS.md,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Feather name={icon} size={size} color={color} />
  </View>
);

// ─── Amount Display ─────────────────────────────────────────────────────────

export const AmountDisplay: React.FC<{
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  currency?: string;
}> = ({ amount, size = 'md', color = COLORS.text.primary, currency = CURRENCY_SYMBOL }) => {
  const sizes = { sm: 14, md: 18, lg: 24, xl: 32 };
  const formatted = Math.abs(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 });

  return (
    <Text style={{ fontSize: sizes[size], fontFamily: FONT.bold, color, letterSpacing: -0.3 }}>
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
}> = ({ totalAmount, amountPaid, amountOwed, tone = 'default', style }) => {
  const totalColor = tone === 'sales' ? COLORS.ink : COLORS.text.primary;
  const paidColor = amountPaid > 0 ? COLORS.success : COLORS.text.muted;
  const creditColor = amountOwed > 0 ? COLORS.danger : COLORS.text.muted;
  const fmt = (value: number) => `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <View style={[{ minWidth: 110, alignItems: 'flex-end' }, style]}>
      <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: totalColor, textAlign: 'right' }}>{fmt(totalAmount)}</Text>
      <View style={{ marginTop: 4, width: '100%', gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>Paid</Text>
          <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: paidColor, textAlign: 'right' }}>{fmt(amountPaid)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>Credit</Text>
          <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: creditColor, textAlign: 'right' }}>{fmt(amountOwed)}</Text>
        </View>
      </View>
    </View>
  );
};

