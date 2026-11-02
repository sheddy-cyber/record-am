import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { EmptyState, PermissionDenied, SmartChip } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW } from '@/constants';
import { ReconcileWarningBanner } from '@/components/inventory/ReconcileWarningBanner';
import { canManagePurchases, hasPermission } from '@/lib/permissions';

const formatCurrency = (value: number | undefined | null) =>
  `${CURRENCY_SYMBOL}${(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const formatSummaryCurrency = (value: number) => {
  const amount = Math.abs(value || 0);
  if (amount >= 1000000) return `${CURRENCY_SYMBOL}${(amount / 1000000).toFixed(1)}m`;
  if (amount >= 1000) return `${CURRENCY_SYMBOL}${(amount / 1000).toFixed(1)}k`;
  return formatCurrency(amount);
};

export default function SuppliersScreen() {
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const userRole = useAuthStore((s) => s.userRole);
  const suppliers = useSupplierStore((s) => s.suppliers);
  const fetchSuppliers = useSupplierStore((s) => s.fetchSuppliers);
  const setSelectedSupplier = useSupplierStore((s) => s.setSelectedSupplier);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [refreshing, setRefreshing] = useState(false);
  const [supplierView, setSupplierView] = useState<'all' | 'owing'>('all');
  const canViewPurchases = hasPermission(userRole, 'purchases.view');
  const canManageSupplierPurchases = canManagePurchases(userRole);

  const onRefresh = useCallback(async () => {
    if (!currentBusiness?.id || !canViewPurchases) return;
    setRefreshing(true);
    try {
      await fetchSuppliers(currentBusiness.id);
    } catch (_) {}
    setRefreshing(false);
  }, [canViewPurchases, currentBusiness?.id, fetchSuppliers]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      const matchesSearch =
        !q ||
        supplier.name.toLowerCase().includes(q) ||
        (supplier.phone ?? '').includes(q);
      const matchesView = supplierView === 'all' || supplier.outstanding_debt > 0;
      return matchesSearch && matchesView;
    });
  }, [suppliers, supplierView, deferredSearch]);

  const shownPurchases = useMemo(
    () => filtered.reduce((sum, supplier) => sum + supplier.total_purchased, 0),
    [filtered],
  );
  const shownDebt = useMemo(
    () => filtered.reduce((sum, supplier) => sum + supplier.outstanding_debt, 0),
    [filtered],
  );
  const hasActiveFilter = supplierView !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setSearch('');
    setSupplierView('all');
  };

  if (!canViewPurchases) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader title="Suppliers & Purchases" theme="dark" />
        <PermissionDenied
          title="Supplier purchases are restricted"
          description="Supplier balances and goods costs are available to owners, managers, and auditors only."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Suppliers & Purchases"
          subtitle={`${filtered.length} shown`}
          theme="dark"
          right={
            canManageSupplierPurchases ? (
              <HeaderAction icon="plus" label="Add" onPress={() => router.push('/(app)/supplier-create')} />
            ) : undefined
          }
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
            <Feather name="search" size={16} color={COLORS.text.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search supplier by name or phone..."
              placeholderTextColor={COLORS.text.muted}
              underlineColorAndroid="transparent"
              selectionColor={COLORS.accent}
              cursorColor={COLORS.accent}
              importantForAutofill="no"
              style={{ flex: 1, fontFamily: FONT.regular, color: COLORS.text.primary, fontSize: 14, paddingVertical: 10 }}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Feather name="x" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setSupplierView('all')}
              activeOpacity={0.7}
              style={{
                height: 34,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderWidth: 1,
                borderRadius: RADIUS.full,
                borderColor: supplierView === 'all' ? COLORS.navy : COLORS.border,
                backgroundColor: supplierView === 'all' ? COLORS.navy : COLORS.card,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 12,
                  color: supplierView === 'all' ? '#ffffff' : COLORS.text.secondary,
                }}
              >
                All Suppliers ({suppliers.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSupplierView('owing')}
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
                borderColor: supplierView === 'owing' ? COLORS.danger : COLORS.border,
                backgroundColor: supplierView === 'owing' ? COLORS.dangerLight : COLORS.card,
              }}
            >
              <Feather name="alert-circle" size={13} color={supplierView === 'owing' ? COLORS.danger : COLORS.text.muted} />
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 12,
                  color: supplierView === 'owing' ? COLORS.danger : COLORS.text.secondary,
                }}
              >
                We Owe
              </Text>
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
              {filtered.length} suppliers · <Text style={{ fontFamily: FONT.semiBold, color: COLORS.navy }}>{formatSummaryCurrency(shownPurchases)} purchased</Text>
            </Text>
            <Text numberOfLines={1} style={{ marginLeft: 8, fontFamily: FONT.semiBold, fontSize: 13, color: shownDebt > 0 ? COLORS.danger : COLORS.text.muted }}>
              {shownDebt > 0 ? `We Owe: ${formatSummaryCurrency(shownDebt)}` : 'No balances owed'}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 2 }}>
          <ReconcileWarningBanner onReconciled={() => { if (currentBusiness) fetchSuppliers(currentBusiness.id); }} />
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
              icon="truck"
              title={suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers'}
              description={suppliers.length === 0 ? 'Add suppliers to track goods bought from them and what you owe them.' : 'Try another search or return to all suppliers.'}
              action={suppliers.length === 0 ? { label: 'Add Supplier', onPress: () => router.push('/(app)/supplier-create') } : { label: 'Clear Filters', onPress: clearFilters }}
            />
          </ScrollView>
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                colors={[COLORS.accent]}
              />
            }
            
            renderItem={({ item }) => {
              const initials = (item.name || 'S').charAt(0).toUpperCase();

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedSupplier(item);
                    router.push({ pathname: '/(app)/supplier-detail', params: { supplierId: item.id } });
                  }}
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
                  {/* ── Top Bar: Avatar, Supplier Name & Total Purchased ── */}
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
                        {formatCurrency(item.total_purchased)}
                      </Text>
                      <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                        total supplied
                      </Text>
                    </View>
                  </View>

                  {/* ── Bottom Bar: Smart Micro-Chips & Drill-Down Affordance ── */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 8 }}>
                      <SmartChip
                        label={`${item.total_orders} ${item.total_orders === 1 ? 'order' : 'orders'}`}
                        icon="truck"
                        variant="neutral"
                        size="xs"
                      />

                      {item.last_order ? (
                        <SmartChip
                          label={`Last: ${format(new Date(item.last_order), 'MMM d')}`}
                          variant="neutral"
                          size="xs"
                        />
                      ) : null}

                      {item.outstanding_debt > 0 ? (
                        <SmartChip
                          label={`Owe ${formatCurrency(item.outstanding_debt)}`}
                          dot
                          variant="danger"
                          size="xs"
                        />
                      ) : null}
                    </View>

                    <Feather name="chevron-right" size={15} color={COLORS.text.muted} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </ScreenShell>
  );
}
