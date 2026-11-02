import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Modal,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';

import { useAuthStore } from '@/store/authStore';
import { Button, Card, EmptyState, SmartChip } from '@/components/ui';
import { InputField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW, SP } from '@/constants';
import { CustomerRequest, CustomerRequestStatus } from '@/types';
import {
  createCustomerRequest,
  deleteCustomerRequest,
  fetchCustomerRequests,
  formatTelUrl,
  formatWhatsAppUrl,
  toggleCustomerRequestStatus,
} from '@/lib/customerRequests';
import { dismissScreen } from '@/lib/navigation';

type FilterTab = 'pending' | 'bought' | 'all';

export default function MarketListScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();
  const businessId = currentBusiness?.id;
  const branchId = currentBranch?.id;
  const businessName = currentBusiness?.name || 'Our Store';

  const params = useLocalSearchParams<{ addItem?: string; itemName?: string }>();

  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('pending');

  // Modal State
  const [modalVisible, setModalVisible] = useState(Boolean(params.addItem === '1'));
  const [itemName, setItemName] = useState(params.itemName || '');
  const [quantityNeeded, setQuantityNeeded] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync initial param if passed
  useEffect(() => {
    if (params.addItem === '1') {
      setModalVisible(true);
      if (params.itemName) setItemName(params.itemName);
    }
  }, [params.addItem, params.itemName]);

  const loadRequests = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const data = await fetchCustomerRequests(businessId, branchId);
      setRequests(data);
    } catch (err) {
      console.warn('Failed to load market list requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, branchId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRequests();
  }, [loadRequests]);

  // Executive stats
  const stats = useMemo(() => {
    let pendingCount = 0;
    let boughtCount = 0;
    let withContactCount = 0;

    for (const r of requests) {
      if (r.status === 'pending') {
        pendingCount++;
        if (r.customer_phone) withContactCount++;
      } else if (r.status === 'bought') {
        boughtCount++;
      }
    }

    return {
      pendingCount,
      boughtCount,
      withContactCount,
    };
  }, [requests]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      // 1. Status Filter
      if (filterTab === 'pending' && r.status !== 'pending') return false;
      if (filterTab === 'bought' && r.status !== 'bought') return false;

      // 2. Search Query
      if (q) {
        const matchName = r.item_name.toLowerCase().includes(q);
        const matchCust = (r.customer_name || '').toLowerCase().includes(q);
        const matchNotes = (r.notes || '').toLowerCase().includes(q);
        const matchPhone = (r.customer_phone || '').includes(q);
        if (!matchName && !matchCust && !matchNotes && !matchPhone) return false;
      }

      return true;
    });
  }, [requests, filterTab, search]);

  const handleToggleStatus = async (item: CustomerRequest) => {
    if (!businessId) return;
    try {
      const nextStatus = await toggleCustomerRequestStatus(item, businessId, branchId);
      setRequests((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r)),
      );
      Toast.show({
        type: 'success',
        text1: nextStatus === 'bought' ? 'Marked as Bought' : 'Moved back to Needed',
        text2: nextStatus === 'bought' ? `"${item.item_name}" has been purchased.` : undefined,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update request status.');
    }
  };

  const handleDelete = (item: CustomerRequest) => {
    Alert.alert(
      'Remove Request',
      `Delete "${item.item_name}" from your Market List?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!businessId) return;
            try {
              await deleteCustomerRequest(item.id, businessId, branchId);
              setRequests((prev) => prev.filter((r) => r.id !== item.id));
              Toast.show({ type: 'success', text1: 'Item removed from list' });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not remove item.');
            }
          },
        },
      ],
    );
  };

  const handleSaveRequest = async () => {
    if (!itemName.trim()) {
      Alert.alert('Item Name Required', 'Please provide the name of the requested item.');
      return;
    }
    if (!businessId) return;

    setSaving(true);
    try {
      const created = await createCustomerRequest({
        businessId,
        branchId,
        itemName: itemName.trim(),
        quantityNeeded: quantityNeeded.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setRequests((prev) => [created, ...prev]);
      setModalVisible(false);
      setItemName('');
      setQuantityNeeded('');
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');

      Toast.show({
        type: 'success',
        text1: 'Added to Market List',
        text2: `"${created.item_name}" has been noted down.`,
      });
    } catch (err: any) {
      Alert.alert('Failed to Save', err.message || 'Could not save requested item.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenWhatsApp = (item: CustomerRequest) => {
    if (!item.customer_phone) return;
    const url = formatWhatsAppUrl(item.customer_phone, item.customer_name, item.item_name, businessName);
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open WhatsApp', 'Please ensure WhatsApp is installed on this device.');
    });
  };

  const handleCallCustomer = (item: CustomerRequest) => {
    if (!item.customer_phone) return;
    const url = formatTelUrl(item.customer_phone);
    Linking.openURL(url).catch(() => {
      Alert.alert('Call Failed', 'Unable to initiate call.');
    });
  };

  const handleAddToCatalog = (item: CustomerRequest) => {
    router.push({
      pathname: '/(app)/add-stock',
      params: { prefillName: item.item_name },
    });
  };

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="light">
      {/* ── Screen Header ────────────────────────────────────────────── */}
      <ScreenHeader
        title="Market List"
        subtitle="Customer requests & wanted stock"
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={<HeaderAction icon="plus" onPress={() => setModalVisible(true)} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SP.page, paddingBottom: insets.bottom + 48, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Top Executive Overview Card ─────────────────────────── */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.cartIconBadge}>
                <Feather name="shopping-cart" size={16} color="#000000" />
              </View>
              <View>
                <Text style={styles.overviewTitle}>MARKET PROCUREMENT</Text>
                <Text style={styles.overviewSubtitle}>Items to purchase when next visiting market</Text>
              </View>
            </View>
          </View>

          <View style={styles.overviewStatsRow}>
            {/* Needed */}
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: COLORS.accentDark }]}>{stats.pendingCount}</Text>
              <Text style={styles.statLabel}>To Buy</Text>
            </View>

            <View style={styles.statDivider} />

            {/* Follow-ups */}
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: COLORS.navy }]}>{stats.withContactCount}</Text>
              <Text style={styles.statLabel}>Follow-ups</Text>
            </View>

            <View style={styles.statDivider} />

            {/* Bought */}
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.boughtCount}</Text>
              <Text style={styles.statLabel}>Bought</Text>
            </View>
          </View>
        </View>

        {/* ── 2. Unified Search & Add Quick Bar ────────────────────────── */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Feather name="search" size={15} color={COLORS.text.muted} />
            <TextInput
              placeholder="Search market list..."
              placeholderTextColor={COLORS.text.muted}
              underlineColorAndroid="transparent"
              selectionColor={COLORS.accent}
              cursorColor={COLORS.accent}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={COLORS.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
            style={styles.quickAddButton}
          >
            <Feather name="plus" size={15} color="#000000" />
            <Text style={styles.quickAddButtonText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Segmented Filter Pills ───────────────────────────────── */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            onPress={() => setFilterTab('pending')}
            activeOpacity={0.8}
            style={[styles.segmentPill, filterTab === 'pending' && styles.segmentPillActive]}
          >
            <Text style={[styles.segmentPillText, filterTab === 'pending' && styles.segmentPillTextActive]}>
              Needed ({stats.pendingCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterTab('bought')}
            activeOpacity={0.8}
            style={[styles.segmentPill, filterTab === 'bought' && styles.segmentPillActive]}
          >
            <Text style={[styles.segmentPillText, filterTab === 'bought' && styles.segmentPillTextActive]}>
              Bought ({stats.boughtCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterTab('all')}
            activeOpacity={0.8}
            style={[styles.segmentPill, filterTab === 'all' && styles.segmentPillActive]}
          >
            <Text style={[styles.segmentPillText, filterTab === 'all' && styles.segmentPillTextActive]}>
              All ({requests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. Requests List ────────────────────────────────────────── */}
        {filteredRequests.length === 0 ? (
          <Card style={{ paddingVertical: 40, alignItems: 'center' }}>
            <EmptyState
              icon="shopping-bag"
              title={
                search
                  ? 'No matching requests'
                  : filterTab === 'pending'
                  ? 'No pending items to buy'
                  : filterTab === 'bought'
                  ? 'No purchased items yet'
                  : 'Market list is empty'
              }
              description={
                search
                  ? 'Try searching with another keyword or customer name.'
                  : 'When customers ask for goods or sizes you do not sell, note them down here to buy at the market.'
              }
              action={{
                label: '+ Note Down Item',
                onPress: () => {
                  setItemName(search.trim());
                  setModalVisible(true);
                },
              }}
            />
          </Card>
        ) : (
          filteredRequests.map((item) => {
            const isBought = item.status === 'bought';

            return (
              <View key={item.id} style={[styles.card, isBought && styles.cardBought]}>
                <View style={styles.cardMainRow}>
                  {/* Toggle Checkbox Button */}
                  <TouchableOpacity
                    onPress={() => handleToggleStatus(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.checkButton}
                  >
                    <Feather
                      name={isBought ? 'check-circle' : 'circle'}
                      size={22}
                      color={isBought ? COLORS.success : COLORS.text.muted}
                    />
                  </TouchableOpacity>

                  {/* Item Content */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <Text style={[styles.itemName, isBought && styles.itemNameBought]} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleDelete(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="trash-2" size={14} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    </View>

                    {/* Metadata Badges */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      {item.quantity_needed ? (
                        <View style={styles.tagBadge}>
                          <Feather name="layers" size={10} color={COLORS.navy} />
                          <Text style={styles.tagBadgeText}>{item.quantity_needed}</Text>
                        </View>
                      ) : null}

                      <View style={styles.dateBadge}>
                        <Feather name="clock" size={10} color={COLORS.text.muted} />
                        <Text style={styles.dateBadgeText}>
                          {format(new Date(item.created_at), 'MMM d, h:mm a')}
                        </Text>
                      </View>

                      {isBought ? (
                        <View style={styles.boughtBadge}>
                          <Text style={styles.boughtBadgeText}>PURCHASED</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Notes */}
                    {item.notes ? (
                      <View style={styles.notesBox}>
                        <Text style={styles.notesText} numberOfLines={2}>
                          "{item.notes}"
                        </Text>
                      </View>
                    ) : null}

                    {/* Customer Info & Follow-up Section */}
                    {item.customer_name || item.customer_phone ? (
                      <View style={styles.customerBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                          <Feather name="user" size={11} color={COLORS.navy} />
                          <Text style={styles.customerNameText} numberOfLines={1}>
                            Customer: {item.customer_name || 'Walk-in'}
                            {item.customer_phone ? ` (${item.customer_phone})` : ''}
                          </Text>
                        </View>

                        {/* Customer Direct Contact Shortcuts */}
                        {item.customer_phone ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => handleOpenWhatsApp(item)}
                              activeOpacity={0.8}
                              style={styles.contactPillWhatsApp}
                            >
                              <Feather name="message-circle" size={11} color="#059669" />
                              <Text style={styles.contactPillWhatsAppText}>WhatsApp</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleCallCustomer(item)}
                              activeOpacity={0.8}
                              style={styles.contactPillCall}
                            >
                              <Feather name="phone" size={11} color={COLORS.navy} />
                              <Text style={styles.contactPillCallText}>Call</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Action when bought: Add to catalog */}
                    {isBought ? (
                      <TouchableOpacity
                        onPress={() => handleAddToCatalog(item)}
                        activeOpacity={0.8}
                        style={styles.catalogButton}
                      >
                        <Feather name="plus-circle" size={13} color={COLORS.navy} />
                        <Text style={styles.catalogButtonText}>Add to Store Inventory</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Add Request Modal ────────────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Backdrop dismiss touch target */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />

          {/* Modal Card (plain View so scroll gestures are never intercepted) */}
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle}>Add to Market List</Text>
                <Text style={styles.modalSubtitle}>Note down item requested by a customer</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={17} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              bounces={false}
            >
              <InputField
                label="Item Name"
                placeholder="e.g. Peak Milk 400g Tin, Size 43 Shoe"
                value={itemName}
                onChangeText={setItemName}
                required
              />

              <InputField
                label="Quantity / Size (Optional)"
                placeholder="e.g. 2 packs, 1 roll, 5 cartons"
                value={quantityNeeded}
                onChangeText={setQuantityNeeded}
              />

              <InputField
                label="Customer Name (Optional)"
                placeholder="e.g. Mama Chinedu, Brother John"
                value={customerName}
                onChangeText={setCustomerName}
              />

              <InputField
                label="Customer Phone (Optional)"
                placeholder="e.g. 08012345678"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
              />

              <InputField
                label="Notes / Brand Preference (Optional)"
                placeholder="e.g. Blue color only, prefers Dutch brand"
                value={notes}
                onChangeText={setNotes}
              />

              <View style={{ marginTop: 8, gap: 10, paddingBottom: 6 }}>
                <Button
                  title={saving ? 'Saving...' : 'Save to Market List'}
                  variant="accent"
                  size="md"
                  loading={saving}
                  onPress={handleSaveRequest}
                />

                <Button
                  title="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setModalVisible(false)}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    gap: 14,
    ...SHADOW.sm,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartIconBadge: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewTitle: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.8,
  },
  overviewSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  overviewStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 18,
    fontFamily: FONT.bold,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: COLORS.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 13.5,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  quickAddButton: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
  },
  quickAddButtonText: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: '#002744',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    gap: 4,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  segmentPillActive: {
    backgroundColor: COLORS.navy,
    ...SHADOW.sm,
  },
  segmentPillText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  segmentPillTextActive: {
    fontFamily: FONT.bold,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  cardBought: {
    backgroundColor: '#F9FAFB',
    borderColor: 'rgba(5, 150, 105, 0.2)',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkButton: {
    marginTop: 2,
  },
  itemName: {
    fontSize: 14.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    lineHeight: 20,
    flex: 1,
  },
  itemNameBought: {
    color: COLORS.text.secondary,
    textDecorationLine: 'line-through',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 78, 137, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: RADIUS.xs,
  },
  tagBadgeText: {
    fontSize: 11,
    fontFamily: FONT.semiBold,
    color: COLORS.navy,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 4,
  },
  dateBadgeText: {
    fontSize: 10.5,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  boughtBadge: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  boughtBadgeText: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: RADIUS.xs,
    marginTop: 2,
  },
  notesText: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    fontStyle: 'italic',
  },
  customerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 78, 137, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    marginTop: 4,
    gap: 8,
  },
  customerNameText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.navy,
  },
  contactPillWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(5, 150, 105, 0.3)',
  },
  contactPillWhatsAppText: {
    fontSize: 10.5,
    fontFamily: FONT.semiBold,
    color: '#059669',
  },
  contactPillCall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(0, 78, 137, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: RADIUS.xs,
  },
  contactPillCallText: {
    fontSize: 10.5,
    fontFamily: FONT.semiBold,
    color: COLORS.navy,
  },
  catalogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 78, 137, 0.06)',
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 78, 137, 0.2)',
  },
  catalogButtonText: {
    fontSize: 12,
    fontFamily: FONT.semiBold,
    color: COLORS.navy,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: SP.lg,
    paddingVertical: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    ...SHADOW.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollView: {
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingTop: 6,
    paddingBottom: 16,
    gap: 12,
  },
});
