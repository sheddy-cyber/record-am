import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
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
    secondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
    danger:    { backgroundColor: COLORS.danger },
    ghost:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
    success:   { backgroundColor: COLORS.success },
    accent:    { backgroundColor: COLORS.accent },
  };
  const textColors: Record<ButtonVariant, string> = {
    primary:   COLORS.text.inverse,
    secondary: COLORS.text.primary,
    danger:    COLORS.text.inverse,
    ghost:     COLORS.text.secondary,
    success:   COLORS.text.inverse,
    accent:    '#FFFFFF',
  };
  const heights = { sm: 38, md: 46, lg: 52 };
  const paddings = { sm: 14, md: 18, lg: 22 };
  const fontSizes = { sm: 13, md: 14, lg: 15 };

  return (
    <TouchableOpacity
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
        },
        containers[variant],
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      delayPressIn={0}
    >
      {loading ? <ActivityIndicator color={textColors[variant]} size="small" /> : null}
      {!loading && icon ? <Feather name={icon} size={fontSizes[size] + 1} color={textColors[variant]} /> : null}
      <Text style={[{ fontSize: fontSizes[size], fontFamily: FONT.medium, color: textColors[variant] }, textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  variant?: 'default' | 'muted';
}

export const Card: React.FC<CardProps> = ({ children, style, onPress, variant = 'default' }) => {
  const bg = variant === 'muted' ? COLORS.surface2 : COLORS.card;
  const baseStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SP.card,
  };

  if (onPress) {
    return (
      <TouchableOpacity style={[baseStyle, style]} onPress={onPress} activeOpacity={0.7} delayPressIn={0}>
        {children}
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
        <Text style={{ ...TYPE.stat, color: COLORS.text.primary }}>{value}</Text>
        {subtext ? <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>{subtext}</Text> : null}
        {trend !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
            <Feather name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend >= 0 ? COLORS.success : COLORS.danger} />
            <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: trend >= 0 ? COLORS.success : COLORS.danger }}>
              {Math.abs(trend).toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: RADIUS.md,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={16} color={iconColor} />
      </View>
    </View>
  </Card>
);

// ─── Badge ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';

const badgeColors: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  neutral: { bg: COLORS.surface2, text: COLORS.text.secondary, border: COLORS.border },
  success: { bg: COLORS.successLight, text: '#3D6948', border: '#C2DBCA' },
  warning: { bg: COLORS.warningLight, text: '#7A5230', border: '#E8D4BF' },
  danger:  { bg: COLORS.dangerLight, text: '#8B1A22', border: '#F2C4C8' },
  info:    { bg: COLORS.infoLight, text: '#3D5A63', border: '#C8D8DD' },
  accent:  { bg: COLORS.accentLight, text: COLORS.accentMuted, border: '#E8E0A0' },
  primary: { bg: COLORS.ink, text: COLORS.text.inverse, border: COLORS.ink },
};

export const Badge: React.FC<{ label: string; variant?: BadgeVariant }> = ({ label, variant = 'neutral' }) => {
  const c = badgeColors[variant];

  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: RADIUS.sm,
        borderWidth: 1,
        borderColor: c.border,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: c.text }}>{label}</Text>
    </View>
  );
};

// ─── Divider ────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[{ height: 1, backgroundColor: COLORS.border }, style]} />
);

// ─── Empty State ────────────────────────────────────────────────────────────

export const EmptyState: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}> = ({ icon, title, description, action }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: RADIUS.full,
        backgroundColor: COLORS.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
      }}
    >
      <Feather name={icon} size={24} color={COLORS.text.muted} />
    </View>
    <Text style={{ ...TYPE.h3, color: COLORS.text.primary, textAlign: 'center', marginBottom: 8 }}>{title}</Text>
    {description ? (
      <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
        {description}
      </Text>
    ) : null}
    {action ? <Button title={action.label} onPress={action.onPress} size="sm" /> : null}
  </View>
);

// ─── Loading Screen ─────────────────────────────────────────────────────────

export const LoadingScreen: React.FC<{ message?: string }> = ({ message }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface }}>
    <ActivityIndicator size="large" color={COLORS.accent} />
    {message ? (
      <Text style={{ marginTop: 12, color: COLORS.text.muted, fontSize: 14, fontFamily: FONT.regular }}>{message}</Text>
    ) : null}
  </View>
);

// ─── Section Header ─────────────────────────────────────────────────────────

export const SectionHeader: React.FC<{ title: string; action?: { label: string; onPress: () => void } }> = ({
  title,
  action,
}) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
    <Text style={{ ...TYPE.overline, color: COLORS.text.muted }}>{title}</Text>
    {action ? (
      <TouchableOpacity onPress={action.onPress} activeOpacity={0.7}>
        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.accent }}>{action.label}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

// ─── List Row ───────────────────────────────────────────────────────────────

export const ListRow: React.FC<{
  title: string;
  subtitle?: string;
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
      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>{subtitle}</Text>
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
}> = ({ icon, color = COLORS.text.secondary, bg = COLORS.surface2, size = 16 }) => (
  <View
    style={{
      width: 40,
      height: 40,
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
  const totalColor = tone === 'sales' ? COLORS.accent : COLORS.text.primary;
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

