import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAnalyticsStore, TopProduct } from '@/store/analyticsStore';
import { ScreenShell, ScreenHeader } from '@/components/layout';
import { COLORS, FONT, RADIUS, CURRENCY_SYMBOL } from '@/constants';
import { EmptyState } from '@/components/ui';

const fmtCount = (n: number) => n.toLocaleString();
const fmt = (n: number) =>
  n >= 1000000
    ? `${CURRENCY_SYMBOL}${(n / 1000000).toFixed(1)}m`
    : n >= 1000
      ? `${CURRENCY_SYMBOL}${(n / 1000).toFixed(1)}k`
      : `${CURRENCY_SYMBOL}${n.toFixed(0)}`;

type SortField = 'quantity' | 'revenue' | 'profit';
type SortOrder = 'desc' | 'asc';

export default function AnalyticsProductsScreen() {
  const insets = useSafeAreaInsets();
  const { allProducts } = useAnalyticsStore();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('quantity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const sortedAndFiltered = useMemo(() => {
    let filtered = allProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) => p.product_name.toLowerCase().includes(q));
    }
    
    return [...filtered].sort((a, b) => {
      let valA = a.total_qty, valB = b.total_qty;
      if (sortField === 'revenue') {
        valA = a.total_revenue;
        valB = b.total_revenue;
      } else if (sortField === 'profit') {
        valA = a.total_profit;
        valB = b.total_profit;
      }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [allProducts, search, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderItem = ({ item, index }: { item: TopProduct; index: number }) => {
    let maxVal = 0;
    let itemVal = 0;

    if (allProducts.length > 0) {
      if (sortField === 'quantity') {
        maxVal = Math.max(...allProducts.map((p) => p.total_qty));
        itemVal = item.total_qty;
      } else if (sortField === 'revenue') {
        maxVal = Math.max(...allProducts.map((p) => p.total_revenue));
        itemVal = item.total_revenue;
      } else {
        maxVal = Math.max(...allProducts.map((p) => p.total_profit));
        itemVal = item.total_profit;
      }
    }

    // if maxVal is 0 or negative (e.g. all profits negative), we don't show a bar.
    // For simplicity, if maxVal > 0, we do itemVal / maxVal, but floor at 0 for negative profits.
    const pct = maxVal > 0 ? Math.max(0, itemVal) / maxVal : 0;

    return (
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderWidth: 1,
                borderRadius: RADIUS.md,
                borderColor: COLORS.border,
                backgroundColor: COLORS.accent + '18',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.ink }}>{index + 1}</Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1 }} numberOfLines={1}>
              {item.product_name}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
              {fmtCount(item.total_qty)} sold
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
              {fmt(item.total_revenue)} rev • {fmt(item.total_profit)} profit
            </Text>
          </View>
        </View>
        <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
          <View
            style={{
              height: 6,
              backgroundColor: COLORS.ink,
              width: `${pct * 100}%`,
              borderRadius: 3,
            }}
          />
        </View>
      </View>
    );
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader 
        title="Product Analytics" 
        left={
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="chevron-left" size={24} color={COLORS.ink} />
          </TouchableOpacity>
        }
      />
      
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.card,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: RADIUS.full,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Feather name="search" size={18} color={COLORS.text.muted} />
          <TextInput
            placeholder="Search products..."
            placeholderTextColor={COLORS.text.muted}
            value={search}
            onChangeText={setSearch}
            style={{
              flex: 1,
              marginLeft: 10,
              fontFamily: FONT.regular,
              fontSize: 15,
              color: COLORS.text.primary,
              padding: 0,
            }}
          />
          {search ? (
            <Feather
              name="x-circle"
              size={18}
              color={COLORS.text.muted}
              onPress={() => setSearch('')}
            />
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { id: 'quantity', label: 'Quantity Sold' },
              { id: 'revenue', label: 'Revenue' },
              { id: 'profit', label: 'Gross Profit' },
            ].map((option) => {
              const isActive = sortField === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => toggleSort(option.id as SortField)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    borderColor: isActive ? COLORS.ink : COLORS.border,
                    backgroundColor: isActive ? COLORS.ink : COLORS.surface,
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: FONT.medium,
                      color: isActive ? COLORS.text.inverse : COLORS.text.secondary,
                    }}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Feather
                      name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={COLORS.text.inverse}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <FlatList
        data={sortedAndFiltered}
        keyExtractor={(item) => item.product_id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          <EmptyState
            icon="package"
            title={search ? 'No products found' : 'No products'}
            description={search ? `No matches for "${search}"` : 'No products in inventory to analyze.'}
          />
        }
      />
    </ScreenShell>
  );
}
