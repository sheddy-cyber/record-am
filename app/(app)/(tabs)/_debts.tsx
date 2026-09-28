import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { differenceInDays, format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { useDebtStore } from '@/store/debtStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { shareDebtReminderViaWhatsApp } from '@/lib/reports';
import { Button, EmptyState } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { CustomerDebt } from '@/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;



function getDueInfo(dueDate?: string) {
  if (!dueDate) return null;
  try {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = differenceInDays(due, now);

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return {
        isOverdue: true,
        days: absDays,
        label: `Overdue by ${absDays} ${absDays === 1 ? 'day' : 'days'}`,
        formatted: format(due, 'MMM d, yyyy'),
      };
    }
    if (diffDays === 0) {
      return {
        isDueToday: true,
        days: 0,
        label: 'Due today',
        formatted: format(due, 'MMM d, yyyy'),
      };
    }
    if (diffDays <= 7) {
      return {
        isDueSoon: true,
        days: diffDays,
        label: `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
        formatted: format(due, 'MMM d, yyyy'),
      };
    }
    return {
      isNormal: true,
      days: diffDays,
      label: `Due ${format(due, 'MMM d, yyyy')}`,
      formatted: format(due, 'MMM d, yyyy'),
    };
  } catch {
    return null;
  }
}

function getDebtAge(debt: CustomerDebt) {
  try {
    const days = differenceInDays(new Date(), new Date(debt.created_at));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  } catch {
    return 'Recently';
  }
}

function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const customers = useCustomerStore((s) => s.customers);
  const debts = useDebtStore((s) => s.debts);
  const fetchDebts = useDebtStore((s) => s.fetchDebts);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadDebts = useCallback(async () => {
    if (businessId && branchId) {
      await fetchDebts(businessId, branchId);
    }
  }, [businessId, branchId, fetchDebts]);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useFocusEffect(
    useCallback(() => {
      loadDebts();
    }, [loadDebts]),
  );

  useRealtimeRefresh({
    channelName: `debts-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
    ],
    onRefresh: loadDebts,
  });

  // ── Portfolio Metrics ───────────────────────────────────────────────────
  const totalOutstanding = useMemo(() => {
    let outstanding = 0;
    for (const d of debts) {
      outstanding += Number(d.balance || 0);
    }
    return outstanding;
  }, [debts]);

  // ── Filtered and Sorted Debts ───────────────────────────────────────────
  const displayedDebts = useMemo(() => {
    let result = debts;

    // Filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((d) => {
        const nameMatch = (d.customer_name || '').toLowerCase().includes(q);
        const phoneMatch = (d.customer_phone || '').includes(q);
        const notesMatch = (d.notes || '').toLowerCase().includes(q);
        return nameMatch || phoneMatch || notesMatch;
      });
    }

    return [...result].sort(
      (a, b) => Number(b.balance || 0) - Number(a.balance || 0),
    );
  }, [debts, searchQuery]);

  return (
    <SwipeableTabScreen name="debts">
      <ScreenShell backgroundColor={COLORS.background} statusBarStyle="light">
        <ScreenHeader
          title="Debts"
          theme="dark"
          right={
            <HeaderAction
              icon="plus"
              label="Record Debt"
              onPress={() => router.push('/(app)/record-debt')}
            />
          }
        />

        <FlashList
          data={displayedDebts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SP.page,
            paddingBottom: insets.bottom + 96,
            flexGrow: 1,
            gap: 20,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadDebts();
                setRefreshing(false);
              }}
              tintColor={COLORS.accent}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 14, paddingTop: SP.page, marginBottom: 4 }}>
              {/* ── Search Bar (always visible at top) ──────────────────────── */}
              <View style={styles.searchBar}>
                <Feather name="search" size={15} color={COLORS.text.muted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search customer, phone, or notes..."
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.searchInput}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x-circle" size={15} color={COLORS.text.muted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Simple Outstanding Card ──────────────────────────────────── */}
              {debts.length > 0 && (
                <View style={styles.portfolioCard}>
                  <Text style={styles.heroAmountLabel}>TOTAL OUTSTANDING</Text>
                  <Text style={styles.heroAmountValue}>
                    {formatCurrency(totalOutstanding)}
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            debts.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Zero Outstanding Debts"
                description="All customer debts are currently settled. When you sell goods on credit, they will appear here."
                action={{
                  label: 'Record New Debt',
                  onPress: () => router.push('/(app)/record-debt'),
                }}
              />
            ) : (
              <View style={styles.emptyFilterContainer}>
                <Feather name="search" size={32} color={COLORS.text.muted} />
                <Text style={styles.emptyFilterTitle}>No Matching Debts</Text>
                <Text style={styles.emptyFilterSubtitle}>
                  No customer debts match your current search.
                </Text>
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearFilterButton}
                >
                  <Text style={styles.clearFilterButtonText}>Reset Filters</Text>
                </TouchableOpacity>
              </View>
            )
          }
          renderItem={({ item }) => {
            const customer = customers.find((c) => c.id === item.customer_id);
            const resolvedPhone = customer?.phone || item.customer_phone;
            const dueInfo = getDueInfo(item.due_date);
            const isOverdue = dueInfo?.isOverdue ?? false;
            const isPartial = item.status === 'partial' || Number(item.amount_paid || 0) > 0;
            const initials = (item.customer_name || 'C').charAt(0).toUpperCase();

            const paidRatio =
              item.original_amount > 0
                ? Math.min(100, Math.round((item.amount_paid / item.original_amount) * 100))
                : 0;

            return (
              <View style={styles.debtCard}>
                {/* ── Card Header ─────────────────────────────────────────── */}
                <View style={styles.cardHeader}>
                  <View style={styles.customerAvatar}>
                    <Text style={styles.customerAvatarText}>{initials}</Text>
                  </View>

                  <View style={styles.customerInfoCol}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {item.customer_name}
                    </Text>
                    <View style={styles.customerMetaRow}>
                      {resolvedPhone ? (
                        <View style={styles.phoneTag}>
                          <Feather name="phone" size={10} color={COLORS.text.secondary} />
                          <Text style={styles.phoneText}>{resolvedPhone}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.ageText}>Recorded {getDebtAge(item)}</Text>
                    </View>
                  </View>

                  {/* Status Badge */}
                  <View>
                    {isOverdue ? (
                      <View style={styles.overdueBadge}>
                        <Feather name="alert-circle" size={11} color="#b91c1c" />
                        <Text style={styles.overdueBadgeText}>{dueInfo?.label}</Text>
                      </View>
                    ) : isPartial ? (
                      <View style={styles.partialBadge}>
                        <Text style={styles.partialBadgeText}>Paying</Text>
                      </View>
                    ) : (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Outstanding</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* ── Financial Balance Block ─────────────────────────────── */}
                <View style={styles.balanceContainer}>
                  <View style={styles.balanceRow}>
                    <View>
                      <Text style={styles.balanceLabel}>REMAINING BALANCE</Text>
                      <Text style={styles.balanceValue}>
                        {formatCurrency(item.balance)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.originalLabel}>
                        Original: {formatCurrency(item.original_amount)}
                      </Text>
                      <Text style={styles.paidLabel}>
                        Paid: {formatCurrency(item.amount_paid)}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Line */}
                  <View style={styles.cardProgressTrack}>
                    <View
                      style={[
                        styles.cardProgressFill,
                        {
                          width: `${Math.max(paidRatio > 0 ? 3 : 0, paidRatio)}%`,
                          backgroundColor: isOverdue ? COLORS.danger : COLORS.success,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* ── Due Date & Notes Meta ───────────────────────────────── */}
                <View style={styles.metaRow}>
                  {dueInfo ? (
                    <View style={styles.dueTag}>
                      <Feather
                        name="calendar"
                        size={12}
                        color={isOverdue ? COLORS.danger : COLORS.text.secondary}
                      />
                      <Text
                        style={[
                          styles.dueTagText,
                          isOverdue && { color: COLORS.danger, fontFamily: FONT.bold },
                        ]}
                      >
                        {dueInfo.formatted}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.dueTag}>
                      <Feather name="clock" size={12} color={COLORS.text.muted} />
                      <Text style={styles.dueTagText}>No fixed due date</Text>
                    </View>
                  )}

                  {item.notes ? (
                    <View style={styles.notesTag}>
                      <Feather name="file-text" size={11} color={COLORS.text.muted} />
                      <Text style={styles.notesText} numberOfLines={1}>
                        {item.notes}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* ── Action Buttons ──────────────────────────────────────── */}
                <View style={styles.actionsRow}>
                  <Button
                    title="Record Payment"
                    icon="check-circle"
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/record-payment',
                        params: { debtId: item.id },
                      })
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Send Reminder"
                    icon="message-circle"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      if (!resolvedPhone) {
                        Alert.alert(
                          'No phone number',
                          'Please edit this customer and add a phone number to send a WhatsApp reminder.',
                        );
                        return;
                      }
                      shareDebtReminderViaWhatsApp(
                        item.customer_name,
                        resolvedPhone,
                        item.balance,
                        businessName ?? '',
                        item.due_date,
                      );
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          }}
        />
      </ScreenShell>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  // ── Simple Outstanding Card ──────────────────────────────────
  portfolioCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portfolioIconBox: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioTitle: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: 0.3,
  },
  recoveryRateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#C2DBCA',
  },
  recoveryRateText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: '#285434',
  },
  heroAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heroAmountLabel: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.8,
  },
  heroAmountValue: {
    fontSize: 26,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 2,
  },
  heroSubLabel: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  heroSubValue: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  // ── Progress Capsule ──────────────────────────────────────
  progressContainer: {
    gap: 6,
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.full,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressSubText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },

  // ── 3-Column Portfolio Metrics ─────────────────────────────
  portfolioBreakdownGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  portfolioBreakdownCol: {
    flex: 1,
    gap: 2,
  },
  portfolioColDivider: {
    width: 1,
    height: '75%',
    backgroundColor: COLORS.border,
    marginHorizontal: 10,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  breakdownLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 1,
  },
  breakdownCount: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },

  // ── Search & Filter Bar ───────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    padding: 0,
  },
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  filterPillsContainer: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterPillActive: {
    borderColor: COLORS.ink,
    backgroundColor: COLORS.ink,
  },
  filterPillDangerAlert: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2',
  },
  filterPillText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  filterPillTextActive: {
    color: COLORS.text.inverse,
    fontFamily: FONT.bold,
  },
  filterCountBadge: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.secondary,
  },
  filterCountTextActive: {
    color: COLORS.text.inverse,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortButtonText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.ink,
  },

  // ── Debt Card ─────────────────────────────────────────────
  debtCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
  customerInfoCol: {
    flex: 1,
    gap: 3,
  },
  customerName: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  customerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  phoneText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  ageText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },

  // ── Badges ────────────────────────────────────────────────
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  overdueBadgeText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: '#b91c1c',
  },
  partialBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  partialBadgeText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: '#b45309',
  },
  activeBadge: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  activeBadgeText: {
    fontSize: 10,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },

  // ── Balance Box ───────────────────────────────────────────
  balanceContainer: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.6,
  },
  balanceValue: {
    fontSize: 19,
    fontFamily: FONT.bold,
    color: COLORS.danger,
    marginTop: 2,
  },
  originalLabel: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  paidLabel: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.success,
    marginTop: 1,
  },
  cardProgressTrack: {
    height: 5,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  cardProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ── Meta Details ──────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueTagText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  notesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  notesText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },

  // ── Actions ───────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },

  // ── Filter Empty State ────────────────────────────────────
  emptyFilterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyFilterTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 8,
  },
  emptyFilterSubtitle: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  clearFilterButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
  },
  clearFilterButtonText: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
});

export default React.memo(DebtsScreen);
