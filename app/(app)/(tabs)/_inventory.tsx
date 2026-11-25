import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertButton,
  AppState,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Icon } from '@/components/icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useTabStore } from '@/store/tabStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { deleteProductRecord } from '@/lib/recordDeletion';
import { removeCachedProduct } from '@/lib/offlineStore';
import { printInventoryStock, shareInventoryStockPDF } from '@/lib/reports';
import { BottomSheetModal, Button, EmptyState, IconButton, Pill, SegmentedControl } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW, SP } from '@/constants';
import { Product } from '@/types';
import { ReconcileWarningBanner } from '@/components/inventory/ReconcileWarningBanner';
import { BarcodeScannerModal } from '@/components/scanner/BarcodeScannerModal';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';

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
  const canViewCosts = canViewFinancialData(userRole);
  const products = useBusinessStore((s) => s.products);
  const branches = useBusinessStore((s) => s.branches);
  const businessCategories = useBusinessStore((s) => s.categories);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);
  const fetchCategories = useBusinessStore((s) => s.fetchCategories);
  const deleteProduct = useBusinessStore((s) => s.deleteProduct);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printFilterType, setPrintFilterType] = useState<'all' | 'low_and_out'>('all');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPDF, setIsSharingPDF] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const openCreateProduct = () => router.push('/(app)/add-stock');

  const handleBarcodeScanned = (scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;

    const matchedProduct = products.find(
      (p) =>
        (p.barcode && p.barcode.trim().toLowerCase() === cleanCode.toLowerCase()) ||
        p.id === cleanCode
    );

    if (matchedProduct) {
      const stock = getProductStock(matchedProduct);
      Alert.alert(
        `Found: ${matchedProduct.name}`,
        `Current stock: ${formatCount(stock)} ${matchedProduct.unit}.\nPrice: ${formatCurrency(matchedProduct.selling_price)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restock (+ Stock)',
            onPress: () =>
              router.push({
                pathname: '/(app)/update-stock',
                params: { productId: matchedProduct.id, restock: '1' },
              }),
          },
          {
            text: 'View / Edit',
            onPress: () =>
              router.push({
                pathname: '/(app)/update-stock',
                params: { productId: matchedProduct.id },
              }),
          },
        ]
      );
    } else {
      Alert.alert(
        'Barcode Not Found',
        `No product in your catalog has barcode "${cleanCode}".\nWould you like to add it as a new product?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Product',
            onPress: () =>
              router.push({
                pathname: '/(app)/add-stock',
                params: { prefillBarcode: cleanCode },
              }),
          },
        ]
      );
    }
  };

  const handleSelectCategory = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setStockFilter('all');
    setCategoryModalOpen(false);
  };

  const load = useCallback(async () => {
    if (!businessId) {
      setRefreshing(false);
      return;
    }
    await Promise.all([
      fetchProducts(businessId, canViewCosts),
      fetchCategories(businessId),
    ]);
    setRefreshing(false);
  }, [businessId, canViewCosts, fetchCategories, fetchProducts]);

  useRealtimeRefresh({
    channelName: `inventory-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId, canViewCosts],
    tables: [
      ...(branchId ? [{ table: 'inventory', filter: `branch_id=eq.${branchId}` }] : []),
      ...(canViewCosts && branchId ? [{ table: 'stock_movements', filter: `branch_id=eq.${branchId}` }] : []),
      ...(canViewCosts && businessId ? [{ table: 'products', filter: `business_id=eq.${businessId}` }] : []),
    ],
    onRefresh: load,
  });

  useEffect(() => {
    const unsubTab = useTabStore.subscribe(
      (state) => state.activeTab,
      (activeTab, prevActiveTab) => {
        if (activeTab === 'inventory' && prevActiveTab !== 'inventory') {
          InteractionManager.runAfterInteractions(() => {
            void load();
          });
        }
      },
    );

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void load();
      }
    });

    return () => {
      unsubTab();
      appStateSub.remove();
    };
  }, [load]);

  const getProductStock = useCallback(
    (product: Product) => {
      if (!branchId) return 0;
      return product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
    },
    [branchId],
  );

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    businessCategories.forEach((c) => {
      if (c.name?.trim()) set.add(c.name.trim());
    });
    products.forEach((p) => {
      if (p.category?.name?.trim()) {
        set.add(p.category.name.trim());
      }
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    const hasUncategorized = products.some((p) => !p.category?.name?.trim());
    if (hasUncategorized && list.length > 0) {
      list.push('General');
    }
    return list;
  }, [businessCategories, products]);

  // Products filtered by selected category (scope for counts and status filters)
  const categoryProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => {
      const prodCat = p.category?.name?.trim() || 'General';
      return prodCat.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [products, selectedCategory]);

  // Executive inventory stats scoped to selected category
  const stats = useMemo(() => {
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of categoryProducts) {
      if (p.is_service) continue;
      const stock = getProductStock(p);
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= p.reorder_level) {
        lowStockCount++;
      }
    }

    return {
      totalProducts: categoryProducts.length,
      lowStockCount,
      outOfStockCount,
    };
  }, [categoryProducts, getProductStock]);

  // Filtered products (applies search query and stock status filter on categoryProducts)
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return categoryProducts.filter((product) => {
      // 1. Search filter
      const nameMatch = product.name.toLowerCase().includes(query);
      const catMatch = (product.category?.name ?? '').toLowerCase().includes(query);
      const barcodeMatch = (product.barcode ?? '').toLowerCase().includes(query);
      const matchesSearch = !query || nameMatch || catMatch || barcodeMatch;

      if (!matchesSearch) return false;

      // 2. Stock status filter
      const stock = getProductStock(product);
      if (stockFilter === 'low_stock') {
        return !product.is_service && stock > 0 && stock <= product.reorder_level;
      }
      if (stockFilter === 'out_of_stock') {
        return !product.is_service && stock <= 0;
      }

      return true;
    });
  }, [categoryProducts, search, stockFilter, getProductStock]);

  // Handle product actions menu (delete or update)
  const handleProductActions = (product: Product) => {
    const options: AlertButton[] = [];

    if (!product.is_service) {
      options.push({
        text: 'Restock',
        onPress: () =>
          router.push({ pathname: '/(app)/update-stock', params: { productId: product.id, restock: '1' } }),
      });
      if (hasPermission(userRole, 'inventory.manage')) {
        options.push({
          text: 'Record Damaged Stock',
          onPress: () =>
            router.push({ pathname: '/(app)/record-damage', params: { productId: product.id } }),
        });
      }
    }

    options.push(
      {
        text: 'Update Stock & Pricing',
        onPress: () =>
          router.push({ pathname: '/(app)/update-stock', params: { productId: product.id } }),
      },
    );

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
              await deleteProductRecord(product.id, businessId);
              // Remove from cache
              if (businessId) {
                await removeCachedProduct(businessId, product.id);
              }
              // Remove from local store immediately
              deleteProduct(product.id);
              // Refresh from server to ensure consistency
              await load();
              Toast.show({ type: 'success', text1: 'Product deleted' });
            } catch (err: any) {
              Alert.alert('Unable to delete', err.message ?? 'Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Overall physical stock counts for the Print Inventory sheet
  const printStockStats = useMemo(() => {
    const physicalProducts = products.filter((p) => !p.is_service);
    let lowCount = 0;
    let outCount = 0;
    for (const p of physicalProducts) {
      const stock = getProductStock(p);
      if (stock <= 0) {
        outCount++;
      } else if (stock <= p.reorder_level) {
        lowCount++;
      }
    }
    return {
      physicalProducts,
      totalCount: physicalProducts.length,
      lowCount,
      outCount,
      lowAndOutCount: lowCount + outCount,
    };
  }, [products, getProductStock]);

  const physicalProductsCount = printStockStats.totalCount;
  const lowAndOutCount = printStockStats.lowAndOutCount;

  const handlePrintInventory = async (action: 'print' | 'share') => {
    if (!currentBusiness || !currentBranch) return;

    const physicalProducts = printStockStats.physicalProducts;
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
      lowStockCount: printStockStats.lowCount,
      outOfStockCount: printStockStats.outCount,
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

  const lastIndex = filteredProducts.length - 1;
  const canManage = userRole === 'owner' || userRole === 'manager';

  return (
    <SwipeableTabScreen name="inventory">
      <ScreenShell>
        <ScreenHeader
          title="Stock"
          subtitle={`${products.length} ${products.length === 1 ? 'product' : 'products'}${branches.length > 1 && currentBranch?.name ? ` · ${currentBranch.name}` : ''}`}
          right={
            <>
              <IconButton
                icon="printer"
                variant="outline"
                accessibilityLabel="Print or share stock list"
                onPress={() => {
                  setPrintFilterType(stockFilter === 'all' ? 'all' : 'low_and_out');
                  setPrintModalVisible(true);
                }}
              />
              <IconButton icon="plus" variant="filled" accessibilityLabel="Add stock" onPress={() => setAddMenuOpen(true)} />
            </>
          }
        />

        <View style={{ flex: 1 }}>
          {/* ── Search, status, category ───────────────────────────────── */}
          <View style={{ paddingHorizontal: SP.page, paddingBottom: 10, gap: 10 }}>
            <View style={styles.search}>
              <Icon name="search" size={17} color={COLORS.text.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={selectedCategory === 'all' ? 'Search name or barcode' : `Search ${selectedCategory}`}
                placeholderTextColor={COLORS.text.muted}
                underlineColorAndroid="transparent"
                selectionColor={COLORS.accent}
                cursorColor={COLORS.text.primary}
                importantForAutofill="no"
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search ? (
                <Icon name="x-circle" size={17} color={COLORS.text.muted} onPress={() => setSearch('')} accessibilityLabel="Clear search" />
              ) : null}
              <View style={styles.searchDivider} />
              <Icon name="scan" size={19} color={COLORS.text.primary} onPress={() => setScannerOpen(true)} accessibilityLabel="Scan barcode" />
            </View>

            <SegmentedControl
              value={stockFilter}
              onChange={(v) => setStockFilter(v)}
              options={[
                { value: 'all', label: `All ${stats.totalProducts}` },
                { value: 'low_stock', label: `Low ${stats.lowStockCount}` },
                { value: 'out_of_stock', label: `Out ${stats.outOfStockCount}` },
              ]}
            />

            {categories.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: SP.page }}
                style={{ marginHorizontal: -SP.page, paddingLeft: SP.page }}
              >
                <Pill label="All" active={selectedCategory === 'all'} onPress={() => handleSelectCategory('all')} />
                {categories.map((cat) => (
                  <Pill
                    key={cat}
                    label={cat}
                    active={selectedCategory.toLowerCase() === cat.toLowerCase()}
                    onPress={() => handleSelectCategory(cat)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>

          {/* ── Products ──────────────────────────────────────────────── */}
          <View style={{ flex: 1 }}>
            <FlashList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingTop: 2, paddingBottom: insets.bottom + 110 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                  tintColor={COLORS.text.muted}
                  colors={[COLORS.accent]}
                />
              }
              ListHeaderComponent={
                <View style={{ paddingHorizontal: SP.page }}>
                  <ReconcileWarningBanner onReconciled={load} />
                </View>
              }
              ListEmptyComponent={
                <View style={{ paddingVertical: 24, paddingHorizontal: SP.page }}>
                  <EmptyState
                    icon="box"
                    title={products.length === 0 ? 'Nothing in stock yet' : 'No matches'}
                    description={
                      products.length === 0
                        ? 'Add your first product and Record Am will track every unit in and out.'
                        : 'Try another search, or clear the filters.'
                    }
                    action={
                      products.length === 0
                        ? { label: 'Add a product', onPress: openCreateProduct }
                        : {
                            label: 'Clear filters',
                            onPress: () => {
                              setSearch('');
                              setStockFilter('all');
                              setSelectedCategory('all');
                            },
                          }
                    }
                  />
                  {search.trim() ? (
                    <Button
                      title={`Add "${search.trim()}" to market list`}
                      icon="shopping-bag"
                      variant="tinted"
                      size="sm"
                      style={{ alignSelf: 'center' }}
                      onPress={() =>
                        router.push({ pathname: '/(app)/market-list', params: { addItem: '1', itemName: search.trim() } })
                      }
                    />
                  ) : null}
                </View>
              }
              renderItem={({ item, index }) => {
                const stock = getProductStock(item);
                const isOut = !item.is_service && stock <= 0;
                const isLow = !item.is_service && stock > 0 && stock <= item.reorder_level;
                const first = index === 0;
                const last = index === lastIndex;
                return (
                  <Pressable
                    delayLongPress={300}
                    onLongPress={() => {
                      if (canManage) handleProductActions(item);
                    }}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/update-stock',
                        params: { productId: item.id, ...(!canManage ? { restock: '1' } : {}) },
                      })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      first && styles.rowFirst,
                      last && styles.rowLast,
                      pressed && { backgroundColor: COLORS.surface2 },
                    ]}
                  >
                    <View style={[styles.rowInner, !last && styles.rowDivider]}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {formatCurrency(item.selling_price)} / {item.unit}
                          {item.category?.name ? `  ·  ${item.category.name}` : ''}
                        </Text>
                      </View>
                      {item.is_service ? (
                        <Text style={[styles.statusLabel, { color: COLORS.text.muted }]}>Service</Text>
                      ) : (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={[
                              styles.qty,
                              isOut && { color: COLORS.dangerText },
                              isLow && { color: COLORS.warningText },
                            ]}
                          >
                            {formatCount(stock)}
                          </Text>
                          <Text
                            style={[
                              styles.statusLabel,
                              isOut && { color: COLORS.dangerText },
                              isLow && { color: COLORS.warningText },
                            ]}
                          >
                            {isOut ? 'Out of stock' : isLow ? 'Running low' : 'In stock'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>

        {/* ── Print Inventory Sheet Modal ─────────────────────────────────── */}
        <BottomSheetModal
          visible={printModalVisible}
          onClose={() => {
            if (!isPrinting && !isSharingPDF) setPrintModalVisible(false);
          }}
          title="Print Stock Sheet"
          subtitle="Double-column A4 tabular list"
          showCloseButton={!isPrinting && !isSharingPDF}
        >
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
              backgroundColor: printFilterType === 'all' ? COLORS.accentLight : COLORS.surface,
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
              backgroundColor: printFilterType === 'low_and_out' ? COLORS.accentLight : COLORS.surface,
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
            <Icon name="file-text" size={14} color={COLORS.text.muted} />
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
        </BottomSheetModal>

        {/* ── Category Filter Modal ────────────────────────────────────── */}
        <BottomSheetModal
          visible={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          title="Filter by Category"
          subtitle="Choose a category to filter your inventory"
          maxHeight="78%"
        >
          {/* Category Options List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10, gap: 4 }}
          >
            {/* All Categories Option */}
            <TouchableOpacity
              onPress={() => handleSelectCategory('all')}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: RADIUS.md,
                backgroundColor:
                  selectedCategory === 'all' ? 'rgba(0, 78, 137, 0.08)' : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: RADIUS.md,
                    backgroundColor:
                      selectedCategory === 'all' ? 'rgba(0, 78, 137, 0.15)' : COLORS.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name="grid"
                    size={15}
                    color={selectedCategory === 'all' ? COLORS.navy : COLORS.text.muted}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: selectedCategory === 'all' ? FONT.bold : FONT.medium,
                      color: selectedCategory === 'all' ? COLORS.navy : COLORS.text.primary,
                    }}
                  >
                    All Categories
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: FONT.regular,
                      color: COLORS.text.muted,
                      marginTop: 1,
                    }}
                  >
                    {products.length} total product{products.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              {selectedCategory === 'all' ? (
                <Icon name="check" size={18} color={COLORS.navy} />
              ) : null}
            </TouchableOpacity>

            {/* Each Category */}
            {categories.map((catName) => {
              const isSelected = selectedCategory.toLowerCase() === catName.toLowerCase();
              const count = products.filter((p) => {
                const c = p.category?.name?.trim() || 'General';
                return c.toLowerCase() === catName.toLowerCase();
              }).length;

              return (
                <TouchableOpacity
                  key={catName}
                  onPress={() => handleSelectCategory(catName)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: RADIUS.md,
                    backgroundColor: isSelected ? 'rgba(0, 78, 137, 0.08)' : 'transparent',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.md,
                        backgroundColor: isSelected
                          ? 'rgba(0, 78, 137, 0.15)'
                          : COLORS.surface2,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        name={catName === 'General' ? 'folder' : 'tag'}
                        size={15}
                        color={isSelected ? COLORS.navy : COLORS.text.secondary}
                      />
                    </View>
                    <View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: isSelected ? FONT.bold : FONT.medium,
                          color: isSelected ? COLORS.navy : COLORS.text.primary,
                        }}
                      >
                        {catName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONT.regular,
                          color: COLORS.text.muted,
                          marginTop: 1,
                        }}
                      >
                        {count} product{count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>
                  {isSelected ? <Icon name="check" size={18} color={COLORS.navy} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedCategory !== 'all' ? (
            <TouchableOpacity
              onPress={() => handleSelectCategory('all')}
              activeOpacity={0.8}
              style={{
                paddingVertical: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.surface2,
                borderRadius: RADIUS.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.navy }}>
                Reset to All Categories
              </Text>
            </TouchableOpacity>
          ) : null}
        </BottomSheetModal>

        {/* ── Add Stock Options Modal ── */}
        <BottomSheetModal
          visible={addMenuOpen}
          onClose={() => setAddMenuOpen(false)}
          title="Add Stock"
          subtitle="Choose how you want to add items"
          contentStyle={{ gap: 12 }}
        >
          {/* Option 1: Rapid Entry */}
          <TouchableOpacity
            onPress={() => {
              setAddMenuOpen(false);
              router.push('/(app)/rapid-add-stock' as any);
            }}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: RADIUS.lg,
              backgroundColor: '#8A5A12',
              borderWidth: 1,
              borderColor: 'rgba(253, 224, 71, 0.4)',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="zap" size={22} color="#FEF08A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: '#FFFFFF' }}>
                Rapid Entry Mode
              </Text>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2 }}>
                Continuous high-speed batch addition without leaving screen
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color="rgba(255, 255, 255, 0.75)" />
          </TouchableOpacity>

          {/* Option 2: Excel / CSV Import */}
          <TouchableOpacity
            onPress={() => {
              setAddMenuOpen(false);
              router.push('/(app)/import-stock' as any);
            }}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: RADIUS.lg,
              backgroundColor: '#2E7D4F',
              borderWidth: 1,
              borderColor: 'rgba(110, 231, 183, 0.4)',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="file-text" size={22} color="#C5DCCB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: '#FFFFFF' }}>
                Import from Excel / CSV
              </Text>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2 }}>
                Upload an Excel spreadsheet with ready-made stock
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color="rgba(255, 255, 255, 0.75)" />
          </TouchableOpacity>

          {/* Option 3: Scan Barcode */}
          <TouchableOpacity
            onPress={() => {
              setAddMenuOpen(false);
              setScannerOpen(true);
            }}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: RADIUS.lg,
              backgroundColor: '#7A5A80',
              borderWidth: 1,
              borderColor: 'rgba(196, 181, 253, 0.4)',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="maximize" size={22} color="#DCCCE0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: '#FFFFFF' }}>
                Scan Barcode / QR
              </Text>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2 }}>
                Scan packaging to instantly find, restock, or register an item
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color="rgba(255, 255, 255, 0.75)" />
          </TouchableOpacity>

          {/* Option 4: Single Product Form */}
          <TouchableOpacity
            onPress={() => {
              setAddMenuOpen(false);
              openCreateProduct();
            }}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: RADIUS.lg,
              backgroundColor: '#3B6B9A',
              borderWidth: 1,
              borderColor: 'rgba(147, 197, 253, 0.4)',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="plus-circle" size={22} color="#C9D7E6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: '#FFFFFF' }}>
                Single Product Form
              </Text>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2 }}>
                Standard full form with individual custom options
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color="rgba(255, 255, 255, 0.75)" />
          </TouchableOpacity>
        </BottomSheetModal>

        {/* ── Global Barcode Scanner Modal ── */}
        <BarcodeScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={handleBarcodeScanned}
          title="Scan Inventory Barcode"
          subtitle="Point at any product barcode to restock or register"
        />
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

export default React.memo(InventoryScreen);

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15.5,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    paddingVertical: 0,
  },
  searchDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: COLORS.borderDark, marginHorizontal: 4 },
  row: {
    marginHorizontal: SP.page,
    backgroundColor: COLORS.card,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingLeft: 16,
  },
  rowFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 16, minHeight: 64 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  name: { fontSize: 15.5, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.2 },
  meta: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
  qty: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  statusLabel: { fontSize: 11.5, fontFamily: FONT.medium, color: COLORS.text.muted, marginTop: 1 },
});
