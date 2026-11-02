import React, { useState, useEffect } from 'react';
import { View, Text, Alert, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button, PermissionDenied } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';
import { InputField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { UserRole } from '@/types';
import { fetchTeamStaffStats, StaffMemberStats } from '@/lib/teamStats';
import Toast from 'react-native-toast-message';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

interface RoleOption {
  role: UserRole;
  title: string;
  badge: string;
  badgeBg: string;
  icon: keyof typeof Feather.glyphMap;
  summary: string;
  permissions: { text: string; allowed: boolean }[];
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'manager',
    title: 'Manager',
    badge: 'FULL ACCESS',
    badgeBg: '#004E89',
    icon: 'shield',
    summary: 'Full day-to-day administrative authority over sales, stock, and expenses.',
    permissions: [
      { text: 'Record sales, log expenses & restock inventory', allowed: true },
      { text: 'View profit analytics, product margins & stock logs', allowed: true },
      { text: 'Delete the business or remove the business owner', allowed: false },
    ],
  },
  {
    role: 'cashier',
    title: 'Cashier',
    badge: 'FRONT DESK',
    badgeBg: '#15803D',
    icon: 'shopping-bag',
    summary: 'Focused on daily customer checkout, sales collection, and routine expenses.',
    permissions: [
      { text: 'Record sales, collect payments & issue customer receipts', allowed: true },
      { text: 'Log business expenses & view checkout volume', allowed: true },
      { text: 'View wholesale cost prices or business profit margins', allowed: false },
    ],
  },
  {
    role: 'auditor',
    title: 'Auditor',
    badge: 'READ ONLY',
    badgeBg: '#B45309',
    icon: 'eye',
    summary: 'Complete oversight and audit visibility without transactional edit rights.',
    permissions: [
      { text: 'Review historical sales, receipts, debts & expense logs', allowed: true },
      { text: 'Export financial reports & audit stock movement trail', allowed: true },
      { text: 'Create, modify, or delete any sales, records, or stock', allowed: false },
    ],
  },
];

const ROLE_THEMES: Record<string, { bg: string; text: string; label: string }> = {
  owner: { bg: '#1E293B', text: '#FFFFFF', label: 'Owner' },
  manager: { bg: '#004E89', text: '#FFFFFF', label: 'Manager' },
  cashier: { bg: '#15803D', text: '#FFFFFF', label: 'Cashier' },
  auditor: { bg: '#B45309', text: '#FFFFFF', label: 'Auditor' },
};

