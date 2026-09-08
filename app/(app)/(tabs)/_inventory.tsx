import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  AlertButton,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { deleteProductRecord } from '@/lib/recordDeletion';
import { removeCachedProduct } from '@/lib/offlineStore';
import { printInventoryStock, shareInventoryStockPDF } from '@/lib/reports';
import { Badge, Button, EmptyState } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { Product } from '@/types';
import { ReconcileWarningBanner } from '@/components/inventory/ReconcileWarningBanner';

type StockFilter = 'all' | 'low_stock' | 'out_of_stock';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatCount = (value: number) =>
  Number.isInteger(value)
    ? `${value}`
    : value
        .toFixed(2)
        .replace(/\.00$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1');

function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const businessId = currentBusiness?.id;
  const branchId = currentBranch?.id;
  const userRole = useAuthStore((s) => s.userRole);
  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printFilterType, setPrintFilterType] = useState<'all' | 'low_and_out'>('all');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPDF, setIsSharingPDF] = useState(false);

  const openCreateProduct = () => router.push('/(app)/add-stock');

  const load = useCallback(async () => {
    if (!businessId) {
      setRefreshing(false);
      return;
    }
    await fetchProducts(businessId);
    setRefreshing(false);
  }, [businessId, fetchProducts]);

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

  const getProductStock = useCallback(
    (product: Product) => {
      if (!branchId) return 0;
      return product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
    },
    [branchId],
  );

  // Executive inventory stats
  const stats = useMemo(() => {
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of products) {
      if (p.is_service) continue;
      const stock = getProductStock(p);
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= p.reorder_level) {
        lowStockCount++;
      }
    }

    return {
      totalProducts: products.length,
      lowStockCount,
      outOfStockCount,
    };
  }, [products, getProductStock]);

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category?.name) {
        set.add(p.category.name);
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      // 1. Search filter
      const nameMatch = product.name.toLowerCase().includes(query);
      const catMatch = (product.category?.name ?? '').toLowerCase().includes(query);
      const barcodeMatch = (product.barcode ?? '').toLowerCase().includes(query);
      const matchesSearch = !query || nameMatch || catMatch || barcodeMatch;

      if (!matchesSearch) return false;

      // 2. Category filter
      if (selectedCategory !== 'all') {
        if ((product.category?.name ?? 'General') !== selectedCategory) {
          return false;
        }
      }

      // 3. Stock status filter
      const stock = getProductStock(product);
      if (stockFilter === 'low_stock') {
        return !product.is_service && stock > 0 && stock <= product.reorder_level;
      }
      if (stockFilter === 'out_of_stock') {
        return !product.is_service && stock <= 0;
      }

      return true;
    });
  }, [products, search, selectedCategory, stockFilter, getProductStock]);

  // Handle product actions menu (delete or update)
  const handleProductActions = (product: Product) => {
    const options: AlertButton[] = [
      {
        text: 'Update Stock & Pricing',
        onPress: () =>
          router.push({ pathname: '/(app)/update-stock', params: { productId: product.id } }),
      },
    ];

    if (userRole === 'owner' || userRole === 'manager') {
      options.push({
        text: 'Delete Product',
        style: 'destructive',
        onPress: () => handleDeleteProduct(product),
      });
    }

    options.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });

    Alert.alert(product.name, 'Manage this inventory item:', options);
  };

  const handleDeleteProduct = (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Permanently remove "${product.name}" from your catalog?`,
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
          },
        },
      ],
    );
  };

  const physicalProductsCount = useMemo(() => {
    return products.filter((p) => !p.is_service).length;
  }, [products]);

  const lowAndOutCount = useMemo(() => {
    return stats.lowStockCount + stats.outOfStockCount;
  }, [stats.lowStockCount, stats.outOfStockCount]);

  const handlePrintInventory = async (action: 'print' | 'share') => {
    if (!currentBusiness || !currentBranch) return;

    const physicalProducts = products.filter((p) => !p.is_service);
    const targetProducts =
      printFilterType === 'all'
        ? physicalProducts
        : physicalProducts.filter((p) => {
            const stock = getProductStock(p);
            return stock <= 0 || stock <= p.reorder_level;
          });

    if (targetProducts.length === 0) {
      Alert.alert(
        'No Items Found',
        printFilterType === 'all'
          ? 'There are no physical products in inventory to print.'
          : 'There are currently no low stock or out of stock items to print.'
      );
      return;
    }

    const sorted = [...targetProducts].sort((a, b) => a.name.localeCompare(b.name));

    const printItems = sorted.map((p) => ({
      name: p.name,
      quantity: getProductStock(p),
      unit: p.unit || 'units',
      reorderLevel: p.reorder_level ?? 0,
      category: p.category?.name,
    }));

    const printData = {
      business: currentBusiness,
      branch: currentBranch,
      filterType: printFilterType,
      items: printItems,
      totalProducts: physicalProducts.length,
      lowStockCount: stats.lowStockCount,
      outOfStockCount: stats.outOfStockCount,
    };

    if (action === 'print') {
      setIsPrinting(true);
      try {
        await printInventoryStock(printData);
        setPrintModalVisible(false);
      } catch (err: any) {
        Alert.alert('Print Error', err?.message || 'Failed to open print dialog.');
      } finally {
        setIsPrinting(false);
      }
    } else {
      setIsSharingPDF(true);
      try {
        await shareInventoryStockPDF(printData);
        setPrintModalVisible(false);
      } catch (err: any) {
        Alert.alert('PDF Export Error', err?.message || 'Failed to export PDF.');
      } finally {
        setIsSharingPDF(false);
      }
    }
  };

  return (
    <SwipeableTabScreen name="inventory">
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Inventory"
          subtitle={`${products.length} ${products.length === 1 ? 'product' : 'products'} in catalog`}
          theme="dark"
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <HeaderAction
                icon="printer"
                onPress={() => {
                  setPrintFilterType(stockFilter === 'all' ? 'all' : 'low_and_out');
                  setPrintModalVisible(true);
                }}
              />
              <HeaderAction icon="plus" label="Add" onPress={openCreateProduct} />
            </View>
          }
        />

        {/* ── Fixed Search & Filters Bar (stays pinned at top) ───────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            paddingHorizontal: SP.page,
            paddingTop: 10,
            paddingBottom: 6,
            gap: 8,
            zIndex: 10,
          }}
        >
          {/* Search Input */}
          <View
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: RADIUS.md,
              backgroundColor: COLORS.card,
              paddingHorizontal: 12,
              height: 38,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Feather name="search" size={15} color={COLORS.text.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products by name or category..."
              placeholderTextColor={COLORS.text.muted}
              underlineColorAndroid="transparent"
              selectionColor={COLORS.accent}
              cursorColor={COLORS.accent}
              importantForAutofill="no"
              style={{
                flex: 1,
                fontSize: 13.5,
                fontFamily: FONT.regular,
                color: COLORS.text.primary,
                paddingVertical: 0,
              }}
            />
            {search ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={15} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Status Segmented Pills */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: COLORS.accent,
              borderRadius: RADIUS.md,
              padding: 3,
              gap: 3,
            }}
          >
            {/* All Segment */}
            <TouchableOpacity
              onPress={() => setStockFilter('all')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.sm,
                backgroundColor: stockFilter === 'all' ? COLORS.card : 'transparent',
                shadowColor: stockFilter === 'all' ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: stockFilter === 'all' ? 0.12 : 0,
                shadowRadius: 2,
                elevation: stockFilter === 'all' ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontFamily: stockFilter === 'all' ? FONT.bold : FONT.medium,
                  fontSize: 12,
                  color: stockFilter === 'all' ? COLORS.accent : '#FFFFFF',
                }}
              >
                All ({stats.totalProducts})
              </Text>
            </TouchableOpacity>

            {/* Low Stock Segment */}
            <TouchableOpacity
              onPress={() =>
                setStockFilter((prev) => (prev === 'low_stock' ? 'all' : 'low_stock'))
              }
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.sm,
                backgroundColor: stockFilter === 'low_stock' ? COLORS.card : 'transparent',
                shadowColor: stockFilter === 'low_stock' ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: stockFilter === 'low_stock' ? 0.12 : 0,
                shadowRadius: 2,
                elevation: stockFilter === 'low_stock' ? 2 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {stats.lowStockCount > 0 ? (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: stockFilter === 'low_stock' ? COLORS.warning : '#FFFFFF',
                    }}
                  />
                ) : null}
                <Text
                  style={{
                    fontFamily: stockFilter === 'low_stock' ? FONT.bold : FONT.medium,
                    fontSize: 12,
                    color: stockFilter === 'low_stock' ? COLORS.warning : '#FFFFFF',
                  }}
                >
                  Low ({stats.lowStockCount})
                </Text>
              </View>
            </TouchableOpacity>

            {/* Out of Stock Segment */}
            <TouchableOpacity
              onPress={() =>
                setStockFilter((prev) => (prev === 'out_of_stock' ? 'all' : 'out_of_stock'))
              }
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.sm,
                backgroundColor: stockFilter === 'out_of_stock' ? COLORS.card : 'transparent',
                shadowColor: stockFilter === 'out_of_stock' ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: stockFilter === 'out_of_stock' ? 0.12 : 0,
                shadowRadius: 2,
                elevation: stockFilter === 'out_of_stock' ? 2 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {stats.outOfStockCount > 0 ? (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: stockFilter === 'out_of_stock' ? COLORS.danger : '#FFFFFF',
                    }}
                  />
                ) : null}
                <Text
                  style={{
                    fontFamily: stockFilter === 'out_of_stock' ? FONT.bold : FONT.medium,
                    fontSize: 12,
                    color: stockFilter === 'out_of_stock' ? COLORS.danger : '#FFFFFF',
                  }}
                >
                  Out ({stats.outOfStockCount})
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Category Filter Chips */}
          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedCategory('all')}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: RADIUS.full,
                  borderWidth: 1,
                  borderColor: selectedCategory === 'all' ? COLORS.ink : COLORS.border,
                  backgroundColor: selectedCategory === 'all' ? COLORS.ink : COLORS.card,
                }}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontFamily: selectedCategory === 'all' ? FONT.bold : FONT.medium,
                    color:
                      selectedCategory === 'all' ? COLORS.text.inverse : COLORS.text.secondary,
                  }}
                >
                  All
                </Text>
              </TouchableOpacity>

              {categories.map((catName) => {
                const isSelected = selectedCategory === catName;
                return (
                  <TouchableOpacity
                    key={catName}
                    onPress={() => setSelectedCategory(isSelected ? 'all' : catName)}
                    activeOpacity={0.8}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: isSelected ? COLORS.ink : COLORS.border,
                      backgroundColor: isSelected ? COLORS.ink : COLORS.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontFamily: isSelected ? FONT.bold : FONT.medium,
                        color: isSelected ? COLORS.text.inverse : COLORS.text.secondary,
                      }}
                    >
                      {catName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {/* ── Scrollable Products List (scrolls underneath fixed bar) ─────── */}
        <View style={{ flex: 1 }}>
          <FlashList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: SP.page,
              paddingTop: 10,
              paddingBottom: insets.bottom + 92,
            }}
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
            ListHeaderComponent={
              <View style={{ marginBottom: 6 }}>
                <ReconcileWarningBanner onReconciled={load} />
              </View>
            }
            ListEmptyComponent={
              <View style={{ paddingVertical: 40, paddingHorizontal: 16 }}>
                <EmptyState
                  icon="package"
                  title={products.length === 0 ? 'No products found' : 'No matching products'}
                  description={
                    products.length === 0
                      ? 'Add your first product to start tracking inventory and stock levels.'
                      : 'Try clearing your search query or switching your category filter.'
                  }
                  action={
                    products.length === 0
                      ? { label: 'Add Product', onPress: openCreateProduct }
                      : {
                          label: 'Reset Filters',
                          onPress: () => {
                            setSearch('');
                            setStockFilter('all');
                            setSelectedCategory('all');
                          },
                        }
                  }
                />
              </View>
            }
            renderItem={({ item }) => {
              const stock = getProductStock(item);
              const isOutOfStock = !item.is_service && stock <= 0;
              const isLowStock = !item.is_service && stock > 0 && stock <= item.reorder_level;

              const iconBg = item.is_service
                ? 'rgba(59, 130, 246, 0.1)'
                : isOutOfStock
                ? 'rgba(239, 68, 68, 0.1)'
                : isLowStock
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(16, 185, 129, 0.1)';

              const iconColor = item.is_service
                ? '#3B82F6'
                : isOutOfStock
                ? COLORS.danger
                : isLowStock
                ? COLORS.warning
                : COLORS.success;

              const iconName: keyof typeof Feather.glyphMap = item.is_service
                ? 'tool'
                : isOutOfStock
                ? 'alert-circle'
                : isLowStock
                ? 'alert-triangle'
                : 'package';

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  delayLongPress={300}
                  onLongPress={() => handleProductActions(item)}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/update-stock',
                      params: { productId: item.id },
                    })
                  }
                  style={{
                    backgroundColor: COLORS.card,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Status / Category Icon Box */}
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: RADIUS.md,
                      backgroundColor: iconBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={iconName} size={19} color={iconColor} />
                  </View>

                  {/* Core Product Information */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: FONT.bold,
                        color: COLORS.text.primary,
                      }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>

                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 12,
                        color: COLORS.text.muted,
                      }}
                      numberOfLines={1}
                    >
                      {item.category?.name ?? 'General'} · {item.unit}
                    </Text>

                    {/* Stock Status Indicator */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      {item.is_service ? (
                        <Badge label="Service" variant="primary" />
                      ) : isOutOfStock ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: COLORS.danger,
                            }}
                          />
                          <Text
                            style={{
                              fontFamily: FONT.bold,
                              fontSize: 12,
                              color: COLORS.danger,
                            }}
                          >
                            Out of Stock
                          </Text>
                        </View>
                      ) : isLowStock ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: COLORS.warning,
                            }}
                          />
                          <Text
                            style={{
                              fontFamily: FONT.bold,
                              fontSize: 12,
                              color: COLORS.warning,
                            }}
                          >
                            Low: {formatCount(stock)} {item.unit} left
                          </Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: COLORS.success,
                            }}
                          />
                          <Text
                            style={{
                              fontFamily: FONT.medium,
                              fontSize: 12,
                              color: COLORS.success,
                            }}
                          >
                            {formatCount(stock)} {item.unit} in stock
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Pricing & Valuation */}
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: FONT.bold,
                        color: COLORS.text.primary,
                      }}
                    >
                      {formatCurrency(item.selling_price)}
                    </Text>

                    {!item.is_service &&
                    stock > 0 &&
                    (userRole === 'owner' || userRole === 'manager') ? (
                      <Text
                        style={{
                          fontFamily: FONT.regular,
                          fontSize: 11,
                          color: COLORS.text.muted,
                        }}
                      >
                        Val: {formatCurrency(item.selling_price * stock)}
                      </Text>
                    ) : null}

                    <Feather name="chevron-right" size={14} color={COLORS.border} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* ── Print Inventory Sheet Modal ─────────────────────────────────── */}
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
              backgroundColor: 'rgba(0, 20, 50, 0.45)',
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: SP.page,
            }}
            onPress={() => {
              if (!isPrinting && !isSharingPDF) setPrintModalVisible(false);
            }}
          >
            <Pressable
              style={{
                backgroundColor: COLORS.card,
                borderRadius: RADIUS.xl,
                width: '100%',
                maxWidth: 420,
                padding: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
                elevation: 8,
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
                      backgroundColor: 'rgba(255, 107, 53, 0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="printer" size={18} color={COLORS.accent} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      Print Stock Sheet
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                      Double-column A4 tabular list
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

              <Text
                style={{
                  fontSize: 12.5,
                  fontFamily: FONT.medium,
                  color: COLORS.text.secondary,
                  marginBottom: 10,
                }}
              >
                Select which items to include:
              </Text>

              {/* Option 1: All Stock Items */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPrintFilterType('all')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: RADIUS.md,
                  borderWidth: 1.5,
                  borderColor: printFilterType === 'all' ? COLORS.accent : COLORS.border,
                  backgroundColor: printFilterType === 'all' ? 'rgba(255, 107, 53, 0.05)' : COLORS.surface,
                  marginBottom: 10,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: printFilterType === 'all' ? COLORS.accent : COLORS.borderDark,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {printFilterType === 'all' ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: COLORS.accent,
                      }}
                    />
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    All Stock Items
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 }}>
                    Full inventory catalog ({physicalProductsCount} items)
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Low and Out of Stock */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPrintFilterType('low_and_out')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: RADIUS.md,
                  borderWidth: 1.5,
                  borderColor: printFilterType === 'low_and_out' ? COLORS.accent : COLORS.border,
                  backgroundColor: printFilterType === 'low_and_out' ? 'rgba(255, 107, 53, 0.05)' : COLORS.surface,
                  marginBottom: 14,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: printFilterType === 'low_and_out' ? COLORS.accent : COLORS.borderDark,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {printFilterType === 'low_and_out' ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: COLORS.accent,
                      }}
                    />
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    Low & Out of Stock Items
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 }}>
                    Only depleted and low items ({lowAndOutCount} items)
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Note Box */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  borderRadius: RADIUS.sm,
                  backgroundColor: COLORS.surface2,
                  marginBottom: 16,
                }}
              >
                <Feather name="file-text" size={14} color={COLORS.text.muted} />
                <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text.secondary, flex: 1 }}>
                  Runs in double columns on A4 paper (~75 items per page) for quick physical stock taking.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 8 }}>
                <Button
                  title="Print Stock Sheet"
                  variant="accent"
                  size="md"
                  loading={isPrinting}
                  disabled={isSharingPDF}
                  icon="printer"
                  onPress={() => handlePrintInventory('print')}
                />

                <Button
                  title="Share as PDF"
                  variant="secondary"
                  size="md"
                  loading={isSharingPDF}
                  disabled={isPrinting}
                  icon="share-2"
                  onPress={() => handlePrintInventory('share')}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(InventoryScreen);
