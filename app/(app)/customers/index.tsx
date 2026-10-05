import React, { useCallback, useEffect, useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Badge, EmptyState } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number | undefined | null) =>
  `${CURRENCY_SYMBOL}${(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const formatSummaryCurrency = (value: number) => {
  const amount = Math.abs(value || 0);
  if (amount >= 1000000) return `${CURRENCY_SYMBOL}${(amount / 1000000).toFixed(1)}m`;
  if (amount >= 1000) return `${CURRENCY_SYMBOL}${(amount / 1000).toFixed(1)}k`;
  return formatCurrency(amount);
};

export default function CustomersScreen() {
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const customers = useCustomerStore((s) => s.customers);
  const fetchCustomers = useCustomerStore((s) => s.fetchCustomers);
  const setSelectedCustomer = useCustomerStore((s) => s.setSelectedCustomer);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [refreshing, setRefreshing] = useState(false);
  const [customerView, setCustomerView] = useState<'all' | 'owing'>('all');

  const onRefresh = useCallback(async () => {
    if (!currentBusiness?.id) return;
    setRefreshing(true);
    try {
      await fetchCustomers(currentBusiness.id);
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness?.id, fetchCustomers]);

  useEffect(() => {
    if (currentBusiness?.id) {
      void fetchCustomers(currentBusiness.id);
    }
  }, [currentBusiness?.id, fetchCustomers]);

  useFocusEffect(
    useCallback(() => {
      if (currentBusiness?.id) {
        void fetchCustomers(currentBusiness.id);
      }
    }, [currentBusiness?.id, fetchCustomers]),
  );

  useRealtimeRefresh({
    channelName: `customers-screen-${currentBusiness?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness?.id),
    watch: [currentBusiness?.id],
    tables: [
      { table: 'customers', filter: `business_id=eq.${currentBusiness?.id}` },
      { table: 'customer_debts', filter: `business_id=eq.${currentBusiness?.id}` },
      { table: 'sales', filter: `business_id=eq.${currentBusiness?.id}` },
    ],
    onRefresh: onRefresh,
  });

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        !q ||
        customer.name.toLowerCase().includes(q) ||
        (customer.phone ?? '').includes(q);
      const matchesView = customerView === 'all' || customer.outstanding_debt > 0;
      return matchesSearch && matchesView;
    });
  }, [customers, customerView, deferredSearch]);

  const shownRevenue = useMemo(
    () => filtered.reduce((sum, customer) => sum + customer.total_spent, 0),
    [filtered],
  );
  const shownDebt = useMemo(
    () => filtered.reduce((sum, customer) => sum + customer.outstanding_debt, 0),
    [filtered],
  );
  const hasActiveFilter = customerView !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setSearch('');
    setCustomerView('all');
  };


  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Customers"
          subtitle={`${filtered.length} shown`}
          theme="dark"
          right={<HeaderAction icon="plus" label="Add" onPress={() => router.push('/(app)/customer-create')} />}
        />

        <View
          style={{
            backgroundColor: COLORS.surface,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 10,
            gap: 10,
          }}
        >
          <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 13 }}>
            <Feather name="search" size={16} color={COLORS.text.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name or phone"
              placeholderTextColor={COLORS.text.muted}
              underlineColorAndroid="transparent"
              selectionColor={COLORS.accent}
              cursorColor={COLORS.accent}
              importantForAutofill="no"
              style={{ flex: 1, fontFamily: FONT.regular, color: COLORS.text.primary, fontSize: 14, paddingVertical: 9 }}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Feather name="x" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setCustomerView('all')}
              activeOpacity={0.8}
              style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.full, borderColor: customerView === 'all' ? COLORS.ink : COLORS.border, backgroundColor: customerView === 'all' ? COLORS.ink : COLORS.card }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: customerView === 'all' ? COLORS.text.inverse : COLORS.text.secondary }}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCustomerView('owing')}
              activeOpacity={0.8}
              style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.full, borderColor: customerView === 'owing' ? COLORS.danger : COLORS.border, backgroundColor: customerView === 'owing' ? '#FEF3F2' : COLORS.card }}
            >
              <Feather name="alert-circle" size={13} color={customerView === 'owing' ? COLORS.danger : COLORS.text.muted} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: customerView === 'owing' ? COLORS.danger : COLORS.text.secondary }}>Owing</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {hasActiveFilter ? (
              <TouchableOpacity onPress={clearFilters} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Feather name="x-circle" size={14} color={COLORS.text.muted} />
                <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
              {filtered.length} shown · <Text style={{ fontFamily: FONT.medium, color: COLORS.success }}>{formatSummaryCurrency(shownRevenue)} spent</Text>
            </Text>
            <Text numberOfLines={1} style={{ marginLeft: 8, fontFamily: FONT.bold, fontSize: 13, color: shownDebt > 0 ? COLORS.danger : COLORS.text.muted }}>
              {shownDebt > 0 ? `Owed ${formatSummaryCurrency(shownDebt)}` : 'All clear'}
            </Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                colors={[COLORS.accent]}
              />
            }
          >
            <EmptyState
              icon="users"
              title={customers.length === 0 ? 'No customers yet' : 'No matching customers'}
              description={customers.length === 0 ? 'Add your first customer to start tracking purchases and debts.' : 'Try another search or return to all customers.'}
              action={customers.length === 0 ? { label: 'Add Customer', onPress: () => router.push('/(app)/customer-create') } : { label: 'Clear Filters', onPress: clearFilters }}
            />
          </ScrollView>
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                colors={[COLORS.accent]}
              />
            }
            
            renderItem={({ item, index }) => (
              <Pressable
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
              </Pressable>
            )}
          />
        )}
      </View>
    </ScreenShell>
  );
}
