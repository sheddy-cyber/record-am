import { create } from 'zustand';

export interface AlertOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  type?: 'danger' | 'warning' | 'info';
}

interface AlertState {
  isVisible: boolean;
  options: AlertOptions | null;
  showAlert: (title: string, message: string, customOptions?: Partial<AlertOptions>) => void;
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
    set({ isVisible: false });
  },
}));
