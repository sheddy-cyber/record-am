import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Button, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

export default function SupplierEditScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ supplierId?: string | string[] }>();
  const supplierId = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  const { currentBusiness } = useAuthStore();
  const {
    suppliers,
    selectedSupplier,
    isLoading,
    isSaving,
    fetchSuppliers,
    updateSupplier,
    setSelectedSupplier,
  } = useSupplierStore();

  const [hydratedSupplierId, setHydratedSupplierId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const closeScreen = () => router.back();

  useEffect(() => {
    if (currentBusiness && !suppliers.length) {
      fetchSuppliers(currentBusiness.id);
    }
  }, [currentBusiness, fetchSuppliers, suppliers.length]);

  const supplier = useMemo(() => {
    if (selectedSupplier?.id === supplierId) return selectedSupplier;
    return suppliers.find((item) => item.id === supplierId) ?? null;
  }, [selectedSupplier, supplierId, suppliers]);

  useEffect(() => {
    if (!supplier || hydratedSupplierId === supplier.id) return;
    setSelectedSupplier(supplier);
    setName(supplier.name);
    setPhone(supplier.phone ?? '');
    setEmail(supplier.email ?? '');
    setAddress(supplier.address ?? '');
    setNotes(supplier.notes ?? '');
    setHydratedSupplierId(supplier.id);
  }, [hydratedSupplierId, setSelectedSupplier, supplier]);

  const handleEdit = async () => {
    if (!supplier) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Supplier name is required.');
      return;
    }

    await updateSupplier(supplier.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    Toast.show({ type: 'success', text1: 'Supplier updated' });
    closeScreen();
  };


  if (!supplier) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Edit Supplier"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="truck"
          title="Supplier not found"
          description="This supplier record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Edit Supplier"
        subtitle={supplier.name}
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
          <Button title="Save Changes" onPress={handleEdit} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
