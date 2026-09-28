import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { LoadingScreen, Button } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { BusinessMember, UserProfile } from '@/types';
import {
  fetchTeamStaffStats,
  StaffMemberStats,
  StaffStatsPeriod,
  TeamOverviewStats,
  createEmptyStaffStats,
} from '@/lib/teamStats';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TeamMember = BusinessMember & { user_profiles: UserProfile };

const ROLE_COLORS: Record<string, string> = {
  owner: COLORS.accent,
  manager: COLORS.info,
  cashier: COLORS.success,
  auditor: COLORS.warning,
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  auditor: 'Auditor',
};

const PERIODS: { key: StaffStatsPeriod; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'month', label: 'This Month' },
  { key: 'today', label: 'Today' },
];

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

function formatLastActive(dateStr?: string) {
  if (!dateStr) return 'No recorded activity yet';
  try {
    const d = new Date(dateStr);
    return `Last active ${format(d, 'MMM d, h:mm a')}`;
  } catch {
    return 'Recent activity';
  }
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const currentUserRole = useAuthStore((s) => s.userRole);
  const { fetchTeamMembers } = useBusinessStore();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [period, setPeriod] = useState<StaffStatsPeriod>('all');
  const [memberStats, setMemberStats] = useState<Record<string, StaffMemberStats>>({});
  const [overview, setOverview] = useState<TeamOverviewStats | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showInviteId, setShowInviteId] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(
    async (selectedPeriod: StaffStatsPeriod = period) => {
      if (!currentBusiness) return;
      try {
        const [membersData, statsResult] = await Promise.all([
          fetchTeamMembers(currentBusiness.id),
          fetchTeamStaffStats(currentBusiness.id, selectedPeriod, currentBranch?.id),
        ]);

        membersData.sort((a, b) => (a.role === 'owner' ? -1 : 1));
        setMembers(membersData);
        setMemberStats(statsResult.memberStats);
        setOverview(statsResult.overview);
      } catch (err) {
        console.error('[team] Error loading team data:', err);
      } finally {
        setLoading(false);
      }
    },
    [currentBusiness, currentBranch?.id, fetchTeamMembers, period],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePeriodChange = async (newPeriod: StaffStatsPeriod) => {
    setPeriod(newPeriod);
    if (!currentBusiness) return;
    try {
      const statsResult = await fetchTeamStaffStats(
        currentBusiness.id,
        newPeriod,
        currentBranch?.id,
      );
      setMemberStats(statsResult.memberStats);
      setOverview(statsResult.overview);
    } catch (err) {
      console.warn('[team] Error changing stats period:', err);
    }
  };

  const toggleExpand = (memberId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const handleManageMember = (member: TeamMember) => {
    if (currentUserRole !== 'owner' && currentUserRole !== 'manager') return;
    if (member.role === 'owner') return;

    router.push({
      pathname: '/(app)/team/[id]',
      params: {
        id: member.id,
        userId: member.user_id,
        name: member.user_profiles?.full_name || 'Unnamed Staff',
        email: member.user_profiles?.email || '',
        phone: member.user_profiles?.phone || '',
        role: member.role,
      },
    });
  };

  const handleCopyBusinessId = async () => {
    if (currentBusiness?.id) {
      await Clipboard.setStringAsync(currentBusiness.id);
      Alert.alert('Copied', 'Business ID copied to clipboard');
    }
  };

  if (loading && members.length === 0) {
    return <LoadingScreen message="Loading team directory..." />;
  }

  const topSellerMember = overview?.topSellerUserId
    ? members.find((m) => m.user_id === overview.topSellerUserId)
    : null;

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
      <ScreenHeader
        title="Team & Staff"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, paddingBottom: insets.bottom + 32, gap: 18 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />
        }
      >
        {/* ── Compact Staff Invitation ID Bar ─────────────────────────────── */}
        <View style={styles.inviteContainer}>
          <TouchableOpacity
            style={styles.inviteHeader}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowInviteId(!showInviteId);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="shield" size={15} color={COLORS.ink} />
              <Text style={styles.inviteTitle}>Staff Invitation ID</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.inviteToggleText}>
                {showInviteId ? 'Hide' : 'Show ID'}
              </Text>
              <Feather name={showInviteId ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.text.muted} />
            </View>
          </TouchableOpacity>

          {showInviteId && (
            <View style={styles.inviteExpanded}>
              <View style={styles.inviteRow}>
                <Text style={styles.inviteValue} numberOfLines={1} ellipsizeMode="middle">
                  {currentBusiness?.id}
                </Text>
                <TouchableOpacity onPress={handleCopyBusinessId} style={styles.copyButton}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                  <Feather name="copy" size={13} color={COLORS.ink} />
                </TouchableOpacity>
              </View>
              <Text style={styles.inviteHint}>
                Give this ID to staff members so they can connect to your business workspace.
              </Text>
            </View>
          )}
        </View>

        {/* ── Period Filter Pills ─────────────────────────────────────────── */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => handlePeriodChange(p.key)}
                activeOpacity={0.7}
                style={[styles.periodPill, active && styles.periodPillActive]}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Team Performance Overview Card ─────────────────────────────── */}
        {overview && (
          <View style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="trending-up" size={16} color={COLORS.ink} />
                <Text style={styles.overviewTitle}>Team Overview</Text>
              </View>
              {topSellerMember && overview.topSellerWorth > 0 && (
                <View style={styles.topSellerBadge}>
                  <Feather name="award" size={12} color="#b45309" />
                  <Text style={styles.topSellerBadgeText} numberOfLines={1}>
                    Top: {topSellerMember.user_profiles?.full_name || 'Staff'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.overviewStatsGrid}>
              <View style={styles.overviewStatCol}>
                <Text style={styles.overviewStatLabel}>GOODS SOLD</Text>
                <Text style={styles.overviewStatValue}>
                  {formatCurrency(overview.totalSalesWorth)}
                </Text>
                <Text style={styles.overviewStatSub}>
                  {overview.totalSalesCount} {overview.totalSalesCount === 1 ? 'sale' : 'sales'}
                </Text>
              </View>

              <View style={styles.overviewDivider} />

              <View style={styles.overviewStatCol}>
                <Text style={styles.overviewStatLabel}>GOODS RESTOCKED</Text>
                <Text style={styles.overviewStatValue}>
                  {formatCurrency(overview.totalPurchasesWorth)}
                </Text>
                <Text style={styles.overviewStatSub}>
                  {overview.totalPurchasesCount} {overview.totalPurchasesCount === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Section Title ──────────────────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Staff Members ({members.length})
          </Text>
          <Text style={styles.sectionSubtitle}>
            {period === 'today' ? 'Today’s Stats' : period === 'month' ? 'This Month’s Stats' : 'All-Time Stats'}
          </Text>
        </View>

        {/* ── Member List with Rich Activity & Worth Stats ─────────────────── */}
        <View style={{ gap: 14 }}>
          {members.map((member) => {
            const profile = member.user_profiles || {};
            const initials = (profile.full_name || 'U').charAt(0).toUpperCase();
            const stats = memberStats[member.user_id] || createEmptyStaffStats(member.user_id);
            const isTopSeller =
              overview?.topSellerUserId === member.user_id && stats.salesWorth > 0;
            const isExpanded = expandedIds.has(member.id);
            const canManage =
              (currentUserRole === 'owner' || currentUserRole === 'manager') &&
              member.role !== 'owner';

            return (
              <View key={member.id} style={styles.memberCard}>
                {/* Member Header / Top Row */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => toggleExpand(member.id)}
                  style={styles.cardHeaderPressable}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.memberInfo}>
                    <View style={styles.nameRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 6 }}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {profile.full_name || 'Unnamed Staff'}
                        </Text>
                        {isTopSeller && (
                          <View style={styles.topSellerTag}>
                            <Feather name="award" size={10} color="#b45309" />
                            <Text style={styles.topSellerTagText}>Top</Text>
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          styles.roleBadge,
                          { backgroundColor: ROLE_COLORS[member.role] + '15' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleText,
                            { color: ROLE_COLORS[member.role] },
                          ]}
                        >
                          {ROLE_LABELS[member.role] || member.role}
                        </Text>
                      </View>
                    </View>

                    {profile.phone ? (
                      <View style={styles.contactItem}>
                        <Feather name="phone" size={11} color={COLORS.text.muted} />
                        <Text style={styles.contactText}>{profile.phone}</Text>
                      </View>
                    ) : null}

                    {profile.email ? (
                      <View style={styles.contactItem}>
                        <Feather name="mail" size={11} color={COLORS.text.muted} />
                        <Text style={styles.contactText} numberOfLines={1}>
                          {profile.email}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={COLORS.text.muted}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>

                {/* ── Primary Activity Statistics Row ────────────────────── */}
                <View style={styles.statsRow}>
                  {/* Goods Sold */}
                  <View style={styles.statChip}>
                    <View style={styles.statChipHeader}>
                      <Feather name="shopping-bag" size={12} color={COLORS.ink} />
                      <Text style={styles.statChipTitle}>Goods Sold</Text>
                    </View>
                    <Text style={styles.statChipAmount} numberOfLines={1}>
                      {formatCurrency(stats.salesWorth)}
                    </Text>
                    <Text style={styles.statChipSub}>
                      {stats.salesCount} {stats.salesCount === 1 ? 'sale' : 'sales'}
                    </Text>
                  </View>

                  {/* Stock Restocked */}
                  <View style={styles.statChip}>
                    <View style={styles.statChipHeader}>
                      <Feather name="package" size={12} color={COLORS.text.secondary} />
                      <Text style={styles.statChipTitle}>Restocked</Text>
                    </View>
                    <Text style={styles.statChipAmount} numberOfLines={1}>
                      {formatCurrency(stats.purchasesWorth)}
                    </Text>
                    <Text style={styles.statChipSub}>
                      {stats.purchasesCount} {stats.purchasesCount === 1 ? 'restock' : 'restocks'}
                    </Text>
                  </View>

                  {/* Cash Collected */}
                  <View style={styles.statChip}>
                    <View style={styles.statChipHeader}>
                      <Feather name="check-circle" size={12} color={COLORS.success} />
                      <Text style={styles.statChipTitle}>Collected</Text>
                    </View>
                    <Text style={[styles.statChipAmount, { color: COLORS.success }]} numberOfLines={1}>
                      {formatCurrency(stats.paidAmount)}
                    </Text>
                    <Text style={styles.statChipSub} numberOfLines={1}>
                      {stats.owedAmount > 0
                        ? `Owed ${formatCurrency(stats.owedAmount)}`
                        : 'Cleared'}
                    </Text>
                  </View>
                </View>

                {/* ── Expanded Secondary Stats & Details ─────────────────── */}
                {isExpanded && (
                  <View style={styles.expandedDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Average Sale Size:</Text>
                      <Text style={styles.detailValue}>
                        {stats.salesCount > 0
                          ? formatCurrency(stats.salesWorth / stats.salesCount)
                          : '₦0'}
                      </Text>
                    </View>

                    {stats.owedAmount > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Unsettled Credit Given:</Text>
                        <Text style={[styles.detailValue, { color: COLORS.danger }]}>
                          {formatCurrency(stats.owedAmount)}
                        </Text>
                      </View>
                    )}

                    {stats.expensesAmount > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Expenses Logged:</Text>
                        <Text style={styles.detailValue}>
                          {formatCurrency(stats.expensesAmount)} ({stats.expensesCount} logged)
                        </Text>
                      </View>
                    )}

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Recent Activity:</Text>
                      <Text style={styles.detailSubValue}>
                        {formatLastActive(stats.lastActiveAt)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Member Since:</Text>
                      <Text style={styles.detailSubValue}>
                        {new Date(member.joined_at || member.invited_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>

                    {canManage && (
                      <View style={{ marginTop: 12 }}>
                        <Button
                          title="Manage Staff & Role"
                          variant="secondary"
                          size="sm"
                          icon="settings"
                          onPress={() => handleManageMember(member)}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  inviteContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inviteTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: 0.3,
  },
  inviteToggleText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  inviteExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    gap: 8,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  inviteValue: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  copyButtonText: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
  inviteHint: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    lineHeight: 16,
  },

  // ── Period Pills ──────────────────────────────────────────
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodPillActive: {
    borderColor: COLORS.ink,
    backgroundColor: COLORS.ink,
  },
  periodText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  periodTextActive: {
    color: COLORS.text.inverse,
    fontFamily: FONT.bold,
  },

  // ── Overview Card ─────────────────────────────────────────
  overviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewTitle: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  topSellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    maxWidth: 160,
  },
  topSellerBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: '#b45309',
  },
  overviewStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overviewStatCol: {
    flex: 1,
    gap: 3,
  },
  overviewDivider: {
    width: 1,
    height: '80%',
    backgroundColor: COLORS.border,
    marginHorizontal: 14,
  },
  overviewStatLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.8,
  },
  overviewStatValue: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  overviewStatSub: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },

  // ── Member Section ────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },

  // ── Member Card ───────────────────────────────────────────
  memberCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    padding: 16,
    gap: 14,
  },
  cardHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
  memberInfo: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  memberName: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  topSellerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
  },
  topSellerTagText: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: '#b45309',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  roleText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    textTransform: 'uppercase',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },

  // ── Stats Row ─────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  statChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  statChipTitle: {
    fontSize: 10,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  statChipAmount: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  statChipSub: {
    fontSize: 10,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },

  // ── Expanded Details ──────────────────────────────────────
  expandedDetails: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  detailSubValue: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
});
