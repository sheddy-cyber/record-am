import React from 'react';
import { create } from 'zustand';
import { Feather } from '@expo/vector-icons';
import {
  ConfirmationDialogType,
  ConfirmationButtonVariant,
  ConfirmationModalButton,
} from '@/components/ui/ConfirmationModal';

export interface AlertOptions {
  title: string;
  message?: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  buttons?: ConfirmationModalButton[];
  type?: ConfirmationDialogType;
  icon?: keyof typeof Feather.glyphMap;
  customIcon?: React.ReactNode;
  dismissOnBackdropPress?: boolean;
  confirmVariant?: ConfirmationButtonVariant;
  buttonLayout?: 'auto' | 'row' | 'column';
  content?: React.ReactNode;
}

interface AlertState {
  isVisible: boolean;
  options: AlertOptions | null;
  showAlert: (
    title: string,
    message?: string | React.ReactNode,
    customOptions?: Partial<AlertOptions>
  ) => void;
  hideAlert: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  isVisible: false,
  options: null,
  showAlert: (title, message, customOptions) => {
    set({
      isVisible: true,
      options: {
        title,
        message,
        ...customOptions,
      },
    });
  },
  hideAlert: () => {
    set({ isVisible: false, options: null });
  },
}));

/**
 * Imperative promise-based confirmation dialog.
 * Can be called from anywhere in the app:
 *
 * ```ts
 * const confirmed = await confirmModal({
 *   title: 'Delete Customer',
 *   message: 'Are you sure you want to remove this customer?',
 *   type: 'danger',
 *   confirmText: 'Delete',
 * });
 * if (confirmed) { ... }
 * ```
 */
export function confirmModal(
  options: {
    title: string;
    message?: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    type?: ConfirmationDialogType;
    icon?: keyof typeof Feather.glyphMap;
    customIcon?: React.ReactNode;
    dismissOnBackdropPress?: boolean;
    confirmVariant?: ConfirmationButtonVariant;
    buttonLayout?: 'auto' | 'row' | 'column';
    content?: React.ReactNode;
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    useAlertStore.getState().showAlert(options.title, options.message, {
      ...options,
      cancelText: options.cancelText ?? 'Cancel',
      confirmText:
        options.confirmText ?? (options.type === 'danger' ? 'Delete' : 'Confirm'),
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/**
 * Imperative promise-based alert dialog (single OK button).
 */
export function showAlertDialog(
  title: string,
  message?: string | React.ReactNode,
  options?: Partial<Omit<AlertOptions, 'title' | 'message' | 'cancelText'>>
): Promise<void> {
  return new Promise((resolve) => {
    useAlertStore.getState().showAlert(title, message, {
      ...options,
      cancelText: undefined,
      confirmText: options?.confirmText ?? 'OK',
      onConfirm: () => resolve(),
      onCancel: () => resolve(),
    });
  });
}

/**
 * Hook for easy confirmation dialogs inside React components.
 */
export function useConfirmModal() {
  return {
    confirm: confirmModal,
    alert: showAlertDialog,
    hide: useAlertStore.getState().hideAlert,
  };
}
