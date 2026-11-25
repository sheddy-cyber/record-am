import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { startOfDay, endOfDay } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { supabase } from '@/lib/supabase';
import { isDebtSettlementSale } from '@/lib/records';
import { dismissScreen } from '@/lib/navigation';
import { Badge, Button, Card, PermissionDenied, SectionHeader } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, Toggle } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { Branch, Product } from '@/types';

interface BranchStats {
  todayRevenue: number;
  todayCount: number;
  staffCount: number;
  stockUnits: number;
}

const fmtCurrency = (val: number) =>
  `${CURRENCY_SYMBOL}${val.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function BranchesManagementScreen() {
  const { currentBusiness, currentBranch, userRole, switchBranch, setCurrentBranch } = useAuthStore();
  const {
    branches,
    products,
    fetchBranches,
    fetchProducts,
    createBranch,
    updateBranch,
    deleteBranch,
    setMainBranch,
    transferBranchStock,
  } = useBusinessStore();

  const isOwner = userRole === 'owner';
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsByBranch, setStatsByBranch] = useState<Record<string, BranchStats>>({});

  // Create / Edit Branch modal state
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formIsMain, setFormIsMain] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);

  // Stock Transfer modal state
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [fromBranchId, setFromBranchId] = useState<string>('');
  const [toBranchId, setToBranchId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferring, setTransferring] = useState(false);

  const loadAll = useCallback(async () => {
    if (!currentBusiness) return;
    setLoadingStats(true);
    try {
      const [branchList] = await Promise.all([
        fetchBranches(currentBusiness.id),
        fetchProducts(currentBusiness.id, isOwner),
      ]);

      const now = new Date();
      const dayStart = startOfDay(now).toISOString();
      const dayEnd = endOfDay(now).toISOString();

      const [salesRes, repaymentsRes, membersRes] = await Promise.all([
        supabase
          .from('sales')
          .select('branch_id, amount_paid, notes')
          .eq('business_id', currentBusiness.id)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd),
        supabase
          .from('debt_repayments')
          .select('amount, debt:customer_debts!inner(business_id, branch_id)')
          .eq('debt.business_id', currentBusiness.id)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd),
        supabase
          .from('business_members')
          .select('branch_id')
          .eq('business_id', currentBusiness.id)
          .eq('is_active', true),
      ]);

      const nextStats: Record<string, BranchStats> = {};
      for (const b of branchList) {
        nextStats[b.id] = {
          todayRevenue: 0,
          todayCount: 0,
          staffCount: 0,
          stockUnits: 0,
        };
      }

      for (const s of (salesRes.data ?? []) as any[]) {
        if (!s.branch_id || !nextStats[s.branch_id] || isDebtSettlementSale(s.notes)) continue;
        nextStats[s.branch_id].todayRevenue += Number(s.amount_paid ?? 0);
        nextStats[s.branch_id].todayCount += 1;
      }

      for (const r of (repaymentsRes.data ?? []) as any[]) {
        const debt = Array.isArray(r.debt) ? r.debt[0] : r.debt;
        const bId = debt?.branch_id;
        if (bId && nextStats[bId]) {
          nextStats[bId].todayRevenue += Number(r.amount ?? 0);
          nextStats[bId].todayCount += 1;
        }
      }

      for (const m of (membersRes.data ?? []) as any[]) {
        if (m.branch_id && nextStats[m.branch_id]) {
          nextStats[m.branch_id].staffCount += 1;
        }
      }

      const latestProducts = useBusinessStore.getState().products;
      for (const p of latestProducts) {
        for (const inv of p.inventory ?? []) {
          if (inv.branch_id && nextStats[inv.branch_id]) {
            nextStats[inv.branch_id].stockUnits += Math.max(0, Number(inv.quantity ?? 0));
          }
        }
      }

      setStatsByBranch(nextStats);
    } catch (err) {
      console.warn('[BranchesManagement] loadAll error:', err);
    } finally {
      setLoadingStats(false);
      setRefreshing(false);
    }
  }, [currentBusiness, fetchBranches, fetchProducts, isOwner]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const consolidated = useMemo(() => {
    const values = Object.values(statsByBranch);
    return {
      totalRevenue: values.reduce((s, v) => s + v.todayRevenue, 0),
      totalTransactions: values.reduce((s, v) => s + v.todayCount, 0),
      totalStock: values.reduce((s, v) => s + v.stockUnits, 0),
      totalStaff: values.reduce((s, v) => s + v.staffCount, 0),
    };
  }, [statsByBranch]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormName('');
    setFormAddress('');
    setFormPhone('');
    setFormIsMain(false);
    setBranchModalVisible(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setFormName(branch.name);
    setFormAddress(branch.address ?? '');
    setFormPhone(branch.phone ?? '');
    setFormIsMain(branch.is_main);
    setBranchModalVisible(true);
  };

  const handleSaveBranch = async () => {
    if (!currentBusiness) return;
    if (!formName.trim()) {
      Alert.alert('Branch Name Required', 'Please enter a branch name.');
      return;
    }

    setSavingBranch(true);
    try {
      if (editingBranch) {
        const updated = await updateBranch(editingBranch.id, {
          name: formName.trim(),
          address: formAddress.trim(),
          phone: formPhone.trim(),
        });
        if (currentBranch?.id === updated.id) {
          setCurrentBranch(updated);
        }
        Toast.show({ type: 'success', text1: 'Branch updated', text2: updated.name });
      } else {
        const created = await createBranch(currentBusiness.id, {
          name: formName.trim(),
          address: formAddress.trim(),
          phone: formPhone.trim(),
          is_main: formIsMain,
        });
        Toast.show({ type: 'success', text1: 'Branch added', text2: created.name });
      }

      setBranchModalVisible(false);
      await loadAll();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save branch details.');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSwitchActive = async (branch: Branch) => {
    await switchBranch(branch);
    Toast.show({
      type: 'success',
      text1: 'Switched Branch',
      text2: `Now viewing ${branch.name}`,
    });
  };

  const handleSetMain = async (branch: Branch) => {
    if (!currentBusiness || branch.is_main) return;
    Alert.alert(
      'Set as Main Branch',
      `Make "${branch.name}" your business Main Branch?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await setMainBranch(currentBusiness.id, branch.id);
              if (currentBranch?.id === branch.id) {
                setCurrentBranch({ ...branch, is_main: true });
              }
              await loadAll();
              Toast.show({ type: 'success', text1: 'Main Branch Updated', text2: branch.name });
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not update main branch.');
            }
          },
        },
      ],
    );
  };

  const handleDeleteBranch = (branch: Branch) => {
    if (!currentBusiness || branch.is_main) {
      Alert.alert('Cannot Delete', 'You cannot delete the Main Branch. Set another branch as Main first.');
      return;
    }

    Alert.alert(
      'Delete Branch',
      `Delete "${branch.name}"? This removes the branch location and its branch-specific records permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Branch',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBranch(currentBusiness.id, branch.id);
              if (currentBranch?.id === branch.id) {
                const fallback = branches.find((b) => b.id !== branch.id && b.is_main) ||
                  branches.find((b) => b.id !== branch.id);
                if (fallback) {
                  await switchBranch(fallback);
                }
              }
              await loadAll();
              Toast.show({ type: 'success', text1: 'Branch deleted' });
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not delete branch.');
            }
          },
        },
      ],
    );
  };

  const openTransferModal = () => {
    if (branches.length < 2) {
      Alert.alert('Add Another Branch First', 'You need at least two branches to transfer stock between locations.');
      return;
    }
    const defaultFrom = currentBranch?.id || branches[0].id;
    const defaultTo = branches.find((b) => b.id !== defaultFrom)?.id || branches[1].id;
    setFromBranchId(defaultFrom);
    setToBranchId(defaultTo);
    setSelectedProductId('');
    setProductSearch('');
    setTransferQty('');
    setTransferNotes('');
    setTransferModalVisible(true);
  };

  const trackedProducts = useMemo(
    () => products.filter((p) => !p.is_service && p.is_active),
    [products],
  );

  const filteredTransferProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return trackedProducts
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [trackedProducts, productSearch]);

  const getProductQtyInBranch = (product: Product, branchId: string) =>
    Number(product.inventory?.find((inv) => inv.branch_id === branchId)?.quantity ?? 0);

  const selectedTransferProduct = useMemo(
    () => trackedProducts.find((p) => p.id === selectedProductId) ?? null,
    [trackedProducts, selectedProductId],
  );

  const handleConfirmTransfer = async () => {
    if (!currentBusiness) return;
    const qty = Number(transferQty);
    if (!selectedProductId) {
      Alert.alert('Select Product', 'Choose a product to transfer.');
      return;
    }
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) {
      Alert.alert('Invalid Branches', 'Choose two different branches for source and destination.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Enter a transfer quantity greater than 0.');
      return;
    }

    setTransferring(true);
    try {
      await transferBranchStock({
        businessId: currentBusiness.id,
        productId: selectedProductId,
        fromBranchId,
        toBranchId,
        quantity: qty,
        notes: transferNotes,
      });
      setTransferModalVisible(false);
      await loadAll();
      Toast.show({
        type: 'success',
        text1: 'Stock Transferred',
        text2: `Moved ${qty} ${selectedTransferProduct?.unit || 'unit(s)'} of ${selectedTransferProduct?.name}`,
      });
    } catch (err: any) {
      Alert.alert('Transfer Failed', err?.message || 'Unable to transfer stock between branches.');
    } finally {
      setTransferring(false);
    }
  };

  if (!isOwner) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Branches"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Owner Access Required"
          description="Only the business owner can manage all branches, switch locations globally, or transfer stock between branches."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Branches & Locations"
        subtitle={`${branches.length} location${branches.length === 1 ? '' : 's'} · ${currentBusiness?.name ?? ''}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={<HeaderAction icon="plus" label="New Branch" onPress={openCreateModal} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SP.page, paddingBottom: 56, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadAll();
            }}
            tintColor={COLORS.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Consolidated All-Branch Summary */}
        <Card style={styles.heroCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.heroOverline}>ALL BRANCHES TODAY</Text>
            {loadingStats ? <ActivityIndicator size="small" color={COLORS.gold} /> : null}
          </View>
          <Text style={styles.heroAmount}>{fmtCurrency(consolidated.totalRevenue)}</Text>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{branches.length}</Text>
              <Text style={styles.heroMetricLbl}>Locations</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{consolidated.totalTransactions}</Text>
              <Text style={styles.heroMetricLbl}>Sales Today</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{consolidated.totalStock.toLocaleString()}</Text>
              <Text style={styles.heroMetricLbl}>Total Units</Text>
            </View>
          </View>
        </Card>

        {/* Cross-branch quick actions */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={openCreateModal}
            activeOpacity={0.8}
            style={[styles.actionPill, { backgroundColor: COLORS.ink }]}
          >
            <Feather name="plus-circle" size={16} color="#FFFFFF" />
            <Text style={[styles.actionPillText, { color: '#FFFFFF' }]}>Add Branch</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openTransferModal}
            activeOpacity={0.8}
            style={[styles.actionPill, { backgroundColor: COLORS.accentLight, borderWidth: 1, borderColor: COLORS.accent }]}
          >
            <Feather name="repeat" size={16} color={COLORS.accent} />
            <Text style={[styles.actionPillText, { color: COLORS.accent }]}>Transfer Stock</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="All Locations" />

        {branches.map((branch) => {
          const isActive = currentBranch?.id === branch.id;
          const bStats = statsByBranch[branch.id] ?? {
            todayRevenue: 0,
            todayCount: 0,
            staffCount: 0,
            stockUnits: 0,
          };

          return (
            <Card
              key={branch.id}
              style={{
                borderWidth: isActive ? 1.5 : 1,
                borderColor: isActive ? COLORS.accent : COLORS.border,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.text.primary }}>
                      {branch.name}
                    </Text>
                    {branch.is_main ? <Badge label="Main" variant="info" /> : null}
                    {isActive ? <Badge label="Active" variant="success" /> : null}
                  </View>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.text.secondary, marginTop: 3 }}>
                    {branch.address || 'No street address added'}{branch.phone ? ` · ${branch.phone}` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => openEditModal(branch)}
                  style={styles.iconBtn}
                  accessibilityLabel={`Edit ${branch.name}`}
                >
                  <Feather name="edit-2" size={15} color={COLORS.text.secondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.branchStatsGrid}>
                <View style={styles.branchStatCell}>
                  <Text style={styles.branchStatValue}>{fmtCurrency(bStats.todayRevenue)}</Text>
                  <Text style={styles.branchStatLabel}>Today Revenue</Text>
                </View>
                <View style={styles.branchStatCell}>
                  <Text style={styles.branchStatValue}>{bStats.stockUnits.toLocaleString()}</Text>
                  <Text style={styles.branchStatLabel}>Units in Stock</Text>
                </View>
                <View style={styles.branchStatCell}>
                  <Text style={styles.branchStatValue}>{bStats.staffCount}</Text>
                  <Text style={styles.branchStatLabel}>Staff Assigned</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => void handleSwitchActive(branch)}
                  disabled={isActive}
                  style={[
                    styles.switchButton,
                    isActive && styles.switchButtonActive,
                  ]}
                >
                  <Feather
                    name={isActive ? 'check-circle' : 'arrow-right-circle'}
                    size={15}
                    color={isActive ? COLORS.success : '#FFFFFF'}
                  />
                  <Text
                    style={[
                      styles.switchButtonText,
                      isActive && { color: COLORS.success },
                    ]}
                  >
                    {isActive ? 'Currently Viewing' : 'Switch to Branch'}
                  </Text>
                </TouchableOpacity>

                {!branch.is_main && (
                  <>
                    <TouchableOpacity
                      onPress={() => void handleSetMain(branch)}
                      style={styles.secondaryIconBtn}
                      accessibilityLabel="Set as main branch"
                    >
                      <Feather name="star" size={15} color={COLORS.text.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteBranch(branch)}
                      style={[styles.secondaryIconBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      accessibilityLabel="Delete branch"
                    >
                      <Feather name="trash-2" size={15} color={COLORS.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {/* Add / Edit Branch Modal */}
      <Modal
        visible={branchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingBranch ? 'Edit Branch' : 'Add New Branch'}
              </Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Feather name="x" size={20} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false}>
              <InputField
                label="Branch Name"
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Lekki Phase 1 Branch"
                required
              />
              <InputField
                label="Address"
                value={formAddress}
                onChangeText={setFormAddress}
                placeholder="Street, city or plaza details"
              />
              <InputField
                label="Branch Phone"
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder="08012345678"
                keyboardType="phone-pad"
              />
              {!editingBranch && (
                <Toggle
                  label="Set as Main Branch"
                  description="Default location for new staff and primary overview"
                  value={formIsMain}
                  onChange={setFormIsMain}
                />
              )}
              <View style={{ marginTop: 14 }}>
                <Button
                  title={editingBranch ? 'Save Branch Changes' : 'Create Branch'}
                  loading={savingBranch}
                  onPress={handleSaveBranch}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      {/* Transfer Stock Between Branches Modal */}
      <Modal
        visible={transferModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTransferModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transfer Stock Between Branches</Text>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Feather name="x" size={20} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>From Branch (Source)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {branches.map((b) => {
                  const selected = b.id === fromBranchId;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => {
                        setFromBranchId(b.id);
                        if (toBranchId === b.id) {
                          const other = branches.find((o) => o.id !== b.id);
                          if (other) setToBranchId(other.id);
                        }
                      }}
                      style={[styles.branchChip, selected && styles.branchChipActive]}
                    >
                      <Text style={[styles.branchChipText, selected && styles.branchChipTextActive]}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>To Branch (Destination)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {branches
                  .filter((b) => b.id !== fromBranchId)
                  .map((b) => {
                    const selected = b.id === toBranchId;
                    return (
                      <TouchableOpacity
                        key={b.id}
                        onPress={() => setToBranchId(b.id)}
                        style={[styles.branchChip, selected && styles.branchChipActive]}
                      >
                        <Text style={[styles.branchChipText, selected && styles.branchChipTextActive]}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Select Product</Text>
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search products..."
                placeholderTextColor={COLORS.text.muted}
                style={styles.searchInput}
              />

              <ScrollView style={{ maxHeight: 170, marginBottom: 12 }} nestedScrollEnabled>
                {filteredTransferProducts.map((p) => {
                  const available = getProductQtyInBranch(p, fromBranchId);
                  const destQty = getProductQtyInBranch(p, toBranchId);
                  const selected = p.id === selectedProductId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setSelectedProductId(p.id)}
                      style={[styles.productPickRow, selected && styles.productPickRowActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FONT.semiBold, fontSize: 13.5, color: COLORS.text.primary }}>
                          {p.name}
                        </Text>
                        <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.text.muted }}>
                          Source: {available} {p.unit} · Dest: {destQty} {p.unit}
                        </Text>
                      </View>
                      {selected ? <Feather name="check-circle" size={18} color={COLORS.accent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <InputField
                label={`Quantity to Move${selectedTransferProduct ? ` (Available: ${getProductQtyInBranch(selectedTransferProduct, fromBranchId)})` : ''}`}
                value={transferQty}
                onChangeText={setTransferQty}
                placeholder="0"
                keyboardType="numeric"
                required
              />
              <InputField
                label="Notes (Optional)"
                value={transferNotes}
                onChangeText={setTransferNotes}
                placeholder="e.g. Weekly stock dispatch"
              />

              <View style={{ marginTop: 8, marginBottom: 16 }}>
                <Button
                  title="Transfer Stock Now"
                  loading={transferring}
                  onPress={handleConfirmTransfer}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: COLORS.ink,
    gap: 10,
  },
  heroOverline: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1,
  },
  heroAmount: {
    fontFamily: FONT.black,
    fontSize: 32,
    color: COLORS.gold,
    letterSpacing: -0.8,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  heroMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricVal: {
    fontFamily: FONT.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  heroMetricLbl: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
  },
  actionPillText: {
    fontFamily: FONT.bold,
    fontSize: 13.5,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  branchStatsGrid: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 10,
    gap: 8,
  },
  branchStatCell: {
    flex: 1,
    alignItems: 'center',
  },
  branchStatValue: {
    fontFamily: FONT.bold,
    fontSize: 13.5,
    color: COLORS.text.primary,
  },
  branchStatLabel: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  switchButtonActive: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  switchButtonText: {
    fontFamily: FONT.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  secondaryIconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: FONT.bold,
    fontSize: 17,
    color: COLORS.text.primary,
  },
  fieldLabel: {
    fontFamily: FONT.semiBold,
    fontSize: 13,
    color: COLORS.text.primary,
    marginBottom: 6,
  },
  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  branchChipActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  branchChipText: {
    fontFamily: FONT.medium,
    fontSize: 12.5,
    color: COLORS.text.secondary,
  },
  branchChipTextActive: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: FONT.regular,
    fontSize: 13.5,
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  productPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  productPickRowActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
  },
});
