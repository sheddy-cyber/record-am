import React, { useState } from 'react';
import { useAlertStore } from '@/store/alertStore';
import { ConfirmationModal } from './ConfirmationModal';

export function GlobalDialog() {
  const { isVisible, options, hideAlert } = useAlertStore();
  const [submitting, setSubmitting] = useState(false);

  if (!options) return null;

  const handleConfirm = async () => {
    if (options.onConfirm) {
      try {
        setSubmitting(true);
        const res = options.onConfirm();
        if (res && typeof (res as any).then === 'function') {
          await res;
        }
      } finally {
        setSubmitting(false);
      }
    }
    hideAlert();
  };

  const handleCancel = () => {
    if (submitting) return;
    if (options.onCancel) {
      options.onCancel();
    }
    hideAlert();
  };

  const formattedButtons = options.buttons?.map((b) => ({
    text: b.text,
    style: b.style,
    onPress: async () => {
      if (b.onPress) {
        try {
          setSubmitting(true);
          const res = b.onPress();
          if (res && typeof (res as any).then === 'function') {
            await res;
          }
        } finally {
          setSubmitting(false);
        }
      }
      hideAlert();
    },
  }));

  return (
    <ConfirmationModal
      visible={isVisible}
      title={options.title}
      message={options.message}
      buttons={formattedButtons}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      type={options.type}
      icon={options.icon}
      customIcon={options.customIcon}
      dismissOnBackdropPress={options.dismissOnBackdropPress}
      confirmVariant={options.confirmVariant}
      buttonLayout={options.buttonLayout}
      loading={submitting}
    >
      {options.content}
    </ConfirmationModal>
  );
}
