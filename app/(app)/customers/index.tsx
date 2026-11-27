import React, { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { RefreshControl, Text, TextInput, View, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@/components/ui/touchables';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Icon } from '@/components/icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { CustomerWithStats, useCustomerStore } from '@/store/customerStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { EmptyState, ListSkeleton, SmartChip } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { dismissScreen } from '@/lib/navigation';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

const formatCurrency = (value: number | undefined | null) =>
  `${CURRENCY_SYMBOL}${(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const formatSummaryCurrency = (value: number) => {
  const amount = Math.abs(value || 0);
  if (amount >= 1000000) return `${CURRENCY_SYMBOL}${(amount / 1000000).toFixed(1)}m`;
  if (amount >= 1000) return `${CURRENCY_SYMBOL}${(amount / 1000).toFixed(1)}k`;
  return formatCurrency(amount);
};

const CustomerRow = memo(function CustomerRow({
  item,
  onOpen,
}: {
  item: CustomerWithStats;
  onOpen: (item: CustomerWithStats) => void;
}) {
  const initials = (item.name || 'C').charAt(0).toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onOpen(item)}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        padding: 15,
        marginBottom: 8,
        gap: 10,
      }}
    >
      {/* ── Top Bar: Avatar, Customer Name & Total Spend ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 38,
              height: 38,
              backgroundColor: COLORS.navyLight,
              borderRadius: RADIUS.full,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.ink }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, letterSpacing: -0.2 }} numberOfLines={1}>
              {item.name}
            </Text>
            {item.phone ? (
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 1 }}>
                {item.phone}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 15.5, fontFamily: FONT.bold, color: COLORS.text.primary, letterSpacing: -0.2 }}>
            {formatCurrency(item.total_spent)}
          </Text>
          <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>
            total spent
          </Text>
        </View>
      </View>

      {/* ── Bottom Bar: Smart Micro-Chips & Drill-Down Affordance ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 8 }}>
          <SmartChip
            label={`${item.total_transactions} ${item.total_transactions === 1 ? 'order' : 'orders'}`}
            icon="shopping-bag"
            variant="neutral"
            size="xs"
          />

          {item.last_purchase ? (
            <SmartChip
              label={`Last: ${format(new Date(item.last_purchase), 'MMM d')}`}
              variant="neutral"
              size="xs"
            />
          ) : null}

          {item.outstanding_debt > 0 ? (
            <SmartChip
              label={`Owes ${formatCurrency(item.outstanding_debt)}`}
              dot
              variant="danger"
              size="xs"
            />
          ) : null}
        </View>

        <Icon name="chevron-right" size={15} color={COLORS.text.muted} />
      </View>
    </TouchableOpacity>
  );
});

export default function CustomersScreen() {
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const customers = useCustomerStore((s) => s.customers);
  const loading = useCustomerStore((s) => s.isLoading && s.customers.length === 0);
  const fetchCustomers = useCustomerStore((s) => s.fetchCustomers);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [refreshing, setRefreshing] = useState(false);
  const [customerView, setCustomerView] = useState<'all' | 'owing'>('all');

  // Background refreshes (focus, realtime) are silent; the spinner is only for a pull.
  const refresh = useCallback(() => {
    if (businessId) void fetchCustomers(businessId).catch(() => {});
  }, [businessId, fetchCustomers]);

  const onPull = useCallback(async () => {
    if (!businessId) return;
    setRefreshing(true);
    try {
      await fetchCustomers(businessId);
    } catch (_) {}
    setRefreshing(false);
  }, [businessId, fetchCustomers]);

  useFocusEffect(refresh);

  useRealtimeRefresh({
    channelName: `customers-screen-${businessId ?? 'unknown'}`,
    enabled: Boolean(businessId),
    watch: [businessId],
    tables: [
      { table: 'customers', filter: `business_id=eq.${businessId}` },
      { table: 'customer_debts', filter: `business_id=eq.${businessId}` },
      { table: 'sales', filter: `business_id=eq.${businessId}` },
    ],
    onRefresh: refresh,
  });

  const openCustomer = useCallback(
    (item: CustomerWithStats) => {
      const store = useCustomerStore.getState();
      store.setSelectedCustomer(item);
      // Start loading their records while the screen slides in.
      if (businessId) void store.fetchCustomerDetail(item.id, businessId).catch(() => {});
      router.push({ pathname: '/(app)/customer-detail', params: { customerId: item.id } });
    },
    [businessId],
  );

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
    <ScreenShell backgroundColor={COLORS.surface}>
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Customers"
          large
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
          subtitle={`${filtered.length} ${filtered.length === 1 ? 'customer' : 'customers'}`}
         
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
          <View
            style={{
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: RADIUS.lg,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              paddingHorizontal: 14,
            }}
          >
            <Icon name="search" size={16} color={COLORS.text.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search customer by name or phone..."
              placeholderTextColor={COLORS.text.muted}
              underlineColorAndroid="transparent"
              selectionColor={COLORS.accent}
              cursorColor={COLORS.accent}
              importantForAutofill="no"
              style={{ flex: 1, fontFamily: FONT.regular, color: COLORS.text.primary, fontSize: 14, paddingVertical: 10 }}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Icon name="x" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setCustomerView('all')}
              activeOpacity={0.7}
              style={{
                height: 34,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderWidth: 1,
                borderRadius: RADIUS.full,
                borderColor: customerView === 'all' ? COLORS.navy : COLORS.border,
                backgroundColor: customerView === 'all' ? COLORS.navy : COLORS.card,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 12,
                  color: customerView === 'all' ? '#ffffff' : COLORS.text.secondary,
                }}
              >
                All Customers ({customers.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCustomerView('owing')}
              activeOpacity={0.7}
              style={{
                height: 34,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderWidth: 1,
                borderRadius: RADIUS.full,
                borderColor: customerView === 'owing' ? COLORS.danger : COLORS.border,
                backgroundColor: customerView === 'owing' ? COLORS.dangerLight : COLORS.card,
              }}
            >
              <Icon name="alert-circle" size={13} color={customerView === 'owing' ? COLORS.danger : COLORS.text.muted} />
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 12,
                  color: customerView === 'owing' ? COLORS.danger : COLORS.text.secondary,
                }}
              >
                Owing Money
              </Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />
            {hasActiveFilter ? (
              <TouchableOpacity onPress={clearFilters} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name="x-circle" size={14} color={COLORS.text.muted} />
                <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
              {filtered.length} customers · <Text style={{ fontFamily: FONT.semiBold, color: COLORS.success }}>{formatSummaryCurrency(shownRevenue)} spent</Text>
            </Text>
            <Text numberOfLines={1} style={{ marginLeft: 8, fontFamily: FONT.semiBold, fontSize: 13, color: shownDebt > 0 ? COLORS.danger : COLORS.text.muted }}>
              {shownDebt > 0 ? `Total Owed: ${formatSummaryCurrency(shownDebt)}` : 'All debts settled'}
            </Text>
          </View>
        </View>

        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPull}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          renderItem={({ item }) => <CustomerRow item={item} onOpen={openCustomer} />}
          ListEmptyComponent={
            loading ? (
              <ListSkeleton rows={6} style={{ paddingHorizontal: 0, paddingTop: 4 }} />
            ) : (
              <EmptyState
                icon="users"
                title={customers.length === 0 ? 'No customers yet' : 'No matching customers'}
                description={customers.length === 0 ? 'Add your first customer to start tracking purchases and debts.' : 'Try another search or return to all customers.'}
                action={customers.length === 0 ? { label: 'Add Customer', onPress: () => router.push('/(app)/customer-create') } : { label: 'Clear Filters', onPress: clearFilters }}
              />
            )
          }
        />
      </View>
    </ScreenShell>
  );
}
