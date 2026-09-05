import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useTabStore } from '@/store/tabStore';
import { deleteProductRecord } from '@/lib/recordDeletion';
import { removeCachedProduct } from '@/lib/offlineStore';
import { Badge, Button, EmptyState, LoadingScreen, RoleGate } from '@/components/ui';
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

function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteActionProductId, setDeleteActionProductId] = useState<string | null>(null);
  const openCreateProduct = () => router.push('/(app)/add-stock');

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    void fetchProducts(businessId);
    
    setLoading(false);
    setRefreshing(false);
  }, [businessId, fetchProducts]);



  // Refetch handled by activeTab selector above — no focus listener needed

  useRealtimeRefresh({
    channelName: `inventory-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'inventory', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'stock_movements', filter: `branch_id=eq.${branchId}` }] : []),
      ...(businessId ? [{ table: 'products', filter: `business_id=eq.${businessId}` }] : []),
    ],
    onRefresh: load,
  });

  const getProductStock = useCallback((product: Product) => {
    if (!branchId) return 0;
    return product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
  }, [branchId]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const stock = getProductStock(product);

        if (filter === 'low_stock') return matchesSearch && !product.is_service && stock > 0 && stock <= product.reorder_level;
        if (filter === 'out_of_stock') return matchesSearch && !product.is_service && stock <= 0;
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
    Alert.alert(
      'Delete product',
      `Remove ${product.name} from inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProductRecord(product.id);
              if (businessId) {
                await removeCachedProduct(businessId, product.id);
              }
              await load();
              Toast.show({ type: 'success', text1: 'Product deleted' });
            } catch (err: any) {
              Alert.alert('Unable to delete', err.message ?? 'Please try again.');
            }
          }
        }
      ]
    );
  };

  // Render instantly without blocking UI. RefreshControl handles background loading state.

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
            underlineColorAndroid="transparent"
            selectionColor={COLORS.accent}
            cursorColor={COLORS.accent}
            importantForAutofill="no"
            style={{ flex: 1, fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.primary, paddingVertical: 10, backgroundColor: '#FFFFFF' }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {([
            { key: 'all', label: 'All' },
            { key: 'low_stock', label: 'Low Stock' },
            { key: 'out_of_stock', label: 'Out of Stock' },
          ] as const).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              delayPressIn={0}
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
        <FlashList
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
                activeOpacity={0.7}
                delayLongPress={250}
                onLongPress={() =>
                  setDeleteActionProductId((currentId) => (currentId === item.id ? null : item.id))
                }
                onPress={() => {
                  if (showDeleteAction) {
                    setDeleteActionProductId(null);
                  } else {
                    router.push({ pathname: '/(app)/update-stock', params: { productId: item.id } });
                  }
                }}
                style={{
                  paddingVertical: SP.page,
                  borderBottomWidth: index === filteredProducts.length - 1 ? 0 : 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                  <View style={{ flexDirection: 'row', gap: 14, flex: 1, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        backgroundColor: COLORS.surface2,
                        borderRadius: RADIUS.md,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name={item.is_service ? 'tool' : 'package'} size={20} color={COLORS.text.secondary} />
                    </View>
                    
                    <View style={{ flex: 1, gap: 4 }}>
                      {/* Top Row: Name & Price */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                          {formatCurrency(item.selling_price)}
                        </Text>
                      </View>

                      {/* Middle Row: Category & Stock Qty */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted }}>
                          {item.category?.name ?? 'Uncategorized'}
                          {' \u00B7 '}
                          {item.unit}
                        </Text>
                        {!item.is_service ? (
                          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text.secondary }}>
                            {formatCount(stock)} {item.unit} in stock
                          </Text>
                        ) : null}
                      </View>

                      {/* Bottom Row: Badges & Value */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        {getStockBadge(item)}
                        
                        {!item.is_service && stock > 0 ? (
                          <RoleGate allowedRoles={['owner', 'manager']}>
                            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                              Value: {formatCurrency(item.selling_price * stock)}
                            </Text>
                          </RoleGate>
                        ) : <View />}
                      </View>
                    </View>
                    
                    <Feather name="chevron-right" size={18} color={COLORS.border} />
                  </View>
                {showDeleteAction ? (
                  <View style={{ alignItems: 'center', marginTop: 12 }}>
                    <RoleGate allowedRoles={['owner', 'manager']}>
                      <Button
                        title="Delete"
                        onPress={() => handleDeleteProduct(item)}
                        size="sm"
                        variant="danger"
                      />
                    </RoleGate>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(InventoryScreen);
