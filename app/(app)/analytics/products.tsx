import React, { useDeferredValue, useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore, TopProduct } from '@/store/analyticsStore';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';
import { ScreenShell, ScreenHeader, HeaderAction } from '@/components/layout';
import { COLORS, FONT, RADIUS, CURRENCY_SYMBOL } from '@/constants';
import { Button, BottomSheetModal, EmptyState, IconButton, PermissionDenied, Pill } from '@/components/ui';
import { ProductAnalysisPrintData, printProductAnalysis, shareProductAnalysisPDF } from '@/lib/reports';

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
  const { currentBusiness, currentBranch, userRole } = useAuthStore();
  const canViewAnalytics = hasPermission(userRole, 'analytics.view');
  const { allProducts } = useAnalyticsStore();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [sortField, setSortField] = useState<SortField>('quantity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPDF, setIsSharingPDF] = useState(false);
  
  const sortedAndFiltered = useMemo(() => {
    let filtered = allProducts;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
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
  }, [allProducts, deferredSearch, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handlePrint = async (type: 'print' | 'share') => {
    if (!currentBusiness) {
      Toast.show({ type: 'error', text1: 'Business information missing' });
      return;
    }

    if (sortedAndFiltered.length === 0) {
      Toast.show({ type: 'info', text1: 'No products to print' });
      return;
    }

    const sortFieldLabel =
      sortField === 'quantity'
        ? 'Quantity Sold'
        : sortField === 'revenue'
          ? 'Revenue'
          : 'Gross Profit';
    const sortDescription = `Sorted by ${sortFieldLabel} (${sortOrder === 'desc' ? 'Highest to Lowest' : 'Lowest to Highest'})`;

    const totalQtySold = sortedAndFiltered.reduce((sum, p) => sum + p.total_qty, 0);
    const totalRevenue = sortedAndFiltered.reduce((sum, p) => sum + p.total_revenue, 0);
    const totalProfit = sortedAndFiltered.reduce((sum, p) => sum + p.total_profit, 0);

    const printData: ProductAnalysisPrintData = {
      business: currentBusiness,
      branch: currentBranch,
      items: sortedAndFiltered.map((p, idx) => ({
        rank: idx + 1,
        name: p.product_name,
        quantitySold: p.total_qty,
        revenue: p.total_revenue,
        profit: p.total_profit,
      })),
      sortDescription,
      searchQuery: search.trim() || undefined,
      totalProducts: sortedAndFiltered.length,
      totalQtySold,
      totalRevenue,
      totalProfit,
    };

    if (type === 'print') {
      setIsPrinting(true);
      try {
        await printProductAnalysis(printData);
        setPrintModalVisible(false);
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Unable to print', text2: err?.message });
      } finally {
        setIsPrinting(false);
      }
    } else {
      setIsSharingPDF(true);
      try {
        await shareProductAnalysisPDF(printData);
        setPrintModalVisible(false);
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Unable to export PDF', text2: err?.message });
      } finally {
        setIsSharingPDF(false);
      }
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

    const last = index === sortedAndFiltered.length - 1;
    return (
      <View style={[rowStyles.row, index === 0 && rowStyles.first, last && rowStyles.last]}>
        <View style={[rowStyles.inner, !last && rowStyles.divider]}>
          <Text style={rowStyles.rank}>{index + 1}</Text>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={rowStyles.name} numberOfLines={1}>
                {item.product_name}
              </Text>
              <Text style={rowStyles.value}>
                {sortField === 'quantity'
                  ? `${fmtCount(item.total_qty)} sold`
                  : sortField === 'revenue'
                  ? fmt(item.total_revenue)
                  : fmt(item.total_profit)}
              </Text>
            </View>
            <View style={rowStyles.track}>
              <View style={[rowStyles.fill, { width: `${Math.max(pct > 0 ? 3 : 0, pct * 100)}%` }]} />
            </View>
            <Text style={rowStyles.detail}>
              {fmtCount(item.total_qty)} sold · {fmt(item.total_revenue)} revenue · {fmt(item.total_profit)} profit
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (!canViewAnalytics) {
    return (
      <ScreenShell backgroundColor={COLORS.surface}>
        <ScreenHeader
          title="Product Analytics"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Analytics is restricted"
          description="Product performance and profit data are available to owners only."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScreenHeader
        title="Products"
        large
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        subtitle={`${sortedAndFiltered.length} sold in this period`}
        right={
          <IconButton
            icon="printer"
            variant="outline"
            accessibilityLabel="Print or share"
            onPress={() => {
              if (sortedAndFiltered.length === 0) {
                Toast.show({ type: 'info', text1: 'Nothing to print yet' });
                return;
              }
              setPrintModalVisible(true);
            }}
          />
        }
      />

      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        <View style={rowStyles.search}>
          <Icon name="search" size={17} color={COLORS.text.muted} />
          <TextInput
            placeholder="Search products"
            placeholderTextColor={COLORS.text.muted}
            value={search}
            onChangeText={setSearch}
            style={rowStyles.searchInput}
          />
          {search ? <Icon name="x-circle" size={17} color={COLORS.text.muted} onPress={() => setSearch('')} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { id: 'quantity', label: 'Quantity' },
            { id: 'revenue', label: 'Revenue' },
            { id: 'profit', label: 'Profit' },
          ].map((option) => (
            <Pill
              key={option.id}
              label={sortField === option.id ? `${option.label} ${sortOrder === 'desc' ? '↓' : '↑'}` : option.label}
              active={sortField === option.id}
              onPress={() => toggleSort(option.id as SortField)}
            />
          ))}
        </View>
      </View>

      <FlatList
        data={sortedAndFiltered}
        keyExtractor={(item) => item.product_id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <EmptyState
            icon="package"
            title={search ? 'No products found' : 'No products'}
            description={search ? `No matches for "${search}"` : 'No products in inventory to analyze.'}
          />
        }
      />
      <BottomSheetModal
        visible={printModalVisible}
        onClose={() => {
          if (!isPrinting && !isSharingPDF) setPrintModalVisible(false);
        }}
        title="Print product report"
        subtitle="An A4 summary of the list you are looking at"
        showCloseButton={!isPrinting && !isSharingPDF}
      >
        {/* Summary Details Card */}
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 14,
            marginBottom: 16,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>Products</Text>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: COLORS.text.primary }}>
              {sortedAndFiltered.length} items
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>Sorted By</Text>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.medium, color: COLORS.text.primary }}>
              {sortField === 'quantity' ? 'Quantity Sold' : sortField === 'revenue' ? 'Revenue' : 'Gross Profit'} ({sortOrder === 'desc' ? 'High to Low' : 'Low to High'})
            </Text>
          </View>
          {search.trim() ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>Filter Search</Text>
              <Text style={{ fontSize: 12.5, fontFamily: FONT.medium, color: COLORS.text.secondary }}>
                "{search.trim()}"
              </Text>
            </View>
          ) : null}
          <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 2 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>Total Revenue</Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
              {CURRENCY_SYMBOL}{sortedAndFiltered.reduce((s, p) => s + p.total_revenue, 0).toLocaleString('en-NG')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>Gross Profit</Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.success }}>
              {CURRENCY_SYMBOL}{sortedAndFiltered.reduce((s, p) => s + p.total_profit, 0).toLocaleString('en-NG')}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 8 }}>
          <Button
            title="Print"
            variant="primary"
            size="md"
            loading={isPrinting}
            disabled={isSharingPDF}
            icon="printer"
            onPress={() => handlePrint('print')}
          />

          <Button
            title="Share as PDF"
            variant="secondary"
            size="md"
            loading={isSharingPDF}
            disabled={isPrinting}
            icon="share-2"
            onPress={() => handlePrint('share')}
          />
        </View>
      </BottomSheetModal>
    </ScreenShell>
  );
}

const rowStyles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 13,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontFamily: FONT.regular, fontSize: 15.5, color: COLORS.text.primary, paddingVertical: 0 },
  row: {
    marginHorizontal: 20,
    backgroundColor: COLORS.card,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingLeft: 14,
  },
  first: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth },
  last: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  inner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingRight: 16 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rank: { width: 22, fontSize: 15, fontFamily: FONT.display, color: COLORS.text.muted, textAlign: 'center' },
  name: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary, flexShrink: 1 },
  value: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, backgroundColor: COLORS.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: COLORS.accent },
  detail: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, fontVariant: ['tabular-nums'] },
});
