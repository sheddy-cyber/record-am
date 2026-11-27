// ============================================================
// RECORD AM - Purchase history
// Every purchase in the branch, newest first, including ones with no supplier
// (stock added without naming a supplier, staff restocks). Stock and purchases
// are linked, so this list always matches what came into stock.
// ============================================================

import React, { memo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/touchables';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { EmptyState, ListSkeleton, SmartChip } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { reconcileList } from '@/lib/storeUtils';
import { fetchPurchasePage } from '@/store/purchaseStore';
import { Purchase } from '@/types';

const PAGE_SIZE = 30;

const money = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

const itemSummary = (purchase: Purchase) => {
  const items = purchase.items ?? [];
  if (items.length === 0) return purchase.notes?.trim() || 'Purchase';
  const text = items
    .map((item) => `${Number(item.quantity)}× ${item.product?.name ?? 'Item'}`)
    .join(', ');
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

const PurchaseRow = memo(function PurchaseRow({
  purchase,
  onOpen,
}: {
  purchase: Purchase;
  onOpen?: (purchase: Purchase) => void;
}) {
  const owed = Number(purchase.amount_owed ?? 0);
  const date = purchase.purchase_date || purchase.created_at;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={!onOpen}
      onPress={() => onOpen?.(purchase)}
      style={styles.row}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.supplier} numberOfLines={1}>
          {purchase.supplier?.name || 'No supplier'}
        </Text>
        <Text style={styles.items} numberOfLines={1}>
          {itemSummary(purchase)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {purchase.purchase_number} · {date ? format(new Date(date), 'd MMM yyyy') : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.total}>{money(purchase.total_amount)}</Text>
        {owed > 0 ? (
          <SmartChip label={`Owes ${money(owed)}`} variant="danger" size="xs" />
        ) : (
          <SmartChip label="Paid" variant="success" size="xs" />
        )}
      </View>
    </TouchableOpacity>
  );
});

export function PurchaseHistoryList({
  businessId,
  branchId,
  canEdit,
  header,
}: {
  businessId: string;
  branchId: string;
  canEdit: boolean;
  header?: React.ReactElement;
}) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pagesRef = useRef(1);

  // Reload every page already shown, in one request, so a refresh never
  // shortens the list.
  const load = useCallback(async () => {
    const result = await fetchPurchasePage({
      businessId,
      branchId,
      page: 0,
      pageSize: PAGE_SIZE * pagesRef.current,
    });
    setPurchases((prev) => reconcileList(prev, result.purchases));
    setHasMore(result.hasMore);
    setLoading(false);
  }, [businessId, branchId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useRealtimeRefresh({
    channelName: `purchase-history-${branchId}`,
    enabled: Boolean(branchId),
    watch: [branchId],
    tables: [
      { table: 'purchases', filter: `branch_id=eq.${branchId}` },
      { table: 'purchase_items' },
    ],
    onRefresh: () => void load(),
  });

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = pagesRef.current;
      const result = await fetchPurchasePage({ businessId, branchId, page, pageSize: PAGE_SIZE });
      pagesRef.current = page + 1;
      setPurchases((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...result.purchases.filter((p) => !seen.has(p.id))];
      });
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const openPurchase = useCallback((purchase: Purchase) => {
    router.push({ pathname: '/(app)/record-purchase', params: { purchaseId: purchase.id } });
  }, []);

  return (
    <FlashList
      data={purchases}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
          tintColor={COLORS.accent}
          colors={[COLORS.accent]}
        />
      }
      renderItem={({ item }) => <PurchaseRow purchase={item} onOpen={canEdit ? openPurchase : undefined} />}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.text.muted} />
        ) : purchases.length > 0 && !hasMore ? (
          <Text style={styles.footer}>Showing all {purchases.length} purchases in this branch</Text>
        ) : null
      }
      ListEmptyComponent={
        loading ? (
          <ListSkeleton rows={6} style={{ paddingHorizontal: 0, paddingTop: 4 }} />
        ) : (
          <EmptyState
            icon="package"
            title="No purchases yet"
            description="Goods you buy, and stock you add, appear here."
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 8,
  },
  supplier: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.2 },
  items: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 2 },
  meta: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  total: { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary },
  footer: { textAlign: 'center', fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginVertical: 16 },
});
