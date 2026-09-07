import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SP } from '@/constants';

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
  icon?: keyof typeof Feather.glyphMap;
  customIcon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  dismissOnBackdropPress?: boolean;
  confirmVariant?: ConfirmationButtonVariant;
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Detects if a button label is likely to wrap onto 2 lines when placed
 * inside a side-by-side row button (which only has ~94-116px of horizontal text space).
 */
export const isOptionTextLikelyToWrap = (text?: string): boolean => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Explicit line break
  if (trimmed.includes('\n')) return true;
  // Over 11 characters typically wraps in narrow row buttons at 14px medium font
  if (trimmed.length > 11) return true;
  // 3 or more words almost always wrap in narrow row buttons
  const words = trimmed.split(/\s+/);
  if (words.length >= 3) return true;
  // Any single word >= 9 characters takes up most of the row button width
  if (words.some((w) => w.length >= 9)) return true;
  return false;
};

/**
 * Determines whether two buttons should be stacked on top of one another (column)
 * instead of placed side-by-side in a row.
 */
export const shouldStackTwoButtons = (
  textA?: string,
  textB?: string,
  layoutPreference?: 'auto' | 'row' | 'column'
): boolean => {
  if (layoutPreference === 'column') return true;
  if (layoutPreference === 'row') return false;

  // Auto detection
  if (!textA && !textB) return false;
  if (isOptionTextLikelyToWrap(textA) || isOptionTextLikelyToWrap(textB)) {
    return true;
  }
  // Combined length check: even if individually <= 11, together > 20 chars
  // is tight and prone to awkward line-wrapping on narrow mobile screens
  const lenA = (textA || '').trim().length;
  const lenB = (textB || '').trim().length;
  if (lenA + lenB > 20) {
    return true;
  }

  return false;
};

const TYPE_CONFIG: Record<
  ConfirmationDialogType,
  {
    bg: string;
    border: string;
    iconColor: string;
    defaultIcon: keyof typeof Feather.glyphMap;
    confirmVariant: ConfirmationButtonVariant;
  }
> = {
  danger: {
    bg: COLORS.dangerLight,
    border: '#f5c6c2',
    iconColor: COLORS.danger,
    defaultIcon: 'alert-triangle',
    confirmVariant: 'danger',
  },
  warning: {
    bg: COLORS.warningLight,
    border: '#f7dfc8',
    iconColor: COLORS.warning,
    defaultIcon: 'alert-circle',
    confirmVariant: 'accent',
  },
  info: {
    bg: COLORS.infoLight,
    border: '#b8cfdf',
    iconColor: COLORS.info,
    defaultIcon: 'info',
    confirmVariant: 'primary',
  },
  success: {
    bg: COLORS.successLight,
    border: '#a9dfbf',
    iconColor: COLORS.success,
    defaultIcon: 'check-circle',
    confirmVariant: 'success',
  },
};

const BUTTON_COLORS: Record<
  ConfirmationButtonVariant,
  { bg: string; border?: string; text: string }
