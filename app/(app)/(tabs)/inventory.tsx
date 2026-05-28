import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { deleteProductRecord } from '@/lib/recordDeletion';
import { Badge, Button, ConfirmDialog, EmptyState, LoadingScreen } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { Product } from '@/types';
import { ReconcileWarningBanner } from '@/components/inventory/ReconcileWarningBanner';

type FilterType = 'all' | 'low_stock' | 'out_of_stock';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatCount = (value: number) =>
  Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();
  const { products, fetchProducts } = useBusinessStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteActionProductId, setDeleteActionProductId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const openCreateProduct = () => router.push('/(app)/add-stock');

  const load = useCallback(async () => {
    if (!currentBusiness) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    await fetchProducts(currentBusiness.id);
    setLoading(false);
    setRefreshing(false);
  }, [currentBusiness, fetchProducts]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh({
    channelName: `inventory-screen-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id],
    tables: [
      ...(currentBranch ? [{ table: 'inventory', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'stock_movements', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBusiness ? [{ table: 'products', filter: `business_id=eq.${currentBusiness.id}` }] : []),
    ],
    onRefresh: load,
  });

  const getProductStock = useCallback((product: Product) => {
    if (!currentBranch) return 0;
    return product.inventory?.find((item) => item.branch_id === currentBranch.id)?.quantity ?? 0;
  }, [currentBranch]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const stock = getProductStock(product);

        if (filter === 'low_stock') return matchesSearch && stock > 0 && stock <= product.reorder_level;
        if (filter === 'out_of_stock') return matchesSearch && stock <= 0;
        return matchesSearch;
      }),
    [filter, getProductStock, products, search],
  );

  const getStockBadge = (product: Product) => {
    const stock = getProductStock(product);
    if (product.is_service) return <Badge label="Service" variant="primary" />;
    if (stock <= 0) return <Badge label="Out of Stock" variant="danger" />;
    if (stock <= product.reorder_level) return <Badge label="Low Stock" variant="warning" />;
    return <Badge label="In Stock" variant="success" />;
  };

  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product);
  };

  if (loading) {
    return <LoadingScreen message="Loading inventory..." />;
  }

  return (
    <SwipeableTabScreen name="inventory">
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Inventory"
        subtitle={`${filteredProducts.length} product${filteredProducts.length === 1 ? '' : 's'}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Add Product" onPress={openCreateProduct} />}
      />

      <View style={{ padding: SP.page, gap: 12 }}>
        <ReconcileWarningBanner onReconciled={load} />
        <View
          style={{
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: RADIUS.md,
            backgroundColor: COLORS.card,
            paddingHorizontal: 14,
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Feather name="search" size={16} color={COLORS.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products"
            placeholderTextColor={COLORS.text.muted}
            style={{ flex: 1, fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.primary, paddingVertical: 10 }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {([
            { key: 'all', label: 'All' },
            { key: 'low_stock', label: 'Low Stock' },
            { key: 'out_of_stock', label: 'Out of Stock' },
          ] as const).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.8}
              style={{
                minWidth: 92,
                minHeight: 38,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderRadius: RADIUS.sm,
                borderColor: filter === item.key ? COLORS.ink : COLORS.border,
                backgroundColor: filter === item.key ? COLORS.surface2 : COLORS.card,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredProducts.length === 0 ? (
        <EmptyState
          icon="package"
          title="No products found"
          description={search ? 'Try a different search term.' : 'Add your first product to start tracking stock.'}
          action={!search ? { label: 'Add Product', onPress: openCreateProduct } : undefined}
        />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: insets.bottom + 92 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={COLORS.ink}
            />
          }
          renderItem={({ item, index }) => {
            const stock = getProductStock(item);
            const showDeleteAction = deleteActionProductId === item.id;

            return (
              <TouchableOpacity
                activeOpacity={0.9}
                delayLongPress={250}
                onLongPress={() =>
                  setDeleteActionProductId((currentId) => (currentId === item.id ? null : item.id))
                }
                onPress={() => {
                  if (showDeleteAction) {
                    setDeleteActionProductId(null);
                  }
                }}
                style={{
                  paddingVertical: SP.page,
                  borderBottomWidth: index === filteredProducts.length - 1 ? 0 : 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        backgroundColor: COLORS.surface2,
                        borderRadius: RADIUS.md,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name={item.is_service ? 'tool' : 'package'} size={18} color={COLORS.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                        {item.category?.name ?? 'Uncategorized'}
                        {' \u00B7 '}
                        {item.unit}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {getStockBadge(item)}
                        {!item.is_service ? (
                          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.secondary }}>
                            {formatCount(stock)} {item.unit}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 10 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {formatCurrency(item.selling_price)}
                    </Text>
                    <Button
                      title="Update Stock"
                      onPress={() => router.push({ pathname: '/(app)/update-stock', params: { productId: item.id } })}
                      size="sm"
                      variant="secondary"
                    />
                  </View>
                </View>
                {showDeleteAction ? (
                  <View style={{ alignItems: 'center', marginTop: 12 }}>
                    <Button
                      title="Delete"
                      onPress={() => handleDeleteProduct(item)}
                      size="sm"
                      variant="danger"
                    />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
      <ConfirmDialog
        visible={productToDelete !== null}
        title="Delete product"
        message={`Remove ${productToDelete?.name ?? ''} from inventory?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!productToDelete) return;
          const targetProduct = productToDelete;
          setProductToDelete(null);
          try {
            await deleteProductRecord(targetProduct.id);
            await load();
            Toast.show({ type: 'success', text1: 'Product deleted' });
          } catch (err: any) {
            Alert.alert('Unable to delete', err.message ?? 'Please try again.');
          }
        }}
        onCancel={() => setProductToDelete(null)}
        variant="danger"
      />
    </ScreenShell>
    </SwipeableTabScreen>
  );
}
