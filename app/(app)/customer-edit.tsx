import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

export default function CustomerEditScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ customerId?: string | string[] }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const { currentBusiness } = useAuthStore();
  const {
    customers,
    selectedCustomer,
    isLoading,
    isSaving,
    fetchCustomers,
    updateCustomer,
    setSelectedCustomer,
  } = useCustomerStore();

  const [hydratedCustomerId, setHydratedCustomerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const closeScreen = () => router.back();

  useEffect(() => {
    // Customers are hydrated globally by bootloader
  }, [currentBusiness]);

  const customer = useMemo(() => {
    if (selectedCustomer?.id === customerId) return selectedCustomer;
    return customers.find((item) => item.id === customerId) ?? null;
  }, [customerId, customers, selectedCustomer]);

  useEffect(() => {
    if (!customer || hydratedCustomerId === customer.id) return;
    setSelectedCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone ?? '');
    setEmail(customer.email ?? '');
    setAddress(customer.address ?? '');
    setNotes(customer.notes ?? '');
    setHydratedCustomerId(customer.id);
  }, [customer, hydratedCustomerId, setSelectedCustomer]);

  const handleEdit = async () => {
    if (!customer) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Customer name is required.');
      return;
    }

    await updateCustomer(customer.id, {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    });

    Toast.show({ type: 'success', text1: 'Customer updated' });
    closeScreen();
  };


  if (!customer) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Edit Customer"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="user"
          title="Customer not found"
          description="This customer record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Edit Customer"
        subtitle={customer.name}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
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
          <Button title="Save Changes" onPress={handleEdit} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
