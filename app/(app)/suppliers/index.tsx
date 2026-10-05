import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { Badge, EmptyState, PermissionDenied } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
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
          <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 13 }}>
            <Feather name="search" size={16} color={COLORS.text.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search supplier or phone"
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
              onPress={() => setSupplierView('all')}
              activeOpacity={0.8}
              style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.full, borderColor: supplierView === 'all' ? COLORS.ink : COLORS.border, backgroundColor: supplierView === 'all' ? COLORS.ink : COLORS.card }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: supplierView === 'all' ? COLORS.text.inverse : COLORS.text.secondary }}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSupplierView('owing')}
              activeOpacity={0.8}
              style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.full, borderColor: supplierView === 'owing' ? COLORS.danger : COLORS.border, backgroundColor: supplierView === 'owing' ? '#FEF3F2' : COLORS.card }}
            >
              <Feather name="alert-circle" size={13} color={supplierView === 'owing' ? COLORS.danger : COLORS.text.muted} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: supplierView === 'owing' ? COLORS.danger : COLORS.text.secondary }}>We owe</Text>
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
              {filtered.length} shown · <Text style={{ fontFamily: FONT.medium, color: COLORS.accent }}>{formatSummaryCurrency(shownPurchases)} purchased</Text>
            </Text>
            <Text numberOfLines={1} style={{ marginLeft: 8, fontFamily: FONT.bold, fontSize: 13, color: shownDebt > 0 ? COLORS.danger : COLORS.text.muted }}>
              {shownDebt > 0 ? `Owe ${formatSummaryCurrency(shownDebt)}` : 'All clear'}
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
              </Pressable>
            )}
          />
        )}
      </View>
    </ScreenShell>
  );
}
