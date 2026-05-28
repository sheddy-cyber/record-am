import React, { useCallback, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Badge, EmptyState, LoadingScreen } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { ReconcileWarningBanner } from '@/components/inventory/ReconcileWarningBanner';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function SuppliersScreen() {
  const { currentBusiness } = useAuthStore();
  const { suppliers, isLoading, fetchSuppliers, setSelectedSupplier } = useSupplierStore();
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    if (currentBusiness) {
      fetchSuppliers(currentBusiness.id);
    }
  }, [currentBusiness, fetchSuppliers]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      (supplier.phone ?? '').includes(search),
  );

  if (isLoading && !suppliers.length) {
    return <LoadingScreen message="Loading suppliers..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Suppliers & Purchases"
          subtitle={`${suppliers.length} total`}
          theme="dark"
          right={<HeaderAction icon="plus" label="Add" onPress={() => router.push('/(app)/supplier-create')} />}
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
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Total Suppliers</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.text.primary }}>{suppliers.length}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Total Purchased</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.accent }}>
              {formatCurrency(suppliers.reduce((sum, supplier) => sum + supplier.total_purchased, 0))}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>We Owe</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.danger }}>
              {formatCurrency(suppliers.reduce((sum, supplier) => sum + supplier.outstanding_debt, 0))}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <ReconcileWarningBanner onReconciled={load} />
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="truck"
            title="No suppliers yet"
            description="Add suppliers to track goods bought from them and what you owe them."
            action={{ label: 'Add Supplier', onPress: () => router.push('/(app)/supplier-create') }}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedSupplier(item);
                  router.push({ pathname: '/(app)/supplier-detail', params: { supplierId: item.id } });
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
                      backgroundColor: COLORS.ink + '18',
                      borderWidth: 1,
                      borderRadius: RADIUS.md,
                      borderColor: COLORS.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="truck" size={20} color={COLORS.ink} />
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
                        {item.total_orders} order{item.total_orders !== 1 ? 's' : ''}
                      </Text>
                      {item.last_order ? (
                        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                          Last: {format(new Date(item.last_order), 'MMM d')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.accent }}>
                      {formatCurrency(item.total_purchased)}
                    </Text>
                    {item.outstanding_debt > 0 ? (
                      <Badge label={`Owe ${formatCurrency(item.outstanding_debt)}`} variant="danger" />
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
