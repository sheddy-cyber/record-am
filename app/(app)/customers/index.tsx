import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { Badge, Button, Card, EmptyState, LoadingScreen, PaymentSummary, SectionHeader } from '@/components/ui';
import { InputField } from '@/components/forms';
import { HeaderAction, OverlayHeader, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from "@/constants";
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';

const fmt = (n: number) => `\u20A6${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function CustomersScreen() {
  const { currentBusiness } = useAuthStore();
  const {
    customers,
    selectedCustomer,
    customerSales,
    customerDebts,
    isLoading,
    isSaving,
    fetchCustomers,
    fetchCustomerDetail,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    setSelectedCustomer,
  } = useCustomerStore();

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
      fetchCustomers(currentBusiness.id);
    }
  }, [currentBusiness, fetchCustomers]);

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
      Alert.alert('Error', 'Customer name is required');
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

    if (customer) {
      setShowAdd(false);
      resetForm();
      Toast.show({ type: 'success', text1: 'Customer added', text2: name.trim() });
    } else {
      Alert.alert('Error', 'Failed to add customer');
    }
  };

  const handleEdit = async () => {
    if (!selectedCustomer) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }

    await updateCustomer(selectedCustomer.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setShowEdit(false);
    Toast.show({ type: 'success', text1: 'Customer updated' });
  };

  const handleDelete = (id: string, customerName: string) => {
    Alert.alert('Remove Customer', `Remove ${customerName} from your customer list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomer(id);
          setShowDetail(false);
          Toast.show({ type: 'success', text1: 'Customer removed' });
        },
      },
    ]);
  };

  const openDetail = async (customer: typeof customers[0]) => {
    setSelectedCustomer(customer);
    setShowDetail(true);

    if (currentBusiness) {
      await fetchCustomerDetail(customer.id, currentBusiness.id);
    }
  };

  const openEdit = () => {
    if (!selectedCustomer) return;
    setName(selectedCustomer.name);
    setPhone(selectedCustomer.phone ?? '');
    setEmail(selectedCustomer.email ?? '');
    setAddress(selectedCustomer.address ?? '');
    setNotes(selectedCustomer.notes ?? '');
    setShowEdit(true);
  };

  const filtered = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (customer.phone ?? '').includes(search),
  );

  const FormFields = () => (
    <>
      <InputField label="Full Name" value={name} onChangeText={setName} placeholder="e.g. Chioma Okafor" required />
      <InputField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="08012345678" keyboardType="phone-pad" />
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
    </>
  );

  if (isLoading && !customers.length) {
    return <LoadingScreen message="Loading customers..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Customers"
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
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total Customers</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.text.primary }}>{customers.length}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total Revenue</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.success }}>
              {fmt(customers.reduce((sum, customer) => sum + customer.total_spent, 0))}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Outstanding Debts</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>
              {fmt(customers.reduce((sum, customer) => sum + customer.outstanding_debt, 0))}
            </Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title="No customers yet"
            description="Add your first customer to start tracking purchases and debts."
            action={{ label: 'Add Customer', onPress: () => { resetForm(); setShowAdd(true); } }}
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
                      backgroundColor: COLORS.accent + '18',
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.accent }}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
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
                        {item.total_transactions} purchase{item.total_transactions !== 1 ? 's' : ''}
                      </Text>
                      {item.last_purchase ? (
                        <Text style={{ fontSize: 12, color: COLORS.text.muted }}>
                          Last: {format(new Date(item.last_purchase), 'MMM d')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.success }}>{fmt(item.total_spent)}</Text>
                    {item.outstanding_debt > 0 ? (
                      <Badge label={`Owes ${fmt(item.outstanding_debt)}`} variant="danger" />
                    ) : null}
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
            <OverlayHeader title="Add Customer" onClose={() => setShowAdd(false)} />
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <FormFields />
              <Button title="Add Customer" onPress={handleAdd} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
            </ScrollView>
          </ScreenShell>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEdit} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
            <OverlayHeader title="Edit Customer" onClose={() => setShowEdit(false)} />
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <FormFields />
              <Button title="Save Changes" onPress={handleEdit} loading={isSaving} size="lg" style={{ marginTop: 8 }} />
            </ScrollView>
          </ScreenShell>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDetail} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowDetail(false)}>
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <OverlayHeader title={selectedCustomer?.name ?? 'Customer Details'} onClose={() => setShowDetail(false)} />
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
            <Card style={{ backgroundColor: COLORS.ink }}>
              <View style={{ gap: 10 }}>
                {selectedCustomer?.phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="phone" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontSize: 14, color: 'rgba(255,253,248,0.8)' }}>{selectedCustomer.phone}</Text>
                  </View>
                ) : null}
                {selectedCustomer?.email ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="mail" size={14} color="rgba(255,253,248,0.8)" />
                    <Text style={{ fontSize: 13, color: 'rgba(255,253,248,0.68)' }}>{selectedCustomer.email}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  {[
                    { label: 'Total Spent', value: fmt(selectedCustomer?.total_spent ?? 0), color: '#6EE7B7' },
                    { label: 'Purchases', value: String(selectedCustomer?.total_transactions ?? 0), color: '#93C5FD' },
                    { label: 'Owes', value: fmt(selectedCustomer?.outstanding_debt ?? 0), color: '#FCA5A5' },
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
                onPress={() => selectedCustomer ? handleDelete(selectedCustomer.id, selectedCustomer.name) : undefined}
                variant="danger"
                size="sm"
                style={{ flex: 1 }}
                disabled={!selectedCustomer}
              />
            </View>

            {selectedCustomer?.address ? (
              <Card>
                <Text style={{ fontSize: 12, color: COLORS.text.muted, marginBottom: 8 }}>Address</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Feather name="map-pin" size={14} color={COLORS.text.muted} style={{ marginTop: 2 }} />
                  <Text style={{ fontSize: 14, color: COLORS.text.primary, flex: 1 }}>{selectedCustomer.address}</Text>
                </View>
              </Card>
            ) : null}

            {selectedCustomer?.notes ? (
              <Card style={{ backgroundColor: '#FFFAEB' }}>
                <Text style={{ fontSize: 12, color: COLORS.text.muted, marginBottom: 4 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: COLORS.text.secondary, fontStyle: 'italic' }}>"{selectedCustomer.notes}"</Text>
              </Card>
            ) : null}

            {customerDebts.filter((debt) => debt.status !== 'settled').length > 0 ? (
              <View>
                <SectionHeader title="Outstanding Debts" />
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {customerDebts
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
                          <View style={{ alignItems: 'flex-end' }}>
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
              {customerSales.length === 0 ? (
                <Card>
                  <Text style={{ color: COLORS.text.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                    No purchases yet
                  </Text>
                </Card>
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {customerSales.map((sale, index) => (
                    <View key={sale.id}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{sale.sale_number}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                            {format(new Date(sale.created_at), 'MMM d, yyyy · h:mm a')}
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 1 }}>
                            {sale.payment_method.toUpperCase()}
                          </Text>
                        </View>
                        <PaymentSummary totalAmount={sale.total_amount} amountPaid={sale.amount_paid} amountOwed={sale.amount_owed} />
                      </View>
                      {index < customerSales.length - 1 ? (
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
