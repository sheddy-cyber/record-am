import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

export default function CustomerCreateScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness } = useAuthStore();
  const { createCustomer, isSaving } = useCustomerStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const closeScreen = () => router.back();

  const handleAdd = async () => {
    if (!currentBusiness) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Customer name is required.');
      return;
    }

    const customer = await createCustomer({
      business_id: currentBusiness.id,
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    if (!customer) {
      Alert.alert('Error', 'Failed to add customer.');
      return;
    }

    Toast.show({
      type: 'success',
      text1: 'Customer added',
      text2: name.trim(),
    });

    closeScreen();
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Add Customer"
        subtitle="Save a customer profile for future sales and debts."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <InputField
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chioma Okafor"
            required
          />
          <InputField
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="08012345678"
            keyboardType="phone-pad"
          />
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="customer@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <InputField
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Customer address"
            multiline
            numberOfLines={2}
          />
          <InputField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes about this customer..."
            multiline
            numberOfLines={2}
          />
          <Button title="Add Customer" onPress={handleAdd} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
