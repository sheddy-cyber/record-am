import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

export default function SupplierCreateScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness } = useAuthStore();
  const { createSupplier, isSaving } = useSupplierStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const closeScreen = () => router.back();

  const handleAdd = async () => {
    if (!currentBusiness) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Supplier name is required.');
      return;
    }

    const supplier = await createSupplier({
      business_id: currentBusiness.id,
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    if (!supplier) {
      Alert.alert('Error', 'Failed to add supplier.');
      return;
    }

    Toast.show({
      type: 'success',
      text1: 'Supplier added',
      text2: name.trim(),
    });

    closeScreen();
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Add Supplier"
        subtitle="Save a supplier profile for goods bought and balances."
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <InputField
            label="Supplier or Business Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dangote Foods Ltd"
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
            placeholder="supplier@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <InputField
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Supplier address"
            multiline
            numberOfLines={2}
          />
          <InputField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="What they supply and any useful notes..."
            multiline
            numberOfLines={2}
          />
          <Button title="Add Supplier" onPress={handleAdd} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
