import React, { useDeferredValue, useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore, TopProduct } from '@/store/analyticsStore';
import { ScreenShell, ScreenHeader, HeaderAction } from '@/components/layout';
import { COLORS, FONT, RADIUS, CURRENCY_SYMBOL } from '@/constants';
import { Button, EmptyState } from '@/components/ui';
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
  const { currentBusiness, currentBranch } = useAuthStore();
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
                borderColor: COLORS.ink + '20',
                backgroundColor: COLORS.ink + '12',
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
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
        right={
          <HeaderAction 
            icon="printer" 
            onPress={() => {
              if (sortedAndFiltered.length === 0) {
                Toast.show({ type: 'info', text1: 'No products to print' });
                return;
              }
              setPrintModalVisible(true);
            }} 
          />
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
      <Modal
        visible={printModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isPrinting && !isSharingPDF) setPrintModalVisible(false);
        }}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
          onPress={() => {
            if (!isPrinting && !isSharingPDF) setPrintModalVisible(false);
          }}
        >
          <Pressable
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: RADIUS.xl,
              borderTopRightRadius: RADIUS.xl,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: insets.bottom + 20,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: RADIUS.md,
                    backgroundColor: COLORS.ink + '12',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="printer" size={18} color={COLORS.ink} />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                    Print Product Analytics
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                    Executive A4 performance sheet
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setPrintModalVisible(false)}
                disabled={isPrinting || isSharingPDF}
              >
                <Feather name="x" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

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
                title="Print Report"
                variant="accent"
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
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
