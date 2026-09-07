import { Alert } from 'react-native';
import { useAlertStore } from '@/store/alertStore';
import { ConfirmationDialogType } from '@/components/ui/ConfirmationModal';

// Preserve original native alert if ever needed explicitly
export const nativeAlert = Alert.alert.bind(Alert);

export interface BridgeAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  isPreferred?: boolean;
}

export interface BridgeAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
  buttonLayout?: 'auto' | 'row' | 'column';
}

/**
 * Global Bridge: Automatically intercepts React Native's Alert.alert calls
 * and displays Record Am's custom ConfirmationModal instead of the unstyled
 * native Android / iOS system dialog.
 */
Alert.alert = (
  title: string,
  message?: string,
  buttons?: BridgeAlertButton[],
  options?: BridgeAlertOptions
) => {
  let type: ConfirmationDialogType = 'info';

  const lowerTitle = (title || '').toLowerCase();
  const lowerMsg = (message || '').toLowerCase();

  // If this is a multi-option action/management menu (e.g., "Manage this inventory item:"),
  // keep type as 'info' so individual buttons style themselves without turning the whole dialog red.
  const isActionMenu =
    (buttons && buttons.length > 2) ||
    /manage|choose|select|options|actions/i.test(lowerMsg) ||
    /manage|actions|options/i.test(lowerTitle);

  const hasDestructive = buttons?.some((b) => b.style === 'destructive');
  const isExplicitDangerTitle = /delete|remove|clear|danger|failed|loss|negative|sign out|logout/i.test(lowerTitle);

  if (!isActionMenu && (hasDestructive || isExplicitDangerTitle)) {
    type = 'danger';
  } else if (
    /warning|mismatch|caution|unsaved|reconcil|missing/i.test(lowerTitle) ||
    /loss|warning|margin/i.test(lowerMsg)
  ) {
    type = 'warning';
  } else if (/success|done|saved|copied/i.test(lowerTitle)) {
    type = 'success';
  }

  // Format buttons
  const formattedButtons =
    buttons && buttons.length > 0
      ? buttons.map((b) => ({
          text: b.text || 'OK',
          onPress: b.onPress,
          style: b.style,
        }))
      : [{ text: 'OK' }];

  useAlertStore.getState().showAlert(title, message, {
    type,
    buttons: formattedButtons,
    buttonLayout: options?.buttonLayout,
    dismissOnBackdropPress: options?.cancelable ?? true,
    onCancel: options?.onDismiss,
  });
};
