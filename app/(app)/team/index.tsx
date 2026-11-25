import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  Alert,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Icon } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Avatar, Button, LoadingScreen, PermissionDenied, SegmentedControl } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW, SP } from '@/constants';
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
  owner: COLORS.accentDark,
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
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'today', label: 'Today' },
];

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

function formatLastActive(dateStr?: string) {
  if (!dateStr) return 'No activity yet';
  try {
    const d = new Date(dateStr);
    return `Active ${format(d, 'd MMM, h:mm a')}`;
  } catch {
    return 'Recent activity';
  }
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const currentUserRole = useAuthStore((s) => s.userRole);
  const canManageTeam = hasPermission(currentUserRole, 'business-settings.manage');
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
        staffId: member.staff_id || '',
        branchId: member.branch_id || '',
        branchName: (member as any).branches?.name || '',
      },
    });
  };

  const handleCopyBusinessId = async () => {
    if (currentBusiness?.id) {
      await Clipboard.setStringAsync(currentBusiness.id);
      Toast.show({ type: 'success', text1: 'Business ID copied' });
    }
  };

  if (!canManageTeam) {
    return (
      <ScreenShell backgroundColor={COLORS.background}>
        <ScreenHeader
          title="Team"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Team management is restricted"
          description="Only owners and managers can invite staff or change roles."
        />
      </ScreenShell>
    );
  }

  if (loading && members.length === 0) {
    return <LoadingScreen />;
  }

  const topSellerMember = overview?.topSellerUserId
    ? members.find((m) => m.user_id === overview.topSellerUserId)
    : null;

  const shareBusinessId = async () => {
    if (!currentBusiness?.id) return;
    try {
      await Share.share({
        message: `Join ${currentBusiness.name} on Record Am. Open the app, choose "Join a team" and paste this Business ID:\n\n${currentBusiness.id}`,
      });
    } catch {}
  };

  return (
    <ScreenShell>
      <ScreenHeader
        title="Team"
        large
        subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.text.muted} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Invite ──────────────────────────────────────────────── */}
        <View style={styles.invite}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.inviteIcon}>
              <Icon name="users" size={18} color={COLORS.text.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Add someone to your team</Text>
              <Text style={styles.inviteText}>They sign up, choose “Join a team” and paste your Business ID.</Text>
            </View>
          </View>
          <Text style={styles.inviteId} numberOfLines={1} ellipsizeMode="middle" selectable>
            {currentBusiness?.id}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Copy ID" icon="copy" variant="tinted" size="sm" style={{ flex: 1 }} onPress={handleCopyBusinessId} />
            <Button title="Share" icon="share" size="sm" style={{ flex: 1 }} onPress={shareBusinessId} />
          </View>
        </View>

        {/* ── Performance ─────────────────────────────────────────── */}
        <SegmentedControl
          value={period}
          onChange={(v) => handlePeriodChange(v)}
          style={{ marginTop: 24 }}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'month', label: 'This month' },
            { value: 'all', label: 'All time' },
          ]}
        />

        {overview ? (
          <View style={styles.overview}>
            <View style={{ flex: 1 }}>
              <Text style={styles.figLabel}>Sold</Text>
              <Text style={styles.figValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(overview.totalSalesWorth)}
              </Text>
              <Text style={styles.figSub}>
                {overview.totalSalesCount} {overview.totalSalesCount === 1 ? 'sale' : 'sales'}
              </Text>
            </View>
            <View style={styles.vr} />
            <View style={{ flex: 1 }}>
              <Text style={styles.figLabel}>Restocked</Text>
              <Text style={styles.figValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(overview.totalPurchasesWorth)}
              </Text>
              <Text style={styles.figSub}>
                {overview.totalPurchasesCount} {overview.totalPurchasesCount === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
          </View>
        ) : null}
        {topSellerMember && overview && overview.topSellerWorth > 0 ? (
          <Text style={styles.topLine}>
            Top seller: <Text style={{ fontFamily: FONT.semiBold, color: COLORS.text.primary }}>{topSellerMember.user_profiles?.full_name || 'Staff'}</Text>
            {` · ${formatCurrency(overview.topSellerWorth)}`}
          </Text>
        ) : null}

        {/* ── People ──────────────────────────────────────────────── */}
        <Text style={styles.section}>People</Text>
        <View style={styles.group}>
          {members.map((member, index) => {
            const profile = member.user_profiles || ({} as UserProfile);
            const stats = memberStats[member.user_id] || createEmptyStaffStats(member.user_id);
            const canManage = (currentUserRole === 'owner' || currentUserRole === 'manager') && member.role !== 'owner';
            const branchName = (member as any).branches?.name as string | undefined;
            const meta = [ROLE_LABELS[member.role] || member.role, member.staff_id, branchName].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={member.id}
                disabled={!canManage}
                onPress={() => handleManageMember(member)}
                style={({ pressed }) => [styles.row, index < members.length - 1 && styles.divider, pressed && { backgroundColor: COLORS.surface2 }]}
              >
                <Avatar name={profile.full_name || 'Staff'} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile.full_name || 'Unnamed staff'}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {meta}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {formatLastActive(stats.lastActiveAt)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amount}>{formatCurrency(stats.salesWorth)}</Text>
                  <Text style={styles.meta}>
                    {stats.salesCount} {stats.salesCount === 1 ? 'sale' : 'sales'}
                  </Text>
                </View>
                {canManage ? <Icon name="chevron-right" size={16} color={COLORS.text.faint} /> : <View style={{ width: 16 }} />}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.footnote}>
          Tap a person to change their role or branch. Figures are for {currentBranch?.name ? `the ${currentBranch.name} branch` : 'this branch'}.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  invite: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  inviteIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  inviteText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, lineHeight: 18 },
  inviteId: {
    fontSize: 13,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
  },
  overview: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 16,
    gap: 16,
  },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  figLabel: { fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.secondary },
  figValue: { fontSize: 24, fontFamily: FONT.serif, color: COLORS.text.primary, marginTop: 4, fontVariant: ['tabular-nums'] },
  figSub: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  topLine: { fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 10, paddingHorizontal: 4 },
  section: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3, marginTop: 28, marginBottom: 10 },
  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  name: { fontSize: 15.5, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.2 },
  meta: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  amount: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 10, paddingHorizontal: 4, lineHeight: 17 },
});