export default function EditTeamMemberScreen() {
  const { id, userId, name, email, phone, role: initialRole } = useLocalSearchParams<{ 
    id: string; 
    userId: string;
    name: string; 
    email: string; 
    phone: string;
    role: string;
  }>();
  
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUserRole = useAuthStore((s) => s.userRole);
  const canManageTeam = hasPermission(currentUserRole, 'business-settings.manage');
  const setUserRole = useAuthStore((s) => s.setUserRole);
  const { updateTeamMemberRole, updateTeamMemberProfile, removeTeamMember, transferOwnership } = useBusinessStore();

  const [role, setRole] = useState<UserRole>((initialRole as UserRole) || 'cashier');
  const [editedName, setEditedName] = useState(name || '');
  const [editedPhone, setEditedPhone] = useState(phone || '');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<StaffMemberStats | null>(null);

  useEffect(() => {
    if (!currentBusiness?.id || !userId) return;
    fetchTeamStaffStats(currentBusiness.id, 'all')
      .then((res) => {
        if (res.memberStats[userId]) {
          setStats(res.memberStats[userId]);
        }
      })
      .catch((err) => console.warn('[team-id] Failed to load staff stats:', err));
  }, [currentBusiness?.id, userId]);

  const initials = (editedName.trim() || name || 'Staff')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'S';

  const roleTheme = ROLE_THEMES[role] || ROLE_THEMES.cashier;
  const isSubjectOwner = initialRole === 'owner';
  const canEditMember = currentUserRole === 'owner' || (currentUserRole === 'manager' && !isSubjectOwner);

  const handleSave = async () => {
    if (!id || !userId) return;

    if (!canEditMember) {
      Alert.alert('Permission Denied', 'Managers cannot modify the business owner profile.');
      return;
    }
    
    if (!editedName.trim()) {
      Alert.alert('Required Name', 'Please provide a full name for this staff member.');
      return;
    }
    
    setSaving(true);
    try {
      await updateTeamMemberProfile(userId, editedName.trim(), editedPhone.trim());
      if (initialRole !== role) {
        await updateTeamMemberRole(id, role);
      }
      if (userId === currentUserId) {
        const curProf = useAuthStore.getState().profile;
        if (curProf) {
          useAuthStore.getState().setProfile({
            ...curProf,
            full_name: editedName.trim(),
            phone: editedPhone.trim(),
          });
        }
      }
      Toast.show({ type: 'success', text1: 'Staff profile updated successfully' });
      dismissScreen();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update staff member.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Staff Member',
      `Are you sure you want to remove ${editedName || name || 'this staff member'} from ${currentBusiness?.name || 'this business'}? They will immediately lose access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Member',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setSaving(true);
            try {
              await removeTeamMember(id);
              Toast.show({ type: 'success', text1: 'Staff removed successfully' });
              dismissScreen();
            } catch (err: any) {
              Alert.alert('Removal Failed', err.message || 'Could not remove member.');
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleTransferOwnership = () => {
    if (!currentBusiness?.id || !userId) return;

    Alert.alert(
      'Transfer Business Ownership',
      `Are you sure you want to transfer full ownership of ${currentBusiness.name} to ${editedName || name || 'this staff member'}?\n\n• You will become a Manager.\n• You will lose owner-exclusive settings & business deletion rights.\n• This action cannot be reversed without the new owner's cooperation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await transferOwnership(currentBusiness.id, userId);
              setUserRole('manager');
              Toast.show({
                type: 'success',
                text1: 'Ownership Transferred',
                text2: `${editedName || name} is now the primary business owner.`,
              });
              dismissScreen();
            } catch (err: any) {
              Alert.alert('Transfer Failed', err.message || 'Could not transfer ownership.');
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (!canManageTeam) {
    return (
      <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
        <ScreenHeader
          title="Manage Staff"
          left={<HeaderAction icon="x" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Team management is restricted"
          description="Only owners and managers can view or edit staff credentials."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
      <ScreenHeader
        title="Manage Staff"
        subtitle={editedName || name || 'Staff Member'}
        left={<HeaderAction icon="x" onPress={() => dismissScreen()} />}
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, paddingBottom: 48, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Profile Hero Card (Upwork Profile Identity) ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.heroDetails}>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {editedName || name || 'Unnamed Staff'}
                </Text>
                <View style={[styles.rolePill, { backgroundColor: roleTheme.bg }]}>
                  <Text style={styles.rolePillText}>{roleTheme.label}</Text>
                </View>
              </View>

              <View style={styles.businessTagRow}>
                <Feather name="check-circle" size={12} color={COLORS.success} />
                <Text style={styles.businessTagText} numberOfLines={1}>
                  Active Staff
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.contactRow}>
            <View style={styles.contactItem}>
              <Feather name="phone" size={12} color={COLORS.text.muted} />
              <Text style={styles.contactText} numberOfLines={1}>
                {editedPhone || phone || 'No phone set'}
              </Text>
            </View>
            <View style={styles.contactDot} />
            <View style={[styles.contactItem, { flex: 1 }]}>
              <Feather name="mail" size={12} color={COLORS.text.muted} />
              <Text style={styles.contactText} numberOfLines={1}>
                {email || 'No email attached'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 2. Activity & Performance Metrics (Smart Analytics Tiles) ── */}
        {stats && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Feather name="activity" size={13} color={COLORS.navy} />
                <Text style={styles.sectionTitle}>ACTIVITY & PERFORMANCE</Text>
              </View>
              <Text style={styles.sectionMeta}>All-Time Records</Text>
            </View>

            <View style={styles.statsGrid}>
              {/* Goods Sold */}
              <View style={styles.statTile}>
                <View style={styles.statTileHeader}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="shopping-bag" size={12} color="#0284C7" />
                  </View>
                  <Text style={styles.statOverline}>GOODS SOLD</Text>
                </View>
                <Text style={styles.statAmount} numberOfLines={1}>
                  {formatCurrency(stats.salesWorth)}
                </Text>
                <Text style={styles.statCaption}>
                  {stats.salesCount} {stats.salesCount === 1 ? 'sale' : 'sales'} logged
                </Text>
              </View>

              {/* Goods Restocked */}
              <View style={styles.statTile}>
                <View style={styles.statTileHeader}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#F5F3FF' }]}>
                    <Feather name="package" size={12} color="#7C3AED" />
                  </View>
                  <Text style={styles.statOverline}>RESTOCKED</Text>
                </View>
                <Text style={styles.statAmount} numberOfLines={1}>
                  {formatCurrency(stats.purchasesWorth)}
                </Text>
                <Text style={styles.statCaption}>
                  {stats.purchasesCount} {stats.purchasesCount === 1 ? 'batch' : 'batches'} added
                </Text>
              </View>

              {/* Cash Collected */}
              <View style={styles.statTile}>
                <View style={styles.statTileHeader}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
                    <Feather name="check-circle" size={12} color="#059669" />
                  </View>
                  <Text style={styles.statOverline}>CASH COLLECTED</Text>
                </View>
                <Text style={[styles.statAmount, { color: COLORS.success }]} numberOfLines={1}>
                  {formatCurrency(stats.paidAmount)}
                </Text>
                <Text style={styles.statCaption}>
                  {stats.owedAmount > 0 ? `₦${Number(stats.owedAmount).toLocaleString()} unpaid` : '100% Cleared'}
                </Text>
              </View>

              {/* Expenses Logged */}
              <View style={styles.statTile}>
                <View style={styles.statTileHeader}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#FFFBEB' }]}>
                    <Feather name="credit-card" size={12} color="#D97706" />
                  </View>
                  <Text style={styles.statOverline}>EXPENSES</Text>
                </View>
                <Text style={styles.statAmount} numberOfLines={1}>
                  {formatCurrency(stats.expensesAmount)}
                </Text>
                <Text style={styles.statCaption}>
                  {stats.expensesCount} expenses recorded
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── 3. Profile Information Form ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <Feather name="user" size={13} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>PROFILE DETAILS</Text>
            </View>
          </View>

          <View style={styles.card}>
            <InputField
              label="Full Name"
              placeholder="e.g. Adeola Johnson"
              value={editedName}
              onChangeText={setEditedName}
              required
              editable={canEditMember}
            />
            
            <InputField
              label="Phone Number"
              placeholder="e.g. 08012345678"
              value={editedPhone}
              onChangeText={setEditedPhone}
              keyboardType="phone-pad"
              editable={canEditMember}
            />

            {/* Authenticated Email (Security Badge Tile) */}
            <View style={styles.emailCard}>
              <View style={styles.emailIconBox}>
                <Feather name="mail" size={14} color={COLORS.navy} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.emailOverline}>SIGN-IN EMAIL (IMMUTABLE)</Text>
                <Text style={styles.emailValue} numberOfLines={1}>
                  {email || 'No email attached'}
                </Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Feather name="shield" size={10} color="#059669" />
                <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 4. Access Control & Role Selection (Interactive Upwork Tier Cards) ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <Feather name="lock" size={13} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>ASSIGNED ROLE & PERMISSIONS</Text>
            </View>
          </View>

          {isSubjectOwner ? (
            <View style={styles.ownerNoticeCard}>
              <View style={styles.ownerNoticeTop}>
                <View style={styles.ownerBadgeIcon}>
                  <Feather name="shield" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ownerNoticeTitle}>Business Owner</Text>
                  <Text style={styles.ownerNoticeSub}>
                    Holds primary administrative credentials and full controls for this business.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {ROLE_OPTIONS.map((opt) => {
                const isActive = role === opt.role;

                return (
                  <TouchableOpacity
                    key={opt.role}
                    activeOpacity={0.75}
                    style={[
                      styles.roleOptionCard,
                      isActive && styles.roleOptionCardActive,
                    ]}
                    onPress={() => setRole(opt.role)}
                  >
                    <View style={styles.roleCardTopRow}>
                      <View style={styles.roleRadioAndTitle}>
                        <View
                          style={[
                            styles.roleRadioCircle,
                            isActive && styles.roleRadioCircleActive,
                          ]}
                        >
                          {isActive ? (
                            <Feather name="check" size={11} color="#FFFFFF" />
                          ) : null}
                        </View>

                        <View style={styles.roleTitleGroup}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text
                              style={[
                                styles.roleCardTitle,
                                isActive && styles.roleCardTitleActive,
                              ]}
                            >
                              {opt.title}
                            </Text>
                            <View style={[styles.roleMicroBadge, { backgroundColor: opt.badgeBg }]}>
                              <Text style={styles.roleMicroBadgeText}>{opt.badge}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.roleSummaryText}>{opt.summary}</Text>

                    <View style={styles.permissionList}>
                      {opt.permissions.map((p, idx) => (
                        <View key={idx} style={styles.permissionItem}>
                          <Feather
                            name={p.allowed ? 'check' : 'x'}
                            size={11}
                            color={p.allowed ? COLORS.success : COLORS.danger}
                            style={{ marginTop: 2 }}
                          />
                          <Text
                            style={[
                              styles.permissionText,
                              !p.allowed && styles.permissionTextDisabled,
                            ]}
                          >
                            {p.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── 5. Primary Save Button ── */}
        {canEditMember ? (
          <Button
            title={saving ? 'Saving Changes...' : 'Save Staff Changes'}
            onPress={handleSave}
            loading={saving}
            size="lg"
            style={{ marginTop: 4 }}
          />
        ) : (
          <View
            style={{
              padding: 14,
              borderRadius: RADIUS.md,
              backgroundColor: COLORS.surface2,
              alignItems: 'center',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: COLORS.border,
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.muted }}>
              Managers cannot modify the business owner's profile.
            </Text>
          </View>
        )}

        {/* ── 6. Executive Transfer Ownership (Owner only) ── */}
        {currentUserRole === 'owner' && userId !== currentUserId && (
          <View style={styles.transferSection}>
            <View style={styles.transferCard}>
              <View style={styles.transferHeader}>
                <View style={styles.transferIconBox}>
                  <Feather name="shield" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.transferTitle}>Transfer Ownership</Text>
                  <Text style={styles.transferSubtitle}>
                    Relinquish primary ownership of {currentBusiness?.name || 'this business'} to {editedName || name}. You will become a Manager.
                  </Text>
                </View>
              </View>

              <Button
                title="Transfer Business Ownership"
                onPress={handleTransferOwnership}
                variant="secondary"
                disabled={saving}
                icon="shield"
                style={{ marginTop: 8 }}
              />
            </View>
          </View>
        )}

        {/* ── 7. Danger Zone / Revoke Access ── */}
        {!isSubjectOwner && (
          <View style={styles.dangerCard}>
            <View style={styles.dangerHeader}>
              <View style={styles.dangerIconBox}>
                <Feather name="user-x" size={15} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.dangerTitle}>Revoke Staff Access</Text>
                <Text style={styles.dangerSubtitle}>
                  Remove {editedName || name || 'this staff member'} from the team. Their login session and POS access will terminate immediately.
                </Text>
              </View>
            </View>

            <Button
              title="Remove from Business"
              onPress={handleRemove}
              variant="danger"
              disabled={saving}
              style={{ marginTop: 10 }}
            />
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  // ── Hero Profile Card ──
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroDetails: {
    flex: 1,
    gap: 3,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroName: {
    fontSize: 17,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.3,
    flex: 1,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePillText: {
    fontSize: 10.5,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  businessTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  businessTagText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  contactDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.text.muted,
  },

  // ── Sections & Headers ──
  sectionContainer: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.6,
  },
  sectionMeta: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },

  // ── Activity & Performance Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  statTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statOverline: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.4,
  },
  statAmount: {
    fontSize: 15.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.3,
  },
  statCaption: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 1,
  },

  // ── General Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },

  // ── Email Read-Only Security Box ──
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  emailIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailOverline: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.4,
  },
  emailValue: {
    fontSize: 13,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A7F3D0',
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: '#059669',
    letterSpacing: 0.3,
  },

  // ── Role Selection Cards ──
  roleOptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  roleOptionCardActive: {
    backgroundColor: '#F0F9FF',
    borderColor: COLORS.navy,
    borderWidth: 1.5,
  },
  roleCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleRadioAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  roleRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleRadioCircleActive: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.navy,
  },
  roleTitleGroup: {
    flex: 1,
  },
  roleCardTitle: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.1,
  },
  roleCardTitleActive: {
    color: COLORS.navy,
  },
  roleMicroBadge: {
    paddingHorizontal: 6.5,
    paddingVertical: 1.5,
    borderRadius: RADIUS.full,
  },
  roleMicroBadgeText: {
    fontSize: 8.5,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  roleSummaryText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    lineHeight: 17,
    paddingLeft: 29,
  },
  permissionList: {
    paddingLeft: 29,
    gap: 5,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  permissionText: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    flex: 1,
    lineHeight: 16,
  },
  permissionTextDisabled: {
    color: COLORS.text.muted,
  },

  // ── Owner Notice Card ──
  ownerNoticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  ownerNoticeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerNoticeTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  ownerNoticeSub: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Transfer Ownership ──
  transferSection: {
    marginTop: 6,
  },
  transferCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    gap: 10,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  transferIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  transferTitle: {
    fontSize: 14.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  transferSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    lineHeight: 17,
  },

  // ── Danger Zone ──
  dangerCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    gap: 8,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dangerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dangerTitle: {
    fontSize: 14.5,
    fontFamily: FONT.bold,
    color: '#991B1B',
  },
  dangerSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#7F1D1D',
    lineHeight: 17,
  },
});
