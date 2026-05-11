import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Badge, Button, Card, EmptyState, LoadingScreen, SectionHeader } from '@/components/ui';
import { InputField, SelectField, Toggle } from '@/components/forms';
import { OverlayHeader, ScreenHeader, ScreenShell, HeaderAction, FlatSection } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE, PRODUCT_UNITS } from '@/constants';
import { Product, StockMovementType } from '@/types';

type FilterType = 'all' | 'low_stock' | 'out_of_stock';

const formatCurrency = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const formatCount = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1'));
const normalizeProductName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();
  const { products, categories, fetchProducts, fetchCategories, createProduct } = useBusinessStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productUnit, setProductUnit] = useState('piece');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [openingQuantity, setOpeningQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);

  const [stockQty, setStockQty] = useState('');
  const [stockType, setStockType] = useState<StockMovementType>('stock_in');
  const [stockNotes, setStockNotes] = useState('');
  const [stockUnitCost, setStockUnitCost] = useState('');
  const [movingStock, setMovingStock] = useState(false);

  const load = useCallback(async () => {
    if (!currentBusiness) return;

    await Promise.all([fetchProducts(currentBusiness.id), fetchCategories(currentBusiness.id)]);
    setLoading(false);
    setRefreshing(false);
  }, [currentBusiness]);

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
      ...(currentBusiness ? [{ table: 'categories', filter: `business_id=eq.${currentBusiness.id}` }] : []),
    ],
    onRefresh: load,
  });

  const getProductStock = useCallback((product: Product) => {
    if (!currentBranch) return 0;
    return product.inventory?.find((inventoryItem) => inventoryItem.branch_id === currentBranch.id)?.quantity ?? 0;
  }, [currentBranch]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const stock = getProductStock(product);

      if (filter === 'low_stock') return matchesSearch && stock > 0 && stock <= product.reorder_level;
      if (filter === 'out_of_stock') return matchesSearch && stock === 0;
      return matchesSearch;
    });
  }, [filter, getProductStock, products, search]);

  const resetProductForm = () => {
    setProductName('');
    setProductCategory('');
    setProductUnit('piece');
    setCostPrice('');
    setSellingPrice('');
    setOpeningQuantity('');
    setReorderLevel('5');
    setIsService(false);
  };

  const handleSaveProduct = async () => {
    if (!currentBusiness) return;
    if (!productName.trim()) {
      Alert.alert('Product name required', 'Enter a product or service name.');
      return;
    }
    if (!sellingPrice) {
      Alert.alert('Selling price required', 'Enter a selling price.');
      return;
    }

    const cleanProductName = productName.trim().replace(/\s+/g, ' ');
    const duplicateProduct = products.find((product) => normalizeProductName(product.name) === normalizeProductName(cleanProductName));
    if (duplicateProduct) {
      Alert.alert('Duplicate product', `${duplicateProduct.name} already exists in stock. Update its stock quantity instead.`);
      return;
    }

    const parsedOpeningQuantity = openingQuantity.trim() ? parseFloat(openingQuantity) : 0;
    if (!isService && (!Number.isFinite(parsedOpeningQuantity) || parsedOpeningQuantity < 0)) {
      Alert.alert('Invalid quantity', 'Enter a valid opening quantity.');
      return;
    }

    setSaving(true);
    try {
      const initialQuantity = isService ? 0 : parsedOpeningQuantity;
      const parsedCostPrice = parseFloat(costPrice) || 0;
      const product = await createProduct({
        business_id: currentBusiness.id,
        name: cleanProductName,
        category_id: productCategory || undefined,
        unit: productUnit,
        cost_price: parsedCostPrice,
        selling_price: parseFloat(sellingPrice),
        reorder_level: parseFloat(reorderLevel) || 5,
        is_service: isService,
      });

      if (!product) throw new Error('Failed to create product');

      if (currentBranch) {
        await supabase.from('inventory').insert({
          product_id: product.id,
          branch_id: currentBranch.id,
          quantity: initialQuantity,
        });

        if (initialQuantity > 0) {
          await supabase.from('stock_movements').insert({
            business_id: currentBusiness.id,
            branch_id: currentBranch.id,
            product_id: product.id,
            type: 'stock_in',
            quantity: initialQuantity,
            unit_cost: parsedCostPrice || undefined,
            total_cost: parsedCostPrice ? parsedCostPrice * initialQuantity : undefined,
            notes: 'Opening stock',
          });
        }
      }

      await load();
      setShowAddProduct(false);
      resetProductForm();
      Toast.show({
        type: 'success',
        text1: 'Product added',
        text2: `${product.name} is now in inventory${initialQuantity > 0 ? ` with ${formatCount(initialQuantity)} ${product.unit}` : ''}.`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStockMovement = async () => {
    if (!selectedProduct || !currentBusiness || !currentBranch) return;
    if (!stockQty || parseFloat(stockQty) <= 0) {
      Alert.alert('Invalid quantity', 'Enter a valid quantity.');
      return;
    }

    setMovingStock(true);
    try {
      const quantity = parseFloat(stockQty);
      const currentStock = getProductStock(selectedProduct);
      const isOut = ['stock_out', 'damage', 'wastage'].includes(stockType);

      if (isOut && quantity > currentStock) {
        Alert.alert('Not enough stock', `Current stock is ${formatCount(currentStock)} ${selectedProduct.unit}.`);
        setMovingStock(false);
        return;
      }

      await supabase.from('stock_movements').insert({
        business_id: currentBusiness.id,
        branch_id: currentBranch.id,
        product_id: selectedProduct.id,
        type: stockType,
        quantity,
        unit_cost: stockUnitCost ? parseFloat(stockUnitCost) : undefined,
        total_cost: stockUnitCost ? parseFloat(stockUnitCost) * quantity : undefined,
        notes: stockNotes.trim() || undefined,
      });

      const newQuantity = isOut ? currentStock - quantity : currentStock + quantity;
      await supabase
        .from('inventory')
        .upsert(
          {
            product_id: selectedProduct.id,
            branch_id: currentBranch.id,
            quantity: newQuantity,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'product_id,branch_id' }
        );

      await load();
      setShowStockModal(false);
      setStockQty('');
      setStockNotes('');
      setStockUnitCost('');
      Toast.show({
        type: 'success',
        text1: 'Stock updated',
        text2: `${selectedProduct.name} • ${formatCount(currentStock)} to ${formatCount(newQuantity)} ${selectedProduct.unit}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setMovingStock(false);
    }
  };

  const getStockBadge = (product: Product) => {
    const stock = getProductStock(product);
    if (product.is_service) return <Badge label="Service" variant="primary" />;
    if (stock === 0) return <Badge label="Out of Stock" variant="danger" />;
    if (stock <= product.reorder_level) return <Badge label="Low Stock" variant="warning" />;
    return <Badge label="In Stock" variant="success" />;
  };

  if (loading) return <LoadingScreen message="Loading inventory..." />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Inventory"
        subtitle={`${filteredProducts.length} product${filteredProducts.length === 1 ? '' : 's'}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Add Product" onPress={() => { resetProductForm(); setShowAddProduct(true); }} />}
      />

      <View style={{ padding: SP.page, gap: 12 }}>
        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.card, paddingHorizontal: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                borderColor: filter === item.key ? COLORS.ink : COLORS.border,
                backgroundColor: filter === item.key ? COLORS.surface2 : COLORS.card,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredProducts.length === 0 ? (
        <EmptyState
          icon="package"
          title="No products found"
          description={search ? 'Try a different search term.' : 'Add your first product to start tracking stock.'}
          action={!search ? { label: 'Add Product', onPress: () => setShowAddProduct(true) } : undefined}
        />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SP.page, gap: 10, paddingBottom: insets.bottom + 92 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.ink} />}
          renderItem={({ item }) => {
            const stock = getProductStock(item);

            return (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                    <View style={{ width: 44, height: 44, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={item.is_service ? 'tool' : 'package'} size={18} color={COLORS.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                        {item.category?.name ?? 'Uncategorized'} • {item.unit}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {getStockBadge(item)}
                        {!item.is_service ? (
                          <Text style={{ fontSize: 12, color: COLORS.text.secondary }}>
                            {formatCount(stock)} {item.unit}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 10 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>{formatCurrency(item.selling_price)}</Text>
                    <Button
                      title="Update Stock"
                      onPress={() => {
                        setSelectedProduct(item);
                        setStockType('stock_in');
                        setStockQty('');
                        setStockNotes('');
                        setStockUnitCost('');
                        setShowStockModal(true);
                      }}
                      size="sm"
                      variant="secondary"
                    />
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal
        visible={showAddProduct}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAddProduct(false)}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader title="Add Product" subtitle="Create a new stock or service item." onClose={() => setShowAddProduct(false)} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
              <InputField
                label="Product or Service Name"
                value={productName}
                onChangeText={setProductName}
                placeholder="e.g. Indomie Noodles, Haircut"
                required
              />
              <SelectField
                label="Category"
                value={productCategory}
                options={[{ value: '', label: 'No Category' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
                onChange={setProductCategory}
              />
              <SelectField
                label="Unit of Measurement"
                value={productUnit}
                options={PRODUCT_UNITS}
                onChange={setProductUnit}
                required
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Cost Price"
                    value={costPrice}
                    onChangeText={setCostPrice}
                    placeholder="0"
                    keyboardType="numeric"
                    prefix="₦"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Selling Price"
                    value={sellingPrice}
                    onChangeText={setSellingPrice}
                    placeholder="0"
                    keyboardType="numeric"
                    prefix="₦"
                    required
                  />
                </View>
              </View>
              <InputField
                label="Reorder Level"
                value={reorderLevel}
                onChangeText={setReorderLevel}
                placeholder="5"
                keyboardType="numeric"
                hint="You will get low-stock warnings below this level."
              />
              {!isService ? (
                <InputField
                  label={`Opening Quantity (${productUnit})`}
                  value={openingQuantity}
                  onChangeText={setOpeningQuantity}
                  placeholder="0"
                  keyboardType="numeric"
                  hint="Set the starting stock while creating this product."
                />
              ) : null}
              <Toggle
                label="This is a service"
                description="Services are listed in sales but do not affect stock quantity."
                value={isService}
                onChange={setIsService}
              />
              <Button title={saving ? 'Saving...' : 'Add Product'} onPress={handleSaveProduct} loading={saving} size="lg" />
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>

      <Modal
        visible={showStockModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowStockModal(false)}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader title="Update Stock" subtitle={selectedProduct?.name} onClose={() => setShowStockModal(false)} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
              {selectedProduct ? (
                <FlatSection style={{ padding: 16, marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Current stock</Text>
                  <Text style={{ fontSize: 28, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 6 }}>
                    {formatCount(getProductStock(selectedProduct))} {selectedProduct.unit}
                  </Text>
                </FlatSection>
              ) : null}

              <SelectField
                label="Movement Type"
                value={stockType}
                options={[
                  { value: 'stock_in', label: 'Stock In (Restock)' },
                  { value: 'stock_out', label: 'Stock Out (Manual)' },
                  { value: 'adjustment', label: 'Adjustment (Correction)' },
                  { value: 'damage', label: 'Damaged' },
                  { value: 'wastage', label: 'Wastage' },
                ]}
                onChange={(value) => setStockType(value as StockMovementType)}
                required
              />
              <InputField
                label={`Quantity (${selectedProduct?.unit ?? 'units'})`}
                value={stockQty}
                onChangeText={setStockQty}
                placeholder="0"
                keyboardType="numeric"
                required
              />
              {stockType === 'stock_in' ? (
                <InputField
                  label="Unit Cost"
                  value={stockUnitCost}
                  onChangeText={setStockUnitCost}
                  placeholder="Optional"
                  keyboardType="numeric"
                  prefix="₦"
                />
              ) : null}
              <InputField
                label="Notes"
                value={stockNotes}
                onChangeText={setStockNotes}
                placeholder="Supplier name or reason for adjustment"
                multiline
                numberOfLines={3}
              />
              <Button title="Update Stock" onPress={handleStockMovement} loading={movingStock} size="lg" />
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
