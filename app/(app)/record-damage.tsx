import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import Toast from 'react-native-toast-message';

import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { supabase } from '@/lib/supabase';
import { readCachedRows } from '@/lib/offlineStore';
import { recordDamagedStockOffline } from '@/lib/offlineRecords';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';

import { Button, Card, EmptyState, PermissionDenied, SmartChip } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, Toggle } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { Product, StockMovement } from '@/types';

const formatCurrency = (val: number) =>
  `${CURRENCY_SYMBOL}${Number(val || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

const DAMAGE_REASONS = [
  { key: 'expired', label: 'Expired / Spoilt', icon: 'clock' as const },
  { key: 'broken', label: 'Broken / Smashed', icon: 'alert-triangle' as const },
  { key: 'water', label: 'Water / Moisture', icon: 'droplet' as const },
  { key: 'pest', label: 'Pest / Infestation', icon: 'shield-off' as const },
  { key: 'defect', label: 'Factory Defect', icon: 'tool' as const },
  { key: 'other', label: 'Other Incident', icon: 'x-octagon' as const },
];

export default function RecordDamageScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, userRole, user } = useAuthStore();
  const canManageInventory = hasPermission(userRole, 'inventory.manage');

  const products = useBusinessStore((s) => s.products);
  const fetchProducts = useBusinessStore((s) => s.fetchProducts);

  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const initialProductId = Array.isArray(params.productId) ? params.productId[0] : params.productId;

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(() => {
    if (initialProductId) {
      return products.find((p) => p.id === initialProductId && !p.is_service) ?? null;
    }
    return null;
  });

  const [productSearch, setProductSearch] = useState('');
  const [damageQty, setDamageQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [selectedReason, setSelectedReason] = useState<string>('Broken / Smashed');
  const [notes, setNotes] = useState('');
  const [deductLoss, setDeductLoss] = useState(true);
  const [incidentDate, setIncidentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);
  const [damageMovements, setDamageMovements] = useState<StockMovement[]>([]);
  const [loadingDamageData, setLoadingDamageData] = useState(false);

  const loadDamageData = useCallback(async () => {
    if (!currentBusiness?.id || !currentBranch?.id) return;
    setLoadingDamageData(true);
    try {
      const cached = await readCachedRows<StockMovement>(
        { businessId: currentBusiness.id, branchId: currentBranch.id },
        'stock_movements'
      );
      if (cached && cached.length > 0) {
        const damageCached = cached.filter((m) => m.type === 'damage');
        setDamageMovements(damageCached);
      }

      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, product:products(name, unit)')
        .eq('business_id', currentBusiness.id)
        .eq('branch_id', currentBranch.id)
        .eq('type', 'damage')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setDamageMovements(data as StockMovement[]);
      }
    } catch (err) {
      console.warn('Could not load damage data', err);
    } finally {
      setLoadingDamageData(false);
    }
  }, [currentBusiness?.id, currentBranch?.id]);

  useEffect(() => {
    loadDamageData();
  }, [loadDamageData]);

  const damageStats = useMemo(() => {
    const totalQty = damageMovements.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    const totalLoss = damageMovements.reduce((sum, m) => sum + Number(m.total_cost || 0), 0);
    const incidents = damageMovements.length;

    const reasonTally: Record<string, number> = {};
    damageMovements.forEach((m) => {
      const cause = (m.notes ?? '').split(' · ')[0] || 'Incident';
      reasonTally[cause] = (reasonTally[cause] || 0) + 1;
    });

    let topReason = 'None';
    let topCount = 0;
    Object.entries(reasonTally).forEach(([cause, count]) => {
      if (count > topCount) {
        topCount = count;
        topReason = cause;
      }
    });

    return {
      totalQty,
      totalLoss,
      incidents,
      topReason,
    };
  }, [damageMovements]);

  // Sync products if needed
  useEffect(() => {
    if (currentBusiness?.id && products.length === 0) {
      void fetchProducts(currentBusiness.id);
    }
  }, [currentBusiness?.id, fetchProducts, products.length]);

  // When initial product id is passed and resolved
  useEffect(() => {
    if (initialProductId && !selectedProduct && products.length > 0) {
      const found = products.find((p) => p.id === initialProductId && !p.is_service);
      if (found) setSelectedProduct(found);
    }
  }, [initialProductId, products, selectedProduct]);

  // Sync unit cost with selected product
  useEffect(() => {
    if (selectedProduct) {
      const cost = Number(selectedProduct.cost_price || 0);
      setUnitCost(cost > 0 ? `${cost}` : '');
    }
  }, [selectedProduct]);

  const getProductStock = useCallback(
    (product: Product) => {
      if (!currentBranch?.id) return 0;
      return product.inventory?.find((inv) => inv.branch_id === currentBranch.id)?.quantity ?? 0;
    },
    [currentBranch?.id],
  );

  const currentStock = selectedProduct ? getProductStock(selectedProduct) : 0;
  const parsedQty = parseFloat(damageQty) || 0;
  const parsedCost = parseFloat(unitCost) || 0;
  const totalLoss = Math.max(0, Number((parsedQty * parsedCost).toFixed(2)));
  const remainingStock = Math.max(0, Number((currentStock - parsedQty).toFixed(2)));

  const cleanUnit = selectedProduct?.unit?.trim() || 'unit';

  // Filter products for search
  const selectableProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (p.is_service || p.is_active === false) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
    });
  }, [products, productSearch]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSearch('');
    const stock = getProductStock(product);
    setDamageQty(stock > 0 ? '1' : '0');
  };

  const handleQuickQtyChange = (delta: number) => {
    const next = Math.max(1, Math.min(currentStock, parsedQty + delta));
    setDamageQty(`${next}`);
  };

  const handleMaxQty = () => {
    if (currentStock > 0) {
      setDamageQty(`${currentStock}`);
    }
  };

  const handleSaveDamage = async () => {
    if (!currentBusiness || !currentBranch) {
      Alert.alert('Branch required', 'Please select a branch first.');
      return;
    }

    if (!selectedProduct) {
      Alert.alert('Product required', 'Please select the product that was damaged.');
      return;
    }

    if (parsedQty <= 0) {
      Alert.alert('Invalid quantity', 'Please enter a valid quantity of damaged goods.');
      return;
    }

    if (currentStock <= 0) {
      Alert.alert('No stock available', `There is currently 0 ${cleanUnit} of ${selectedProduct.name} in this branch.`);
      return;
    }

    if (parsedQty > currentStock) {
      Alert.alert(
        'Quantity exceeds stock',
        `You cannot record ${formatCount(parsedQty)} ${cleanUnit} as damaged because only ${formatCount(currentStock)} ${cleanUnit} is currently on hand in this branch.`
      );
      return;
    }

    Alert.alert(
      'Confirm Damaged Stock',
      `Record ${formatCount(parsedQty)} ${cleanUnit} of "${selectedProduct.name}" as damaged?\n\n• On-hand stock will decrease by ${formatCount(parsedQty)} ${cleanUnit} (Remaining: ${formatCount(remainingStock)} ${cleanUnit}).\n${deductLoss && totalLoss > 0 ? `• Financial loss of ${formatCurrency(totalLoss)} will be deducted from business profit.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record Damage',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await recordDamagedStockOffline({
                businessId: currentBusiness.id,
                branchId: currentBranch.id,
                userId: user?.id,
                product: selectedProduct,
                quantity: parsedQty,
                unitCost: parsedCost,
                reason: selectedReason,
                notes: notes.trim() || undefined,
                deductFromProfit: deductLoss,
                damageDate: incidentDate ? `${incidentDate}T${format(new Date(), 'HH:mm:ss.SSSxxx')}` : undefined,
              });

              // Refresh stores in background
              void useBusinessStore.getState().fetchProducts(currentBusiness.id);
              void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
              void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);

              Toast.show({
                type: 'success',
                text1: 'Damaged stock recorded',
                text2: `-${formatCount(parsedQty)} ${cleanUnit} deducted${totalLoss > 0 ? ` · ${formatCurrency(totalLoss)} written off` : ''}.`,
              });

              dismissScreen();
            } catch (err: any) {
              Alert.alert('Unable to record damage', err?.message ?? 'Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!canManageInventory) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Damaged Goods"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Inventory Management Restricted"
          description="Only business owners and managers can write off and record damaged stock."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Damaged Goods"
        subtitle={selectedProduct ? `${selectedProduct.name} · ${cleanUnit}` : 'Loss overview & damage records'}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
      />

      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: SP.page,
          paddingBottom: insets.bottom + 40,
          gap: 16,
        }}
      >
        {/* ── 0. Damaged Goods Overview Stats ─────────────────── */}
        <View style={styles.statsOverviewCard}>
          <View style={styles.statsHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="bar-chart-2" size={14} color="#DC2626" />
              <Text style={styles.statsHeaderTitle}>Damage Overview</Text>
            </View>
            <Text style={styles.statsHeaderSubtitle}>
              {currentBranch?.name ?? 'This Branch'}
            </Text>
          </View>

          <View style={styles.statsMetricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>DAMAGED UNITS</Text>
              <Text style={styles.metricValue}>
                {formatCount(damageStats.totalQty)}
              </Text>
              <Text style={styles.metricSub}>
                {damageStats.incidents} incident{damageStats.incidents === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>FINANCIAL LOSS</Text>
              <Text style={[styles.metricValue, { color: '#DC2626' }]}>
                {formatCurrency(damageStats.totalLoss)}
              </Text>
              <Text style={styles.metricSub}>Written off to profit</Text>
            </View>
          </View>

          {damageStats.incidents > 0 && damageStats.topReason !== 'None' ? (
            <View style={styles.statsCauseRow}>
              <Feather name="pie-chart" size={12} color="#991B1B" />
              <Text style={styles.statsCauseText}>
                Most frequent cause:{' '}
                <Text style={{ fontFamily: FONT.semiBold, color: '#991B1B' }}>
                  {damageStats.topReason}
                </Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── 1. Product Selection ────────────────────────────── */}
        {selectedProduct ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={styles.productAvatar}>
                <Feather name="box" size={18} color="#FFFFFF" />
              </View>
              <TouchableOpacity
                onPress={() => setSelectedProduct(null)}
                style={styles.changeProductBtn}
                activeOpacity={0.7}
              >
                <Feather name="refresh-cw" size={12} color={COLORS.navy} />
                <Text style={styles.changeProductBtnText}>Change Item</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.productNameText} numberOfLines={1}>
                {selectedProduct.name}
              </Text>
              <Text style={styles.productCategoryText}>
                {selectedProduct.category?.name ?? 'General Product'} · Unit: {cleanUnit}
              </Text>
            </View>

            <View style={styles.productStatsRow}>
              <View style={styles.productStatItem}>
                <Text style={styles.productStatLabel}>ON-HAND STOCK</Text>
                <Text style={[styles.productStatValue, { color: currentStock <= 0 ? COLORS.danger : COLORS.success }]}>
                  {formatCount(currentStock)} {cleanUnit}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.productStatItem}>
                <Text style={styles.productStatLabel}>CATALOG COST</Text>
                <Text style={styles.productStatValue}>
                  {formatCurrency(Number(selectedProduct.cost_price || 0))}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>Select Damaged Product</Text>
            <View style={styles.searchBarContainer}>
              <Feather name="search" size={15} color={COLORS.text.muted} />
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search product by name or barcode..."
                placeholderTextColor={COLORS.text.muted}
                style={styles.searchInput}
              />
              {productSearch ? (
                <TouchableOpacity onPress={() => setProductSearch('')}>
                  <Feather name="x" size={15} color={COLORS.text.muted} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ gap: 8, maxHeight: 300 }}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {selectableProducts.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.muted }}>
                      No physical products found
                    </Text>
                  </View>
                ) : (
                  selectableProducts.map((p) => {
                    const stock = getProductStock(p);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => handleSelectProduct(p)}
                        activeOpacity={0.7}
                        style={styles.productPickRow}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickRowTitle} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={styles.pickRowSubtitle}>
                            Cost: {formatCurrency(Number(p.cost_price || 0))} · Sell: {formatCurrency(p.selling_price)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <SmartChip
                            label={`${formatCount(stock)} ${p.unit || 'unit'}`}
                            deep
                            variant={stock <= 0 ? 'danger' : stock <= (p.reorder_level || 5) ? 'warning' : 'success'}
                            size="xs"
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* ── 2. Quantity & Remaining Impact ──────────────────── */}
        {selectedProduct && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionHeaderTitle}>Damaged Quantity ({cleanUnit})</Text>

              <View style={styles.qtyControlRow}>
                <TouchableOpacity
                  onPress={() => handleQuickQtyChange(-1)}
                  disabled={parsedQty <= 1}
                  style={[styles.stepBtn, parsedQty <= 1 && styles.stepBtnDisabled]}
                >
                  <Feather name="minus" size={16} color={parsedQty <= 1 ? COLORS.text.muted : COLORS.navy} />
                </TouchableOpacity>

                <TextInput
                  value={damageQty}
                  onChangeText={(val) => setDamageQty(val.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                  style={styles.qtyInput}
                  selectTextOnFocus
                />

                <TouchableOpacity
                  onPress={() => handleQuickQtyChange(1)}
                  disabled={parsedQty >= currentStock}
                  style={[styles.stepBtn, parsedQty >= currentStock && styles.stepBtnDisabled]}
                >
                  <Feather name="plus" size={16} color={parsedQty >= currentStock ? COLORS.text.muted : COLORS.navy} />
                </TouchableOpacity>

                {currentStock > 1 ? (
                  <TouchableOpacity
                    onPress={handleMaxQty}
                    style={styles.maxQtyBtn}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.maxQtyBtnText}>All ({formatCount(currentStock)})</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Stock Impact Visual */}
              <View style={styles.impactContainer}>
                <View style={styles.impactCol}>
                  <Text style={styles.impactLabel}>CURRENT</Text>
                  <Text style={styles.impactValue}>{formatCount(currentStock)} {cleanUnit}</Text>
                </View>
                <Feather name="arrow-right" size={14} color={COLORS.danger} />
                <View style={styles.impactCol}>
                  <Text style={[styles.impactLabel, { color: COLORS.danger }]}>DAMAGED</Text>
                  <Text style={[styles.impactValue, { color: COLORS.danger }]}>-{formatCount(parsedQty)} {cleanUnit}</Text>
                </View>
                <Feather name="arrow-right" size={14} color={COLORS.navy} />
                <View style={styles.impactCol}>
                  <Text style={[styles.impactLabel, { color: COLORS.navy }]}>NEW STOCK</Text>
                  <Text style={[styles.impactValue, { color: COLORS.navy }]}>{formatCount(remainingStock)} {cleanUnit}</Text>
                </View>
              </View>
            </View>

            {/* ── 3. Damage Cause & Incident Details ───────────── */}
            <View style={styles.card}>
              <Text style={styles.sectionHeaderTitle}>Cause of Damage</Text>
              <View style={styles.reasonGrid}>
                {DAMAGE_REASONS.map((r) => {
                  const active = selectedReason === r.label;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      onPress={() => setSelectedReason(r.label)}
                      activeOpacity={0.75}
                      style={[styles.reasonChip, active && styles.reasonChipActive]}
                    >
                      <Feather
                        name={r.icon}
                        size={12}
                        color={active ? '#FFFFFF' : COLORS.text.secondary}
                      />
                      <Text style={[styles.reasonChipText, active && styles.reasonChipTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <InputField
                label="Incident Details / Specific Note (Optional)"
                placeholder="e.g. Expired on 28th, broken carton during transit"
                value={notes}
                onChangeText={setNotes}
                containerStyle={{ marginBottom: 0, marginTop: 4 }}
              />
            </View>

            {/* ── 4. Financial Loss & Profit Subtraction ─────────── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionHeaderTitle}>Valuation & Financial Loss</Text>
                <View style={styles.lossBadge}>
                  <Feather name="alert-triangle" size={11} color="#B91C1C" />
                  <Text style={styles.lossBadgeText}>WRITE-OFF</Text>
                </View>
              </View>

              <InputField
                label={`Unit Cost Price per ${cleanUnit}`}
                placeholder="0"
                keyboardType="numeric"
                prefix={CURRENCY_SYMBOL}
                value={unitCost}
                onChangeText={setUnitCost}
                hint={parsedCost === 0 ? 'Enter the cost price to calculate the financial write-off loss.' : undefined}
                containerStyle={{ marginBottom: 0 }}
              />

              {/* Total Loss Display Card */}
              <View style={styles.totalLossCard}>
                <View style={styles.lossTopRow}>
                  <Text style={styles.lossCardLabel}>TOTAL ESTIMATED LOSS</Text>
                  <Text style={styles.lossCardValue}>{formatCurrency(totalLoss)}</Text>
                </View>
                <Text style={styles.lossCardSubtext}>
                  Calculated as {formatCount(parsedQty)} {cleanUnit} × {formatCurrency(parsedCost)} unit cost.
                </Text>
              </View>

              {/* Subtract Loss Toggle */}
              <View style={styles.toggleWrapper}>
                <Toggle
                  label="Deduct loss from business profit & expenses"
                  description={`Records this ${formatCurrency(totalLoss)} as a damaged goods loss in business expenses so today's profit and net analytics reflect the write-off.`}
                  value={deductLoss}
                  onChange={setDeductLoss}
                />
              </View>
            </View>

            {/* ── 5. Incident Date ──────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.sectionHeaderTitle}>Date of Damage</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[
                  { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
                  { label: 'Yesterday', value: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
                ].map((d) => {
                  const active = incidentDate === d.value;
                  return (
                    <TouchableOpacity
                      key={d.label}
                      onPress={() => setIncidentDate(d.value)}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                    >
                      <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>
                        {d.label} ({d.value})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── 6. Save Action Button ─────────────────────────── */}
            <Button
              title={saving ? 'Recording Damage...' : `Record ${formatCount(parsedQty)} ${cleanUnit} Damaged`}
              onPress={handleSaveDamage}
              loading={saving}
              disabled={saving || parsedQty <= 0 || parsedQty > currentStock}
              variant="danger"
              size="lg"
              style={{ marginTop: 6 }}
            />
          </>
        )}

        {/* ── 4. Recent Damaged Stock Logs ────────────────────── */}
        {damageMovements.length > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionHeaderTitle}>Recent Damaged Stock Logs</Text>
              <TouchableOpacity
                onPress={() => router.push('/(app)/stock-history')}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.navy }}>
                  View History
                </Text>
                <Feather name="arrow-right" size={13} color={COLORS.navy} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              {damageMovements.slice(0, 3).map((item) => {
                const productName = (item.product as any)?.name ?? 'Unknown item';
                const unit = (item.product as any)?.unit ?? 'unit';
                const formattedDate = format(new Date(item.created_at), 'MMM d, yyyy \u00B7 h:mm a');
                const reasonNote = item.notes?.split(' · ')[0] ?? 'Damage';

                return (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: COLORS.surface2,
                      borderRadius: RADIUS.md,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: COLORS.borderSubtle,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.primary }} numberOfLines={1}>
                        {productName}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
                        {formattedDate} · {reasonNote}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.danger }}>
                        -{formatCount(item.quantity)} {unit}
                      </Text>
                      {item.total_cost ? (
                        <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
                          {formatCurrency(item.total_cost)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  statsOverviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsHeaderTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.1,
  },
  statsHeaderSubtitle: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  statsMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metricItem: {
    flex: 1,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 2,
  },
  metricSub: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  statsCauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  statsCauseText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.1,
  },
  productAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: RADIUS.full,
    backgroundColor: '#F0F9FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BAE6FD',
  },
  changeProductBtnText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.navy,
  },
  productNameText: {
    fontSize: 16.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  productCategoryText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  productStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  productStatItem: {
    flex: 1,
  },
  productStatLabel: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  productStatValue: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '80%',
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },

  // Search input
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
  },
  productPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  pickRowTitle: {
    fontSize: 13.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  pickRowSubtitle: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  // Quantity controls
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  qtyInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    textAlign: 'center',
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  maxQtyBtn: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxQtyBtnText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.text.secondary,
  },

  // Stock Impact strip
  impactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  impactCol: {
    alignItems: 'center',
  },
  impactLabel: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  impactValue: {
    fontSize: 12.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 2,
  },

  // Reasons Grid
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  reasonChipActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  reasonChipText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  reasonChipTextActive: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
  },

  // Loss Valuation
  lossBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
  },
  lossBadgeText: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: '#B91C1C',
    letterSpacing: 0.4,
  },
  totalLossCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.md,
    padding: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCA5A5',
    gap: 4,
    marginTop: 4,
  },
  lossTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lossCardLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: '#991B1B',
    letterSpacing: 0.5,
  },
  lossCardValue: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#B91C1C',
  },
  lossCardSubtext: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: '#7F1D1D',
  },
  toggleWrapper: {
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },

  // Date chips
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  dateChipActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  dateChipText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  dateChipTextActive: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
  },
});
