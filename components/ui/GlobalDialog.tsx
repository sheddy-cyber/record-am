import React, { useEffect, useState } from 'react';
import { useAlertStore } from '@/store/alertStore';
import { ConfirmationModal } from './ConfirmationModal';

export function GlobalDialog() {
  const { isVisible, options, session, hideAlert } = useAlertStore();
  const [submitting, setSubmitting] = useState(false);

  // A button that opens the next dialog must not leave that dialog disabled.
  useEffect(() => {
    setSubmitting(false);
  }, [session]);

  if (!options) return null;

  const handleConfirm = async () => {
    const openedSession = session;
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
    hideAlert(openedSession);
  };

  const handleCancel = () => {
    const openedSession = session;
    if (submitting) return;
    if (options.onCancel) {
      options.onCancel();
    }
    hideAlert(openedSession);
  };

  const formattedButtons = options.buttons?.map((b) => ({
    text: b.text,
    style: b.style,
    onPress: async () => {
      const openedSession = session;
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
      // No-ops when this press already replaced the dialog (for example
      // Delete Product opening the delete confirmation).
      hideAlert(openedSession);
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
