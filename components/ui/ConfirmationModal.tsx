import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon, IconName } from '@/components/icons';
import { COLORS, FONT, SP } from '@/constants';
import { haptics } from '@/lib/haptics';

export type ConfirmationDialogType = 'danger' | 'warning' | 'info' | 'success';

export type ConfirmationButtonVariant = 'primary' | 'secondary' | 'danger' | 'accent' | 'success';

export interface ConfirmationModalButton {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
  variant?: ConfirmationButtonVariant;
}

export interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message?: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  buttons?: ConfirmationModalButton[];
  buttonLayout?: 'auto' | 'row' | 'column';
  type?: ConfirmationDialogType;
  icon?: IconName;
  customIcon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  dismissOnBackdropPress?: boolean;
  confirmVariant?: ConfirmationButtonVariant;
  children?: React.ReactNode;
  testID?: string;
}

/** True when a label will not sit comfortably in a half-width button. */
export const isOptionTextLikelyToWrap = (text?: string): boolean => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes('\n')) return true;
  if (trimmed.length > 12) return true;
  const words = trimmed.split(/\s+/);
  if (words.length >= 3) return true;
  return words.some((w) => w.length >= 10);
};

export const shouldStackTwoButtons = (
  textA?: string,
  textB?: string,
  layoutPreference?: 'auto' | 'row' | 'column',
): boolean => {
  if (layoutPreference === 'column') return true;
  if (layoutPreference === 'row') return false;
  if (!textA && !textB) return false;
  if (isOptionTextLikelyToWrap(textA) || isOptionTextLikelyToWrap(textB)) return true;
  return (textA || '').trim().length + (textB || '').trim().length > 22;
};

const TYPE_CONFIG: Record<
  ConfirmationDialogType,
  { tint: string; color: string; icon: IconName; confirm: ConfirmationButtonVariant }
> = {
  danger: { tint: COLORS.dangerLight, color: COLORS.danger, icon: 'alert-triangle', confirm: 'danger' },
  warning: { tint: COLORS.warningLight, color: COLORS.warning, icon: 'alert-circle', confirm: 'primary' },
  info: { tint: COLORS.surface2, color: COLORS.text.secondary, icon: 'info', confirm: 'primary' },
  success: { tint: COLORS.successLight, color: COLORS.success, icon: 'check-circle', confirm: 'primary' },
};

const BUTTON_COLORS: Record<ConfirmationButtonVariant | 'cancel', { bg: string; text: string; border?: string }> = {
  primary: { bg: COLORS.ink, text: '#FFFFFF' },
  accent: { bg: COLORS.accent, text: '#FFFFFF' },
  danger: { bg: COLORS.danger, text: '#FFFFFF' },
  success: { bg: COLORS.success, text: '#FFFFFF' },
  secondary: { bg: COLORS.card, text: COLORS.text.primary, border: COLORS.border },
  cancel: { bg: COLORS.surface2, text: COLORS.text.primary },
};

type NormalizedButton = {
  key: string;
  text: string;
  isCancel: boolean;
  colors: { bg: string; text: string; border?: string };
  onPress: () => void;
};