> = {
  primary: { bg: COLORS.ink, text: COLORS.text.inverse },
  secondary: { bg: COLORS.card, border: COLORS.border, text: COLORS.text.primary },
  danger: { bg: COLORS.danger, text: '#FFFFFF' },
  accent: { bg: COLORS.accent, text: '#FFFFFF' },
  success: { bg: COLORS.success, text: '#FFFFFF' },
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
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const isSubmitting = loading || internalLoading;
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  // Smart default icon if not explicitly provided
  const resolvedIconName: keyof typeof Feather.glyphMap =
    icon ||
    (type === 'danger' && /delete|remove|trash/i.test(title)
      ? 'trash-2'
      : type === 'danger' && /sign out|logout/i.test(title)
      ? 'log-out'
      : /manage|inventory|stock|product/i.test(typeof message === 'string' ? message : '') ||
        /manage/i.test(title)
      ? 'package'
      : config.defaultIcon);

  // Smart default confirm button label
  const resolvedConfirmText =
    confirmText ||
    (type === 'danger' && /delete/i.test(title)
      ? 'Delete'
      : type === 'danger' && /remove/i.test(title)
      ? 'Remove'
      : type === 'danger' && /sign out/i.test(title)
      ? 'Sign Out'
      : 'Confirm');

  const resolvedConfirmVariant = confirmVariant || config.confirmVariant;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 70,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.94);
      opacityAnim.setValue(0);
      setInternalLoading(false);
    }
  }, [visible, opacityAnim, scaleAnim]);

  const handleConfirm = async () => {
    if (isSubmitting || disabled) return;
    try {
      setInternalLoading(true);
      if (onConfirm) {
        const result = onConfirm();
        if (result && typeof (result as any).then === 'function') {
          await result;
        }
      }
    } finally {
      setInternalLoading(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    if (onCancel) {
      onCancel();
    }
  };

  const handleCustomButtonPress = async (btn: ConfirmationModalButton) => {
    if (isSubmitting || disabled) return;
    try {
      setInternalLoading(true);
      if (btn.onPress) {
        const res = btn.onPress();
        if (res && typeof (res as any).then === 'function') {
          await res;
        }
      }
    } finally {
      setInternalLoading(false);
    }
  };

  const handleBackdropPress = () => {
    if (dismissOnBackdropPress && !isSubmitting) {
      handleCancel();
    }
  };

  const hasCancelButton = cancelText !== undefined && cancelText !== null && cancelText !== '';

  const confirmBtnStyles = BUTTON_COLORS[resolvedConfirmVariant] || BUTTON_COLORS.primary;

  const renderButtons = () => {
    if (buttons && buttons.length > 0) {
      if (buttons.length === 1) {
        const btn = buttons[0];
        const isCancel = btn.style === 'cancel';
        const isDestructive = btn.style === 'destructive';
        const variant: ConfirmationButtonVariant =
          btn.variant ||
          (isDestructive ? 'danger' : isCancel ? 'secondary' : resolvedConfirmVariant);
        const btnColors = BUTTON_COLORS[variant] || BUTTON_COLORS.primary;

        return (
          <View style={styles.buttonFullWidth}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonFullWidth,
                isCancel
                  ? styles.cancelButton
                  : {
                      backgroundColor: btnColors.bg,
                      borderColor: btnColors.border || btnColors.bg,
                    },
                (isSubmitting || disabled) && styles.buttonDisabled,
              ]}
              onPress={() => handleCustomButtonPress(btn)}
              disabled={isSubmitting || disabled}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <ActivityIndicator color={btnColors.text} size="small" />
              ) : (
                <Text
                  style={
                    isCancel
                      ? styles.cancelButtonText
                      : [styles.confirmButtonText, { color: btnColors.text }]
                  }
                >
                  {btn.text}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }

      if (buttons.length === 2) {
        const isStacked = shouldStackTwoButtons(
          buttons[0].text,
          buttons[1].text,
          buttonLayout
        );

        if (isStacked) {
          // When stacked vertically:
          // Place primary/destructive action at top, and cancel/dismiss at bottom.
          // If neither is cancel, preserve array order.
          const hasCancel = buttons[0].style === 'cancel' || buttons[1].style === 'cancel';
          const topBtn = hasCancel
            ? (buttons[0].style === 'cancel' ? buttons[1] : buttons[0])
            : buttons[0];
          const bottomBtn = topBtn === buttons[0] ? buttons[1] : buttons[0];

          const topIsCancel = topBtn.style === 'cancel';
          const topIsDestructive = topBtn.style === 'destructive';
          const topVariant: ConfirmationButtonVariant =
            topBtn.variant ||
            (topIsDestructive ? 'danger' : topIsCancel ? 'secondary' : resolvedConfirmVariant);
          const topColors = BUTTON_COLORS[topVariant] || BUTTON_COLORS.primary;

          const bottomIsCancel = bottomBtn.style === 'cancel';
          const bottomIsDestructive = bottomBtn.style === 'destructive';
          const bottomVariant: ConfirmationButtonVariant =
            bottomBtn.variant ||
            (bottomIsDestructive ? 'danger' : bottomIsCancel ? 'secondary' : 'secondary');
          const bottomColors = BUTTON_COLORS[bottomVariant] || BUTTON_COLORS.secondary;

          return (
            <View style={styles.buttonColumn}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonFullWidth,
                  topIsCancel
                    ? styles.cancelButton
                    : {
                        backgroundColor: topColors.bg,
                        borderColor: topColors.border || topColors.bg,
                      },
                  (isSubmitting || disabled) && styles.buttonDisabled,
                ]}
                onPress={() => handleCustomButtonPress(topBtn)}
                disabled={isSubmitting || disabled}
                activeOpacity={0.7}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={topColors.text} size="small" />
                ) : (
                  <Text
                    style={
                      topIsCancel
                        ? styles.cancelButtonText
                        : [styles.confirmButtonText, { color: topColors.text }]
                    }
                  >
                    {topBtn.text}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonFullWidth,
                  bottomIsCancel
                    ? styles.cancelButton
                    : {
                        backgroundColor: bottomColors.bg,
                        borderColor: bottomColors.border || bottomColors.bg,
                      },
                  (isSubmitting || disabled) && styles.buttonDisabled,
                ]}
                onPress={() => handleCustomButtonPress(bottomBtn)}
                disabled={isSubmitting || disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={
                    bottomIsCancel
                      ? styles.cancelButtonText
                      : [styles.confirmButtonText, { color: bottomColors.text }]
                  }
                >
                  {bottomBtn.text}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }

        // Side-by-side row layout (left = cancel/secondary, right = confirm/action)
        const leftBtn =
          buttons[0].style === 'cancel'
            ? buttons[0]
            : buttons[1].style === 'cancel'
            ? buttons[1]
            : buttons[0];
        const rightBtn = leftBtn === buttons[0] ? buttons[1] : buttons[0];

        const leftIsCancel = leftBtn.style === 'cancel';
        const leftVariant: ConfirmationButtonVariant =
          leftBtn.variant || (leftIsCancel ? 'secondary' : 'primary');
        const leftColors = BUTTON_COLORS[leftVariant] || BUTTON_COLORS.secondary;

        const rightIsDestructive = rightBtn.style === 'destructive';
        const rightVariant: ConfirmationButtonVariant =
          rightBtn.variant || (rightIsDestructive ? 'danger' : resolvedConfirmVariant);
        const rightColors = BUTTON_COLORS[rightVariant] || BUTTON_COLORS.primary;

        return (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonInRow,
                leftIsCancel
                  ? styles.cancelButton
                  : {
                      backgroundColor: leftColors.bg,
                      borderColor: leftColors.border || leftColors.bg,
                    },
                (isSubmitting || disabled) && styles.buttonDisabled,
              ]}
              onPress={() => handleCustomButtonPress(leftBtn)}
              disabled={isSubmitting || disabled}
              activeOpacity={0.7}
            >
              <Text
                style={
                  leftIsCancel
                    ? styles.cancelButtonText
                    : [styles.confirmButtonText, { color: leftColors.text }]
                }
              >
                {leftBtn.text}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonInRow,
                {
                  backgroundColor: rightColors.bg,
                  borderColor: rightColors.border || rightColors.bg,
                },
                (isSubmitting || disabled) && styles.buttonDisabled,
              ]}
              onPress={() => handleCustomButtonPress(rightBtn)}
              disabled={isSubmitting || disabled}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <ActivityIndicator color={rightColors.text} size="small" />
              ) : (
                <Text
                  style={[styles.confirmButtonText, { color: rightColors.text }]}
                >
                  {rightBtn.text}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.buttonColumn}>
          {buttons.map((btn: ConfirmationModalButton, index: number) => {
            const isCancel = btn.style === 'cancel';
            const isDestructive = btn.style === 'destructive';
            const variant: ConfirmationButtonVariant =
              btn.variant ||
              (isDestructive
                ? 'danger'
                : isCancel
                ? 'secondary'
                : 'primary');
            const btnColors = BUTTON_COLORS[variant] || BUTTON_COLORS.primary;

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  styles.buttonFullWidth,
                  isCancel
                    ? styles.cancelButton
                    : {
                        backgroundColor: btnColors.bg,
                        borderColor: btnColors.border || btnColors.bg,
                      },
                  (isSubmitting || disabled) && styles.buttonDisabled,
                ]}
                onPress={() => handleCustomButtonPress(btn)}
                disabled={isSubmitting || disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={
                    isCancel
                      ? styles.cancelButtonText
                      : [styles.confirmButtonText, { color: btnColors.text }]
                  }
                >
                  {btn.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (hasCancelButton) {
      const isStacked = shouldStackTwoButtons(
        cancelText,
        resolvedConfirmText,
        buttonLayout
      );

      if (isStacked) {
        return (
          <View style={styles.buttonColumn}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonFullWidth,
                {
                  backgroundColor: confirmBtnStyles.bg,
                  borderColor: confirmBtnStyles.border || confirmBtnStyles.bg,
                },
                (isSubmitting || disabled) && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={isSubmitting || disabled}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <ActivityIndicator color={confirmBtnStyles.text} size="small" />
              ) : (
                <Text
                  style={[styles.confirmButtonText, { color: confirmBtnStyles.text }]}
                >
                  {resolvedConfirmText}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonFullWidth,
                styles.cancelButton,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleCancel}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelText || 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonInRow,
              styles.cancelButton,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleCancel}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>{cancelText || 'Cancel'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonInRow,
              {
                backgroundColor: confirmBtnStyles.bg,
                borderColor: confirmBtnStyles.border || confirmBtnStyles.bg,
              },
              (isSubmitting || disabled) && styles.buttonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={isSubmitting || disabled}
            activeOpacity={0.7}
          >
            {isSubmitting ? (
              <ActivityIndicator color={confirmBtnStyles.text} size="small" />
            ) : (
              <Text
                style={[styles.confirmButtonText, { color: confirmBtnStyles.text }]}
              >
                {resolvedConfirmText}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // Single confirm button (no cancel)
    return (
      <View style={styles.buttonFullWidth}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonFullWidth,
            {
              backgroundColor: confirmBtnStyles.bg,
              borderColor: confirmBtnStyles.border || confirmBtnStyles.bg,
            },
            (isSubmitting || disabled) && styles.buttonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={isSubmitting || disabled}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator color={confirmBtnStyles.text} size="small" />
          ) : (
            <Text
              style={[styles.confirmButtonText, { color: confirmBtnStyles.text }]}
            >
              {resolvedConfirmText}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Prevent inner clicks from triggering backdrop dismissal */}
          <Pressable style={styles.cardContent} onPress={(e) => e.stopPropagation()}>
            {/* Semantic Icon Badge */}
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: config.bg,
                  borderColor: config.border,
                },
              ]}
            >
              {customIcon ? (
                customIcon
              ) : (
                <Feather name={resolvedIconName} size={26} color={config.iconColor} />
              )}
            </View>

            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Message Body */}
            {message ? (
              typeof message === 'string' ? (
                <Text style={styles.message}>{message}</Text>
              ) : (
                <View style={styles.customMessageContainer}>{message}</View>
              )
            ) : null}

            {/* Custom Content Slot */}
            {children ? <View style={styles.childrenContainer}>{children}</View> : null}

            {/* Action Buttons */}
            {renderButtons()}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 20, 50, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 356,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 24,
    shadowColor: '#002040',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  cardContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#4A5568',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  customMessageContainer: {
    marginBottom: 20,
    width: '100%',
  },
  childrenContainer: {
    width: '100%',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  buttonColumn: {
    width: '100%',
    gap: 10,
  },
  button: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  buttonInRow: {
    flex: 1,
  },
  buttonFullWidth: {
    width: '100%',
  },
  cancelButton: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmButtonText: {
    fontSize: 14,
    fontFamily: FONT.medium,
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});

// Backward compatibility aliases
export type ConfirmDialogProps = ConfirmationModalProps;
export const ConfirmDialog = ConfirmationModal;

