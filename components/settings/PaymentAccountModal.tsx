import React, { useState } from 'react';
import {
  Modal,
  Text,
  TouchableOpacity,
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { InputField } from '@/components/forms';
import { COLORS, FONT, RADIUS } from '@/constants';
import { PaymentAccountChannel } from '@/types';

interface PaymentAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (params: {
    name: string;
    accountNumber?: string;
    channel: PaymentAccountChannel;
  }) => Promise<void>;
  initialChannel?: PaymentAccountChannel;
  title?: string;
}

export const PaymentAccountModal: React.FC<PaymentAccountModalProps> = ({
  visible,
  onClose,
  onSave,
  initialChannel = 'both',
  title = 'Add Bank or POS Account',
}) => {
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [channel, setChannel] = useState<PaymentAccountChannel>(initialChannel);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setAccountNumber('');
    setChannel(initialChannel);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter the name of the bank or POS terminal.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        accountNumber: accountNumber.trim() || undefined,
        channel,
      });
      resetForm();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const channelOptions: { value: PaymentAccountChannel; label: string; icon: keyof typeof Feather.glyphMap; desc: string }[] = [
    { value: 'transfer', label: 'Transfer Only', icon: 'send', desc: 'Direct bank transfers' },
    { value: 'pos', label: 'POS / Card Only', icon: 'credit-card', desc: 'Card swipe terminals' },
    { value: 'both', label: 'Both', icon: 'repeat', desc: 'Accepts transfers & POS' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: RADIUS.lg,
            padding: 20,
            width: '100%',
            maxWidth: 420,
            gap: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <View>
            <Text style={{ fontSize: 17, fontFamily: FONT.bold, color: COLORS.text.primary }}>
              {title}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
              Save for quick selection during checkout and reconciliation.
            </Text>
          </View>

          <InputField
            label="Bank or Terminal Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. GTBank, Moniepoint POS, OPay"
            containerStyle={{ marginBottom: 0 }}
          />

          <InputField
            label="Account Number / Terminal ID (Optional)"
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="e.g. 0123456789"
            keyboardType="numeric"
            containerStyle={{ marginBottom: 0 }}
          />

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary }}>
              Accepts Payments Via
            </Text>
            <View style={{ gap: 8 }}>
              {channelOptions.map((opt) => {
                const isSelected = channel === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setChannel(opt.value)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      borderRadius: RADIUS.md,
                      borderWidth: 1.5,
                      borderColor: isSelected ? COLORS.accent : COLORS.border,
                      backgroundColor: isSelected ? COLORS.accentLight : COLORS.surface,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: isSelected ? COLORS.accent : 'rgba(0,0,0,0.05)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name={opt.icon}
                        size={15}
                        color={isSelected ? COLORS.card : COLORS.text.muted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: isSelected ? FONT.bold : FONT.medium,
                          color: isSelected ? COLORS.accentMuted : COLORS.text.primary,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                        {opt.desc}
                      </Text>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={16} color={COLORS.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="secondary" onPress={handleClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Save Account"
                variant="accent"
                onPress={handleSave}
                loading={saving}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