export function ConfirmationModal({
  visible,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  buttons,
  buttonLayout = 'auto',
  type = 'info',
  icon,
  customIcon,
  loading = false,
  disabled = false,
  dismissOnBackdropPress = true,
  confirmVariant,
  children,
  testID,
}: ConfirmationModalProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const isSubmitting = loading || internalLoading;
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  const autoIcon: IconName =
    icon ||
    (type === 'danger' && /delete|remove|trash/i.test(title)
      ? 'trash-2'
      : type === 'danger' && /sign out|log ?out/i.test(title)
      ? 'log-out'
      : config.icon);
  const showIcon = Boolean(customIcon || icon || type === 'danger' || type === 'warning' || type === 'success');

  const resolvedConfirmText =
    confirmText ||
    (type === 'danger' && /delete/i.test(title)
      ? 'Delete'
      : type === 'danger' && /remove/i.test(title)
      ? 'Remove'
      : type === 'danger' && /sign out/i.test(title)
      ? 'Sign out'
      : 'Confirm');
  const resolvedConfirmVariant = confirmVariant || config.confirm;

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      if (type === 'danger' || type === 'warning') haptics.warning();
    } else {
      setInternalLoading(false);
      setPressedKey(null);
    }
  }, [visible, progress, type]);

  const run = async (key: string, fn?: () => void | Promise<void>) => {
    if (isSubmitting || disabled) return;
    setPressedKey(key);
    try {
      setInternalLoading(true);
      const result = fn?.();
      if (result && typeof (result as any).then === 'function') await result;
    } finally {
      setInternalLoading(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    onCancel?.();
  };

  // Normalise every input shape into one ordered list of buttons.
  let list: NormalizedButton[] = [];
  if (buttons && buttons.length > 0) {
    list = buttons.map((btn, i) => {
      const isCancel = btn.style === 'cancel';
      const variant: ConfirmationButtonVariant | 'cancel' =
        btn.variant || (btn.style === 'destructive' ? 'danger' : isCancel ? 'cancel' : resolvedConfirmVariant);
      return {
        key: `b${i}`,
        text: btn.text,
        isCancel,
        colors: BUTTON_COLORS[variant] ?? BUTTON_COLORS.primary,
        onPress: () => run(`b${i}`, btn.onPress),
      };
    });
  } else {
    if (cancelText) {
      list.push({ key: 'cancel', text: cancelText, isCancel: true, colors: BUTTON_COLORS.cancel, onPress: handleCancel });
    }
    list.push({
      key: 'confirm',
      text: resolvedConfirmText,
      isCancel: false,
      colors: BUTTON_COLORS[resolvedConfirmVariant] ?? BUTTON_COLORS.primary,
      onPress: () => run('confirm', onConfirm),
    });
  }

  const stacked =
    list.length > 2 || (list.length === 2 && shouldStackTwoButtons(list[0].text, list[1].text, buttonLayout));
  if (stacked) {
    // Primary actions first, the way out last.
    list = [...list.filter((b) => !b.isCancel), ...list.filter((b) => b.isCancel)];
  } else if (list.length === 2) {
    // Side by side: the way out on the left.
    list = [...list.filter((b) => b.isCancel), ...list.filter((b) => !b.isCancel)];
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleCancel} testID={testID}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissOnBackdropPress && handleCancel()} />
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              ],
            },
          ]}
        >
          {showIcon ? (
            <View style={[styles.iconBadge, { backgroundColor: config.tint }]}>
              {customIcon ?? <Icon name={autoIcon} size={22} color={config.color} backgroundColor={config.tint} />}
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>

          {message ? (
            typeof message === 'string' ? (
              <Text style={styles.message}>{message}</Text>
            ) : (
              <View style={{ marginTop: 8, alignSelf: 'stretch' }}>{message}</View>
            )
          ) : null}

          {children ? <View style={{ marginTop: 14, alignSelf: 'stretch' }}>{children}</View> : null}

          <View style={[styles.buttons, stacked ? styles.column : styles.row]}>
            {list.map((btn) => {
              const busy = isSubmitting && pressedKey === btn.key;
              const inactive = btn.isCancel ? isSubmitting : isSubmitting || disabled;
              return (
                <Pressable
                  key={btn.key}
                  onPress={btn.onPress}
                  disabled={inactive}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && { flex: 1 },
                    {
                      backgroundColor: btn.colors.bg,
                      borderWidth: btn.colors.border ? 1 : 0,
                      borderColor: btn.colors.border,
                      opacity: inactive && !busy ? 0.45 : pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={btn.colors.text} size="small" />
                  ) : (
                    <Text style={[styles.buttonText, { color: btn.colors.text }]} numberOfLines={1}>
                      {btn.text}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SP.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: 26,
    borderCurve: 'continuous',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT.semiBold,
    color: COLORS.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  buttons: { alignSelf: 'stretch', marginTop: 22, gap: 8 },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  button: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonText: { fontSize: 15.5, fontFamily: FONT.semiBold, letterSpacing: -0.2 },
});
