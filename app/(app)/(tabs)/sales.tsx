import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { shareReceiptViaWhatsApp } from '@/lib/reports';
import { fetchRevenueActivities } from '@/lib/revenue';
import {
  createAltUnitNote,
  getDefaultBundleSize,
  getSaleUnitOption,
  getSaleUnitOptions,
  usesCustomBundleSize,
} from '@/lib/records';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Button, Card, EmptyState, LoadingScreen, SectionHeader, Divider, PaymentSummary } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { ScreenShell, ScreenHeader, HeaderAction, OverlayHeader, FlatSection } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE, PAYMENT_METHODS } from '@/constants';
import { CartItem, PaymentMethod, Product, RevenueActivity, Sale } from '@/types';

const formatCurrency = (value: number) =>
  `\u20A6${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const roundAmount = (value: number) => Number(value.toFixed(2));

export default function SalesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ modal?: string }>();
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const { products, fetchProducts } = useBusinessStore();

  const [activities, setActivities] = useState<RevenueActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecordSale, setShowRecordSale] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [savingSale, setSavingSale] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const data = await fetchRevenueActivities(currentBusiness.id, currentBranch.id, 60);
      setActivities(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentBusiness, currentBranch]);

  const refreshSalesData = useCallback(async () => {
    if (!currentBusiness) return;

    await Promise.all([loadActivities(), fetchProducts(currentBusiness.id)]);
  }, [currentBusiness, fetchProducts, loadActivities]);

  useEffect(() => {
    refreshSalesData();
  }, [refreshSalesData]);

  useRealtimeRefresh({
    channelName: `sales-screen-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id],
    tables: [
      ...(currentBranch ? [{ table: 'sales', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'inventory', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'stock_movements', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      ...(currentBranch ? [{ table: 'customer_debts', filter: `branch_id=eq.${currentBranch.id}` }] : []),
      { table: 'debt_repayments' },
      ...(currentBusiness ? [{ table: 'products', filter: `business_id=eq.${currentBusiness.id}` }] : []),
    ],
    onRefresh: refreshSalesData,
  });

  const getProductStock = useCallback(
    (product: Product) => {
      if (!currentBranch) return 0;
      return product.inventory?.find((inventoryItem) => inventoryItem.branch_id === currentBranch.id)?.quantity ?? 0;
    },
    [currentBranch],
  );

  const buildCartItem = useCallback(
    (
      product: Product,
      quantity = 1,
      saleUnit = product.unit,
      discountAmount = 0,
      unitPriceOverride?: number,
      bundleSize = getDefaultBundleSize(product),
    ): CartItem => {
      const normalizedBundleSize = usesCustomBundleSize(product) ? Math.max(bundleSize ?? 1, 1) : bundleSize;
      const unitOption = getSaleUnitOption(product, saleUnit, normalizedBundleSize);
      const unitPrice = roundAmount(Math.max(unitPriceOverride ?? product.selling_price * unitOption.stockFactor, 0));
      const subtotal = roundAmount(quantity * unitPrice);
      const normalizedDiscount = roundAmount(Math.min(Math.max(discountAmount, 0), subtotal));

      return {
        product,
        quantity,
        stock_quantity: roundAmount(quantity * unitOption.stockFactor),
        sale_unit: saleUnit,
        unit_price: unitPrice,
        discount_amount: normalizedDiscount,
        total_price: roundAmount(subtotal - normalizedDiscount),
        bundle_size: normalizedBundleSize,
        base_sale_unit: product.unit,
        uses_custom_bundle: usesCustomBundleSize(product),
      };
    },
    [],
  );

  const productCategories = useMemo(() => {
    const categoryMap = new Map<string, string>();
    products.forEach((product) => {
      if (product.category_id && product.category?.name) {
        categoryMap.set(product.category_id, product.category.name);
      }
    });

    return Array.from(categoryMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const hasUncategorizedProducts = useMemo(
    () => products.some((product) => product.is_active && !product.category_id),
    [products],
  );

  const matchingProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => {
        if (!product.is_active) return false;
        const matchesCategory =
          selectedCategory === 'all'
            ? true
            : selectedCategory === 'uncategorized'
              ? !product.category_id
              : product.category_id === selectedCategory;
        const matchesSearch = query.length === 0 ? selectedCategory !== 'all' : product.name.toLowerCase().includes(query);

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      });
  }, [products, search, selectedCategory]);

  const productSearchResults = matchingProducts.slice(0, 20);
  const hasMoreProductResults = matchingProducts.length > productSearchResults.length;

  const resetSaleForm = () => {
    setCart([]);
    setSearch('');
    setSelectedCategory('all');
    setQuantityInputs({});
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('cash');
    setAmountPaid('');
    setSaleNotes('');
  };

  const removeProductFromCart = (productId: string) => {
    setCart((previousCart) => previousCart.filter((item) => item.product.id !== productId));
    setQuantityInputs((previousInputs) => {
      const nextInputs = { ...previousInputs };
      delete nextInputs[productId];
      return nextInputs;
    });
  };

  const addProductToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) return;

    const stock = getProductStock(product);
    if (!product.is_service && stock <= 0) {
      Alert.alert('Out of stock', `${product.name} is currently out of stock.`);
      return;
    }

    setCart((previousCart) => [...previousCart, buildCartItem(product)]);
    setQuantityInputs((previousInputs) => ({ ...previousInputs, [product.id]: '1' }));
  };

  const updateCartItem = (
    productId: string,
    changes: {
      quantity?: number;
      saleUnit?: string;
      discountAmount?: number;
      unitPrice?: number;
      bundleSize?: number;
    },
  ) => {
    setCart((previousCart) =>
      previousCart.flatMap((item) => {
        if (item.product.id !== productId) return [item];

        const nextQuantity = changes.quantity ?? item.quantity;
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
          return [item];
        }

        const nextSaleUnit = changes.saleUnit ?? item.sale_unit;
        const nextDiscount = changes.discountAmount ?? item.discount_amount;
        const nextBundleSize = changes.bundleSize ?? item.bundle_size ?? getDefaultBundleSize(item.product);
        const shouldRecalculatePrice = changes.saleUnit !== undefined || changes.bundleSize !== undefined;
        const nextUnitPrice =
          changes.unitPrice !== undefined ? changes.unitPrice : shouldRecalculatePrice ? undefined : item.unit_price;
        const nextItem = buildCartItem(
          item.product,
          nextQuantity,
          nextSaleUnit,
          nextDiscount,
          nextUnitPrice,
          nextBundleSize,
        );
        const availableStock = getProductStock(item.product);

        if (!item.product.is_service && nextItem.stock_quantity > availableStock) {
          Alert.alert(
            'Not enough stock',
            `${item.product.name} has ${formatCount(availableStock)} ${item.product.unit} available.`,
          );
          return [item];
        }

        return [nextItem];
      }),
    );
  };

  const handleQuantityChange = (productId: string, value: string) => {
    setQuantityInputs((previousInputs) => ({ ...previousInputs, [productId]: value }));

    if (!value.trim()) return;

    const nextQuantity = parseFloat(value);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

    updateCartItem(productId, { quantity: nextQuantity });
  };

  const handleQuantityBlur = (productId: string) => {
    const item = cart.find((cartItem) => cartItem.product.id === productId);
    if (!item) return;

    const draftQuantity = quantityInputs[productId];
    const parsedQuantity = draftQuantity === undefined ? item.quantity : parseFloat(draftQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setQuantityInputs((previousInputs) => ({ ...previousInputs, [productId]: `${item.quantity}` }));
      return;
    }

    setQuantityInputs((previousInputs) => ({ ...previousInputs, [productId]: `${item.quantity}` }));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalDiscount = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const paidAmount = amountPaid === '' ? cartTotal : parseFloat(amountPaid) || 0;
  const amountOwed = Math.max(0, roundAmount(cartTotal - paidAmount));
  const paymentStatus = paidAmount >= cartTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'credit';

  const openRecordSale = () => {
    resetSaleForm();
    setShowRecordSale(true);
  };

  const clearRecordSaleRouteParam = () => {
    if (params.modal === 'record-sale') {
      router.replace('/(app)/(tabs)/sales');
    }
  };

  const closeRecordSale = () => {
    setShowRecordSale(false);
    clearRecordSaleRouteParam();
  };

  useEffect(() => {
    if (params.modal === 'record-sale') {
      openRecordSale();
    }
  }, [params.modal]);

  const shareSaleReceipt = async (saleId: string) => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*, customer:customers(name, phone)')
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;

      const { data, error } = await supabase.from('sale_items').select('*, product:products(name)').eq('sale_id', saleId);

      if (error) throw error;

      await shareReceiptViaWhatsApp(
        {
          ...(sale as Sale),
          items: data ?? [],
        },
        currentBusiness,
        currentBranch,
      );
    } catch (err) {
      Alert.alert('Unable to share receipt', 'The sale receipt could not be prepared right now.');
      console.error(err);
    }
  };

  const handleRecordSale = async () => {
    if (!currentBusiness || !currentBranch || !user) return;
    if (cart.length === 0) {
      Alert.alert('Empty cart', 'Add at least one product before recording a sale.');
      return;
    }

    const invalidBundleItem = cart.find(
      (item) => item.uses_custom_bundle && item.sale_unit !== item.product.unit && (!item.bundle_size || item.bundle_size <= 1),
    );
    if (invalidBundleItem) {
      Alert.alert(
        'Bundle size required',
        `Set how many units make up one ${invalidBundleItem.product.unit} for ${invalidBundleItem.product.name}.`,
      );
      return;
    }

    if (amountOwed > 0 && !customerName.trim()) {
      Alert.alert('Customer required', 'Enter a customer name for sales with an outstanding balance.');
      return;
    }

    setSavingSale(true);
    try {
      const { data: saleNumberData } = await supabase.rpc('generate_sale_number', {
        p_business_id: currentBusiness.id,
      });

      let customerId: string | undefined;
      if (customerName.trim()) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('business_id', currentBusiness.id)
          .ilike('name', customerName.trim())
          .limit(1)
          .single();

        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          const { data: newCustomer } = await supabase
            .from('customers')
            .insert({
              business_id: currentBusiness.id,
              name: customerName.trim(),
              phone: customerPhone.trim() || undefined,
            })
            .select('id')
            .single();

          customerId = newCustomer?.id;
        }
      }

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          business_id: currentBusiness.id,
          branch_id: currentBranch.id,
          customer_id: customerId,
          sale_number: saleNumberData ?? `SALE-${Date.now()}`,
          subtotal: roundAmount(subtotal),
          discount_amount: roundAmount(totalDiscount),
          tax_amount: 0,
          total_amount: roundAmount(cartTotal),
          amount_paid: roundAmount(paidAmount),
          amount_owed: roundAmount(amountOwed),
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          notes: saleNotes.trim() || undefined,
          sold_by: user.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      for (const item of cart) {
        const unitOption = getSaleUnitOption(item.product, item.sale_unit, item.bundle_size);
        const stockMovementNote = item.sale_unit !== item.product.unit ? createAltUnitNote(item.sale_unit) : undefined;

        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: roundAmount(item.product.cost_price * unitOption.stockFactor),
          discount_amount: item.discount_amount,
          total_price: item.total_price,
        });

        if (!item.product.is_service) {
          const currentStock = getProductStock(item.product);

          await supabase.from('inventory').upsert(
            {
              product_id: item.product.id,
              branch_id: currentBranch.id,
              quantity: roundAmount(Math.max(0, currentStock - item.stock_quantity)),
              last_updated: new Date().toISOString(),
            },
            { onConflict: 'product_id,branch_id' },
          );

          await supabase.from('stock_movements').insert({
            business_id: currentBusiness.id,
            branch_id: currentBranch.id,
            product_id: item.product.id,
            type: 'stock_out',
            quantity: item.quantity,
            reference: sale.sale_number,
            notes: stockMovementNote,
          });
        }
      }

      if (amountOwed > 0 && customerName.trim()) {
        await supabase.from('customer_debts').insert({
          business_id: currentBusiness.id,
          branch_id: currentBranch.id,
          customer_id: customerId,
          sale_id: sale.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || undefined,
          original_amount: roundAmount(cartTotal),
          amount_paid: roundAmount(paidAmount),
          balance: roundAmount(amountOwed),
          status: paymentStatus === 'partial' ? 'partial' : 'outstanding',
          notes: saleNotes.trim() || undefined,
        });
      }

      await refreshSalesData();
      closeRecordSale();
      resetSaleForm();

      Toast.show({
        type: 'success',
        text1: 'Sale recorded',
        text2: `${sale.sale_number} \u2022 ${formatCurrency(cartTotal)}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingSale(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading sales..." />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Sales"
        subtitle={`${activities.length} entr${activities.length === 1 ? 'y' : 'ies'}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Record Sale" onPress={openRecordSale} />}
      />

      {activities.length === 0 ? (
        <EmptyState
          icon="shopping-cart"
          title="No sales yet"
          description="Record your first sale or debt collection to start tracking revenue and stock movement."
          action={{ label: 'Record Sale', onPress: openRecordSale }}
        />
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{ padding: SP.page, gap: 10, paddingBottom: insets.bottom + 92 }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    {item.kind === 'debt_repayment' ? `Payment · ${item.customer_name}` : item.customer_name}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>
                    {item.reference} \u2022 {format(new Date(item.created_at), 'MMM d, h:mm a')}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.text.muted, marginTop: 6 }}>
                    {item.payment_method.replace('_', ' ').toUpperCase()}
                  </Text>
                  {item.notes ? (
                    <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 8 }} numberOfLines={2}>
                      {item.notes}
                    </Text>
                  ) : null}
                </View>
                <PaymentSummary
                  totalAmount={item.total_amount}
                  amountPaid={item.amount_paid}
                  amountOwed={item.amount_owed}
                  tone="sales"
                />
              </View>
              <Divider style={{ marginVertical: 12 }} />
              {item.kind === 'sale' && item.sale_id ? (
                <TouchableOpacity
                  onPress={() => shareSaleReceipt(item.sale_id!)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  activeOpacity={0.78}
                >
                  <Feather name="send" size={15} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.primary }}>Share receipt</Text>
                </TouchableOpacity>
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color: item.amount_owed > 0 ? COLORS.warning : COLORS.success,
                    textAlign: 'center',
                  }}
                >
                  {item.amount_owed > 0 ? `Remaining debt: ${formatCurrency(item.amount_owed)}` : 'Debt fully settled'}
                </Text>
              )}
            </Card>
          )}
        />
      )}

      <Modal
        visible={showRecordSale}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeRecordSale}
      >
        <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <OverlayHeader
              title="Record Sale"
              subtitle="Select products, set quantities, and confirm payment."
              onClose={closeRecordSale}
            />
            <ScrollView
              contentContainerStyle={{ padding: SP.page, paddingBottom: insets.bottom + 32, gap: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <InputField
                label="Search Products"
                value={search}
                onChangeText={setSearch}
                placeholder="Type a product name"
                leftIcon={<Feather name="search" size={16} color={COLORS.text.muted} />}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (productSearchResults.length === 1) {
                    addProductToCart(productSearchResults[0]);
                  }
                }}
              />

              <View>
                <SectionHeader title="Find Product" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                  {[
                    { id: 'all', name: 'All' },
                    ...productCategories,
                    ...(hasUncategorizedProducts ? [{ id: 'uncategorized', name: 'Uncategorized' }] : []),
                  ].map((category) => {
                    const active = selectedCategory === category.id;

                    return (
                      <TouchableOpacity
                        key={category.id}
                        onPress={() => setSelectedCategory(category.id)}
                        activeOpacity={0.8}
                        style={{
                          minHeight: 38,
                          paddingHorizontal: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: active ? COLORS.ink : COLORS.border,
                          backgroundColor: active ? COLORS.surface2 : COLORS.card,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{category.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <FlatSection style={{ padding: 0, overflow: 'hidden' }}>
                  {productSearchResults.length === 0 ? (
                    <View style={{ padding: 18, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: COLORS.text.muted, textAlign: 'center' }}>
                        {search.trim() || selectedCategory !== 'all'
                          ? 'No matching products found.'
                          : 'Search products or choose a category.'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {productSearchResults.map((product, index) => {
                        const stock = getProductStock(product);
                        const inCart = cart.some((item) => item.product.id === product.id);
                        const disabled = !product.is_service && stock <= 0;

                        return (
                          <TouchableOpacity
                            key={product.id}
                            onPress={() => {
                              if (!inCart) {
                                addProductToCart(product);
                              }
                            }}
                            activeOpacity={0.8}
                            disabled={disabled}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 12,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderBottomWidth: index < productSearchResults.length - 1 || hasMoreProductResults ? 1 : 0,
                              borderBottomColor: COLORS.border,
                              backgroundColor: inCart ? COLORS.surface2 : COLORS.card,
                              opacity: disabled ? 0.55 : 1,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }} numberOfLines={1}>
                                {product.name}
                              </Text>
                              <Text style={{ fontSize: 12, color: disabled ? COLORS.danger : COLORS.text.muted, marginTop: 3 }} numberOfLines={1}>
                                {product.is_service
                                  ? 'Service item'
                                  : disabled
                                    ? 'Out of stock'
                                    : `${formatCount(stock)} ${product.unit} available`}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.accent }}>{formatCurrency(product.selling_price)}</Text>
                            <View
                              style={{
                                width: 32,
                                height: 32,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: inCart ? COLORS.success : COLORS.borderDark,
                                backgroundColor: inCart ? COLORS.successLight : COLORS.card,
                              }}
                            >
                              <Feather name={inCart ? 'check' : 'plus'} size={16} color={inCart ? COLORS.success : COLORS.ink} />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {hasMoreProductResults ? (
                        <View style={{ padding: 12, backgroundColor: COLORS.surface }}>
                          <Text style={{ fontSize: 12, color: COLORS.text.muted, textAlign: 'center' }}>
                            Showing first {productSearchResults.length} matches. Keep typing to narrow results.
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </FlatSection>
              </View>

              <View>
                <SectionHeader title={`Cart (${cart.length})`} />
                {cart.length === 0 ? (
                  <FlatSection style={{ padding: 20 }}>
                    <Text style={{ fontSize: 14, color: COLORS.text.muted, textAlign: 'center' }}>
                      Products selected from search will appear here.
                    </Text>
                  </FlatSection>
                ) : (
                  <View style={{ gap: 10 }}>
                    {cart.map((item) => {
                      const unitOptions = getSaleUnitOptions(item.product, item.bundle_size);
                      const isUnitBreakdown = item.sale_unit !== item.product.unit;

                      return (
                        <Card key={item.product.id} style={{ gap: 14 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.product.name}</Text>
                              <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                                {formatCurrency(item.unit_price)} per {item.sale_unit}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => removeProductFromCart(item.product.id)} activeOpacity={0.8}>
                              <Feather name="x" size={18} color={COLORS.text.muted} />
                            </TouchableOpacity>
                          </View>

                          <View style={{ gap: 8 }}>
                            <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.secondary }}>Sell As</Text>
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                              {unitOptions.map((option) => (
                                <TouchableOpacity
                                  key={option.value}
                                  onPress={() => updateCartItem(item.product.id, { saleUnit: option.value })}
                                  activeOpacity={0.8}
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderWidth: 1,
                                    borderColor: item.sale_unit === option.value ? COLORS.ink : COLORS.border,
                                    backgroundColor: item.sale_unit === option.value ? COLORS.surface2 : COLORS.card,
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary }}>{option.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                              <InputField
                                label="Quantity"
                                value={quantityInputs[item.product.id] ?? `${item.quantity}`}
                                onChangeText={(value) => handleQuantityChange(item.product.id, value)}
                                onBlur={() => handleQuantityBlur(item.product.id)}
                                keyboardType="numeric"
                                placeholder="0"
                                containerStyle={{ marginBottom: 0 }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <InputField
                                label="Discount"
                                value={item.discount_amount ? `${item.discount_amount}` : ''}
                                onChangeText={(value) =>
                                  updateCartItem(item.product.id, { discountAmount: parseFloat(value) || 0 })
                                }
                                keyboardType="numeric"
                                placeholder="0"
                                prefix="\u20A6"
                                containerStyle={{ marginBottom: 0 }}
                              />
                            </View>
                          </View>

                          {isUnitBreakdown ? (
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                              {item.uses_custom_bundle ? (
                                <View style={{ flex: 1 }}>
                                  <InputField
                                    label={`Units per ${item.product.unit}`}
                                    value={item.bundle_size && item.bundle_size > 1 ? `${item.bundle_size}` : ''}
                                    onChangeText={(value) =>
                                      updateCartItem(item.product.id, { bundleSize: parseFloat(value) || 0 })
                                    }
                                    keyboardType="numeric"
                                    placeholder="e.g. 12"
                                    hint="Needed to reduce stock correctly."
                                    containerStyle={{ marginBottom: 0 }}
                                  />
                                </View>
                              ) : (
                                <View style={{ flex: 1 }}>
                                  <FlatSection style={{ padding: 12, minHeight: 82, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, color: COLORS.text.muted }}>Stock conversion</Text>
                                    <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 4 }}>
                                      {formatCount(item.bundle_size ?? getDefaultBundleSize(item.product) ?? 1)} {item.sale_unit} per {item.product.unit}
                                    </Text>
                                  </FlatSection>
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <InputField
                                  label={`Price per ${item.sale_unit}`}
                                  value={item.unit_price ? `${item.unit_price}` : ''}
                                  onChangeText={(value) =>
                                    updateCartItem(item.product.id, { unitPrice: parseFloat(value) || 0 })
                                  }
                                  keyboardType="numeric"
                                  placeholder="0"
                                  prefix="\u20A6"
                                  containerStyle={{ marginBottom: 0 }}
                                />
                              </View>
                            </View>
                          ) : null}

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: COLORS.text.muted }}>
                              Uses {formatCount(item.stock_quantity)} {item.product.unit} from stock
                            </Text>
                            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                              {formatCurrency(item.total_price)}
                            </Text>
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                )}
              </View>

              {cart.length > 0 ? (
                <View>
                  <SectionHeader title="Checkout" />
                  <FlatSection style={{ padding: 16, gap: 14 }}>
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: COLORS.text.secondary }}>Subtotal</Text>
                        <Text style={{ fontSize: 13, color: COLORS.text.primary }}>{formatCurrency(subtotal)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: COLORS.text.secondary }}>Discount</Text>
                        <Text style={{ fontSize: 13, color: COLORS.text.primary }}>- {formatCurrency(totalDiscount)}</Text>
                      </View>
                      <Divider />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>Total</Text>
                        <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.accent }}>{formatCurrency(cartTotal)}</Text>
                      </View>
                    </View>

                    <InputField
                      label="Customer Name"
                      value={customerName}
                      onChangeText={setCustomerName}
                      placeholder="Leave blank for walk-in"
                    />
                    <InputField
                      label="Customer Phone"
                      value={customerPhone}
                      onChangeText={setCustomerPhone}
                      placeholder="08012345678"
                      keyboardType="phone-pad"
                    />
                    <InputField
                      label="Amount Paid"
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      placeholder={`${cartTotal}`}
                      keyboardType="numeric"
                      prefix="\u20A6"
                    />
                    {amountOwed > 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: COLORS.warning,
                          backgroundColor: COLORS.warningLight,
                          padding: 12,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
                          Outstanding balance: {formatCurrency(amountOwed)}
                        </Text>
                      </View>
                    ) : null}
                    <SelectField
                      label="Payment Method"
                      value={paymentMethod}
                      options={PAYMENT_METHODS}
                      onChange={(value) => setPaymentMethod(value as PaymentMethod)}
                    />
                    <InputField
                      label="Notes"
                      value={saleNotes}
                      onChangeText={setSaleNotes}
                      placeholder="Optional note for this sale"
                      multiline
                      numberOfLines={3}
                    />
                    <Button
                      title={savingSale ? 'Recording...' : `Confirm Sale \u2022 ${formatCurrency(cartTotal)}`}
                      onPress={handleRecordSale}
                      loading={savingSale}
                      size="lg"
                    />
                  </FlatSection>
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}
