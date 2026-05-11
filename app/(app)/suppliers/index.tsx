import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Badge, Button, Card, EmptyState, LoadingScreen, PaymentSummary, SectionHeader } from '@/components/ui';
import { InputField } from '@/components/forms';
import { HeaderAction, OverlayHeader, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from "@/constants";
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';

const fmt = (n: number) => `\u20A6${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function SuppliersScreen() {
  const { currentBusiness } = useAuthStore();
  const {
    suppliers,
    selectedSupplier,
    supplierPurchases,
    supplierDebts,
    isLoading,
    isSaving,
    fetchSuppliers,
    fetchSupplierDetail,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    setSelectedSupplier,
  } = useSupplierStore();

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(() => {
    if (currentBusiness) {
      fetchSuppliers(currentBusiness.id);
    }
  }, [currentBusiness, fetchSuppliers]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
  };

  const handleAdd = async () => {
    if (!currentBusiness) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Supplier name is required');
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

    if (supplier) {
      setShowAdd(false);
      resetForm();
      Toast.show({ type: 'success', text1: 'Supplier added', text2: name.trim() });
    } else {
      Alert.alert('Error', 'Failed to add supplier');
    }
  };

  const handleEdit = async () => {
    if (!selectedSupplier) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Supplier name is required');
      return;
    }

    await updateSupplier(selectedSupplier.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setShowEdit(false);
    Toast.show({ type: 'success', text1: 'Supplier updated' });
  };

  const handleDelete = (id: string, supplierName: string) => {
    Alert.alert('Remove Supplier', `Remove ${supplierName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteSupplier(id);
          setShowDetail(false);
          Toast.show({ type: 'success', text1: 'Supplier removed' });
        },
      },
    ]);
  };

  const openDetail = async (supplier: typeof suppliers[0]) => {
    setSelectedSupplier(supplier);
    setShowDetail(true);
    if (currentBusiness) {
      await fetchSupplierDetail(supplier.id, currentBusiness.id);
    }
  };

  const openEdit = () => {
    if (!selectedSupplier) return;
    setName(selectedSupplier.name);
    setPhone(selectedSupplier.phone ?? '');
    setEmail(selectedSupplier.email ?? '');
    setAddress(selectedSupplier.address ?? '');
    setNotes(selectedSupplier.notes ?? '');
    setShowEdit(true);
  };

  const filtered = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      (supplier.phone ?? '').includes(search),
  );

  const FormFields = () => (
    <>
      <InputField
        label="Supplier or Business Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Dangote Foods Ltd"
        required
      />
      <InputField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="08012345678" keyboardType="phone-pad" />
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
    </>
  );

  if (isLoading && !suppliers.length) {
    return <LoadingScreen message="Loading suppliers..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Suppliers"
          theme="dark"
          right={<HeaderAction icon="plus" label="Add" onPress={() => { resetForm(); setShowAdd(true); }} />}
        />

        <View
          style={{
            backgroundColor: COLORS.card,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            paddingHorizontal: 20,
            paddingVertical: 14,
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone..."
            placeholderTextColor={COLORS.text.muted}
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surface,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: COLORS.text.primary,
              fontSize: 14,
            }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            gap: 24,
          }}
        >
          <View>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total Suppliers</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.text.primary }}>{suppliers.length}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total Purchased</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.accent }}>
              {fmt(suppliers.reduce((sum, supplier) => sum + supplier.total_purchased, 0))}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>We Owe</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>
              {fmt(suppliers.reduce((sum, supplier) => sum + supplier.outstanding_debt, 0))}
            </Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="truck"
            title="No suppliers yet"
            description="Add suppliers to track purchases and what you owe them."
            action={{ label: 'Add Supplier', onPress: () => { resetForm(); setShowAdd(true); } }}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <Card onPress={() => openDetail(item)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      backgroundColor: COLORS.ink + '18',
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="truck" size={20} color={COLORS.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>{item.name}</Text>
                    {item.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Feather name="phone" size={12} color={COLORS.text.muted} />
                        <Text style={{ fontSize: 13, color: COLORS.text.muted }}>{item.phone}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: COLORS.text.secondary }}>
                        {item.total_orders} order{item.total_orders !== 1 ? 's' : ''}
                      </Text>
                      {item.last_order ? (
                        <Text style={{ fontSize: 12, color: COLORS.text.muted }}>
                          Last: {format(new Date(item.last_order), 'MMM d')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.accent }}>{fmt(item.total_purchased)}</Text>
                    {item.outstanding_debt > 0 ? <Badge label={`Owe ${fmt(item.outstanding_debt)}`} variant="danger" /> : null}
                  </View>
                </View>
              </Card>
            )}
          />
        )}
      </View>

      <Modal visible={showAdd} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
            <OverlayHeader title="Add Supplier" onClose={() => setShowAdd(false)} />
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <FormFields />
              <Button title="Add Supplier" onPress={handleAdd} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
            </ScrollView>
          </ScreenShell>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEdit} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
            <OverlayHeader title="Edit Supplier" onClose={() => setShowEdit(false)} />
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <FormFields />
              <Button title="Save Changes" onPress={handleEdit} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
            </ScrollView>
          </ScreenShell>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDetail} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowDetail(false)}>
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <OverlayHeader title={selectedSupplier?.name ?? 'Supplier Details'} onClose={() => setShowDetail(false)} />
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
            <Card style={{ backgroundColor: COLORS.ink }}>
              <View style={{ gap: 10 }}>
                {selectedSupplier?.phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="phone" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontSize: 14, color: 'rgba(255,253,248,0.8)' }}>{selectedSupplier.phone}</Text>
                  </View>
                ) : null}
                {selectedSupplier?.email ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="mail" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontSize: 13, color: 'rgba(255,253,248,0.68)' }}>{selectedSupplier.email}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  {[
                    { label: 'Total Purchased', value: fmt(selectedSupplier?.total_purchased ?? 0), color: '#93C5FD' },
                    { label: 'Orders', value: String(selectedSupplier?.total_orders ?? 0), color: '#6EE7B7' },
                    { label: 'We Owe', value: fmt(selectedSupplier?.outstanding_debt ?? 0), color: '#FCA5A5' },
                  ].map((stat) => (
                    <View
                      key={stat.label}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(255,253,248,0.08)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,253,248,0.08)',
                        padding: 10,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: 'rgba(255,253,248,0.6)', marginBottom: 2 }}>{stat.label}</Text>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: stat.color }}>{stat.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Edit" icon="edit-2" onPress={openEdit} variant="secondary" size="sm" style={{ flex: 1 }} />
              <Button
                title="Remove"
                icon="trash-2"
                onPress={() => selectedSupplier ? handleDelete(selectedSupplier.id, selectedSupplier.name) : undefined}
                variant="danger"
                size="sm"
                style={{ flex: 1 }}
                disabled={!selectedSupplier}
              />
            </View>

            {selectedSupplier?.notes ? (
              <Card style={{ backgroundColor: '#FFFAEB' }}>
                <Text style={{ fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: COLORS.text.secondary, fontStyle: 'italic' }}>"{selectedSupplier.notes}"</Text>
              </Card>
            ) : null}

            {supplierDebts.filter((debt) => debt.status !== 'settled').length > 0 ? (
              <View>
                <SectionHeader title="What We Owe" />
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {supplierDebts
                    .filter((debt) => debt.status !== 'settled')
                    .map((debt, index, list) => (
                      <View key={debt.id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={{ fontSize: 13, color: COLORS.text.muted }}>{format(new Date(debt.created_at), 'MMM d, yyyy')}</Text>
                            {debt.due_date ? (
                              <Text style={{ fontSize: 12, color: COLORS.warning }}>
                                Due: {format(new Date(debt.due_date), 'MMM d')}
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger }}>{fmt(debt.balance)}</Text>
                            <Badge
                              label={debt.status === 'partial' ? 'Partial' : 'Outstanding'}
                              variant={debt.status === 'partial' ? 'warning' : 'danger'}
                            />
                          </View>
                        </View>
                        {index < list.length - 1 ? (
                          <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} />
                        ) : null}
                      </View>
                    ))}
                </Card>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Purchase History" />
              {supplierPurchases.length === 0 ? (
                <Card>
                  <Text style={{ color: COLORS.text.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                    No purchases recorded yet
                  </Text>
                </Card>
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {supplierPurchases.map((purchase, index) => (
                    <View key={purchase.id}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{purchase.purchase_number}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                            {format(new Date(purchase.created_at), 'MMM d, yyyy')}
                          </Text>
                        </View>
                        <PaymentSummary totalAmount={purchase.total_amount} amountPaid={purchase.amount_paid} amountOwed={purchase.amount_owed} />
                      </View>
                      {index < supplierPurchases.length - 1 ? (
                        <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 }} />
                      ) : null}
                    </View>
                  ))}
                </Card>
              )}
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
