import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { Badge, EmptyState, LoadingScreen } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function CustomersScreen() {
  const { currentBusiness } = useAuthStore();
  const { customers, isLoading, fetchCustomers, setSelectedCustomer } = useCustomerStore();
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    if (currentBusiness) {
      fetchCustomers(currentBusiness.id);
    }
  }, [currentBusiness, fetchCustomers]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (customer.phone ?? '').includes(search),
  );

  if (isLoading && !customers.length) {
    return <LoadingScreen message="Loading customers..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Customers"
          subtitle={`${customers.length} total`}
          theme="dark"
          right={<HeaderAction icon="plus" label="Add" onPress={() => router.push('/(app)/customer-create')} />}
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
              fontFamily: FONT.regular,
              borderWidth: 1,
              borderRadius: RADIUS.md,
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
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Total Customers</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.text.primary }}>{customers.length}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Total Revenue</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.success }}>
              {formatCurrency(customers.reduce((sum, customer) => sum + customer.total_spent, 0))}
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Outstanding Debts</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>
              {formatCurrency(customers.reduce((sum, customer) => sum + customer.outstanding_debt, 0))}
            </Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title="No customers yet"
            description="Add your first customer to start tracking purchases and debts."
            action={{ label: 'Add Customer', onPress: () => router.push('/(app)/customer-create') }}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedCustomer(item);
                  router.push({ pathname: '/(app)/customer-detail', params: { customerId: item.id } });
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 16,
                    borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      backgroundColor: COLORS.accent + '18',
                      borderRadius: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="user" size={22} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {item.name}
                    </Text>
                    {item.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Feather name="phone" size={12} color={COLORS.text.muted} />
                        <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted }}>
                          {item.phone}
                        </Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary }}>
                        {item.total_transactions} purchase{item.total_transactions !== 1 ? 's' : ''}
                      </Text>
                      {item.last_purchase ? (
                        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                          Last: {format(new Date(item.last_purchase), 'MMM d')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.success }}>
                      {formatCurrency(item.total_spent)}
                    </Text>
                    {item.outstanding_debt > 0 ? (
                      <Badge label={`Owes ${formatCurrency(item.outstanding_debt)}`} variant="danger" />
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </ScreenShell>
  );
}
