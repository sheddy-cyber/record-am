import React from 'react';
import { useAlertStore } from '@/store/alertStore';
import { ConfirmDialog } from './index';

export function GlobalDialog() {
  const { isVisible, options, hideAlert } = useAlertStore();

  if (!options) return null;

  const handleConfirm = () => {
    if (options.onConfirm) options.onConfirm();
    hideAlert();
  };

  const handleCancel = () => {
    if (options.onCancel) options.onCancel();
    hideAlert();
  };

  return (
    <ConfirmDialog
      visible={isVisible}
      title={options.title}
      message={options.message}
      confirmText={options.confirmText || 'OK'}
      cancelText={options.cancelText || (options.onCancel ? 'Cancel' : undefined)}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      type={options.type || 'info'}
    />
  );
}
