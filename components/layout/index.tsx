import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ViewStyle,
  Platform,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import Svg, { Rect, Path } from "react-native-svg";
import { BRAND, COLORS, FONT, RADIUS, SP, TYPE } from "@/constants";

type StatusBarMode = "light" | "dark";

// ─── Screen Shell ───────────────────────────────────────────────────────────
export function ScreenShell({
  children,
  backgroundColor = COLORS.surface,
  statusBarStyle = "dark",
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
      <Rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="10"
        fill="none"
        stroke={accent}
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />
      <Path d="M28 8L18 24h8l-6 16 16-20h-9L28 8Z" fill={accent} />
      <Rect
        x="10"
        y="20"
        width="5"
        height="5"
        rx="2.5"
        fill={accent}
        fillOpacity="0.5"
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
            color: invert ? "rgba(250,250,248,0.55)" : COLORS.text.muted,
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
export function ScreenHeader({
  title,
  subtitle,
  right,
  left,
  theme = "dark",
  style,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  theme?: "dark" | "light";
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const isDark = theme === "dark";
  const bg = isDark ? COLORS.ink : COLORS.card;
  const titleColor = isDark ? COLORS.text.inverse : COLORS.text.primary;
  const subtitleColor = isDark ? "rgba(250,250,248,0.5)" : COLORS.text.muted;
  const statusBarStyle: StatusBarMode = isDark ? "light" : "dark";

  return (
    <View
      style={[
        {
          backgroundColor: bg,
          paddingTop: insets.top + 14,
          paddingHorizontal: SP.page,
          paddingBottom: 18,
          borderBottomWidth: isDark ? 0 : 1,
          borderBottomColor: COLORS.border,
        },
        style,
      ]}
    >
      <StatusBar style={statusBarStyle} backgroundColor={bg} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {left ? <View style={{ minWidth: 40 }}>{left}</View> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.h2, color: titleColor }}>{title}</Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: 13,
                fontFamily: FONT.regular,
                color: subtitleColor,
                marginTop: 3,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? (
          <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Header Action Button ───────────────────────────────────────────────────
export function HeaderAction({
  icon,
  label,
  onPress,
  theme = "dark",
}: {
  icon?: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
  theme?: "dark" | "light";
}) {
  const isDark = theme === "dark";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        minHeight: 38,
        minWidth: 38,
        paddingHorizontal: label ? 14 : 8,
        borderRadius: RADIUS.md,
        backgroundColor: isDark ? "rgba(250,250,248,0.1)" : COLORS.surface2,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
      }}
    >
      {icon ? (
        <Feather
          name={icon}
          size={16}
          color={isDark ? COLORS.text.inverse : COLORS.text.primary}
        />
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

// ─── Overlay Header — glassmorphic X-close design ──────────────────────────
// Replaces the old arrow-left navigation with a top-right X button.
// Background uses a soft translucent wash over the surface, creating depth
// without heavy shadows.
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingHorizontal: SP.page,
        paddingBottom: 12,
      }}
    >
      {/* X close button — top-right, self-contained */}
      <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
        <TouchableOpacity
          onPress={onClose}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.7}
        >
          <Animated.View
            style={{
              width: 44,
              height: 44,
              borderRadius: RADIUS.full,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: scaleAnim }],
            }}
          >
            <Feather name="x" size={28} color={COLORS.text.primary} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Title block — flush left, spacious */}
      <View>
        <Text
          style={{
            ...TYPE.h2,
            color: COLORS.text.primary,
            letterSpacing: -0.4,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontSize: 13,
              fontFamily: FONT.regular,
              color: COLORS.text.muted,
              marginTop: 4,
              lineHeight: 18,
            }}
          >
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
          borderRadius: RADIUS.lg,
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

// ─── Glass Modal Shell ───────────────────────────────────────────────────────
// Wraps modal content in a glassmorphic container. Use inside <Modal> components
// instead of plain ScreenShell for the elevated overlay feel.
export function GlassModalShell({
  children,
  statusBarStyle = "dark",
}: {
  children: React.ReactNode;
  statusBarStyle?: StatusBarMode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(245,248,252,0.96)" }}>
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}
