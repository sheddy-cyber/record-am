import React, { useState, useEffect } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import { useLocalSearchParams } from 'expo-router';
import { Icon, IconName } from '@/components/icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { isBranchOpen } from '@/lib/branches';
import { Avatar, Button, PermissionDenied, Pill } from '@/components/ui';
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
  icon: IconName;
  summary: string;
  permissions: { text: string; allowed: boolean }[];
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'manager',
    title: 'Manager',
    badge: 'FULL ACCESS',
    badgeBg: COLORS.ink,
    icon: 'shield',
    summary: 'Runs the shop day to day: sales, stock, expenses and reports.',
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
    badgeBg: '#24663F',
    icon: 'shopping-bag',
    summary: 'Serves customers: records sales, takes payments, logs small expenses.',
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
    badgeBg: '#8A5A12',
    icon: 'eye',
    summary: 'Can see everything to check the books, but cannot change anything.',
    permissions: [
      { text: 'Review historical sales, receipts, debts & expense logs', allowed: true },
      { text: 'Export financial reports & audit stock movement trail', allowed: true },
      { text: 'Create, modify, or delete any sales, records, or stock', allowed: false },
    ],
  },
];

const ROLE_THEMES: Record<string, { bg: string; text: string; label: string }> = {
  owner: { bg: '#2B2925', text: '#FFFFFF', label: 'Owner' },
  manager: { bg: COLORS.ink, text: '#FFFFFF', label: 'Manager' },
  cashier: { bg: '#24663F', text: '#FFFFFF', label: 'Cashier' },
  auditor: { bg: '#8A5A12', text: '#FFFFFF', label: 'Auditor' },
};

export default function EditTeamMemberScreen() {
  const { id, userId, name, email, phone, role: initialRole, staffId, branchId: initialBranchId, branchName } = useLocalSearchParams<{ 
    id: string; 
    userId: string;
    name: string; 
    email: string; 
    phone: string;
    role: string;
    staffId?: string;
    branchId?: string;
    branchName?: string;
  }>();
  
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUserRole = useAuthStore((s) => s.userRole);
  const canManageTeam = hasPermission(currentUserRole, 'business-settings.manage');
  const setUserRole = useAuthStore((s) => s.setUserRole);
  const { branches, updateTeamMemberRole, updateTeamMemberBranch, updateTeamMemberProfile, removeTeamMember, transferOwnership } = useBusinessStore();

  const [role, setRole] = useState<UserRole>((initialRole as UserRole) || 'cashier');
  const [assignedBranchId, setAssignedBranchId] = useState<string>(initialBranchId || '');
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
      Alert.alert('Not allowed', 'Managers cannot change the owner’s profile.');
      return;
    }
    
    if (!editedName.trim()) {
      Alert.alert('Name needed', 'Enter this person’s full name.');
      return;
    }
    
    setSaving(true);
    try {
      await updateTeamMemberProfile(userId, editedName.trim(), editedPhone.trim());
      if (initialRole !== role) {
        await updateTeamMemberRole(id, role);
      }
      if (assignedBranchId && assignedBranchId !== (initialBranchId || '')) {
        await updateTeamMemberBranch(id, assignedBranchId);
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
        const matchedBranch = branches.find((b) => b.id === assignedBranchId);
        if (matchedBranch) {
          useAuthStore.getState().setCurrentBranch(matchedBranch);
        }
      }
      Toast.show({ type: 'success', text1: 'Changes saved' });
      dismissScreen();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update staff member.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      `Remove ${editedName || name || 'this person'}?`,
      `They will lose access to ${currentBusiness?.name || 'this business'} straight away. Their past records stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setSaving(true);
            try {
              await removeTeamMember(id);
              Toast.show({ type: 'success', text1: 'Removed from team' });
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
      `Make ${editedName || name || 'this person'} the owner?`,
      `You will become a manager and lose owner-only settings, including deleting the business. Only the new owner can give ownership back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer ownership',
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
      <ScreenShell backgroundColor={COLORS.background}>
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

  const displayName = editedName || name || 'Staff member';
  const selectedRole = ROLE_OPTIONS.find((o) => o.role === role);

  return (
    <ScreenShell>
      <ScreenHeader title={displayName} left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: 56 }} showsVerticalScrollIndicator={false}>
        {/* ── Identity ────────────────────────────────────────────── */}
        <View style={styles.identity}>
          <Avatar name={displayName} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[roleTheme.label, staffId, branches.find((b) => b.id === assignedBranchId)?.name || branchName].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* ── Activity ────────────────────────────────────────────── */}
        {stats ? (
          <>
            <Text style={styles.section}>All-time activity</Text>
            <View style={styles.grid}>
              <Figure label="Sold" value={formatCurrency(stats.salesWorth)} sub={`${stats.salesCount} ${stats.salesCount === 1 ? 'sale' : 'sales'}`} />
              <Figure
                label="Restocked"
                value={formatCurrency(stats.purchasesWorth)}
                sub={`${stats.purchasesCount} ${stats.purchasesCount === 1 ? 'entry' : 'entries'}`}
                right
              />
              <Figure
                label="Collected"
                value={formatCurrency(stats.paidAmount)}
                sub={stats.owedAmount > 0 ? `${formatCurrency(stats.owedAmount)} still owed` : 'Nothing owed'}
                bottom
              />
              <Figure
                label="Expenses"
                value={formatCurrency(stats.expensesAmount)}
                sub={`${stats.expensesCount} recorded`}
                right
                bottom
              />
            </View>
          </>
        ) : null}

        {/* ── Details ─────────────────────────────────────────────── */}
        <Text style={styles.section}>Details</Text>
        <InputField label="Full name" placeholder="e.g. Adeola Johnson" value={editedName} onChangeText={setEditedName} editable={canEditMember} />
        <InputField
          label="Phone"
          placeholder="0801 234 5678"
          value={editedPhone}
          onChangeText={setEditedPhone}
          keyboardType="phone-pad"
          editable={canEditMember}
        />
        <View style={styles.group}>
          <InfoRow label="Sign-in email" value={email || 'None'} />
          {staffId ? <InfoRow label="Staff ID" value={staffId} last /> : null}
        </View>

        {branches.length > 0 && !isSubjectOwner ? (
          <>
            <Text style={styles.section}>Works at</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {branches.filter((branch) => isBranchOpen(branch) || branch.id === assignedBranchId).map((branch) => (
                <Pill
                  key={branch.id}
                  label={branch.name}
                  active={assignedBranchId === branch.id}
                  onPress={currentUserRole === 'owner' ? () => setAssignedBranchId(branch.id) : undefined}
                />
              ))}
            </View>
            {currentUserRole !== 'owner' ? <Text style={styles.footnote}>Only the owner can move staff between branches.</Text> : null}
          </>
        ) : null}

        {/* ── Role ────────────────────────────────────────────────── */}
        <Text style={styles.section}>Role</Text>
        {isSubjectOwner ? (
          <View style={styles.group}>
            <InfoRow label="Owner" value="Full control of the business" last />
          </View>
        ) : (
          <>
            <View style={styles.group}>
              {ROLE_OPTIONS.map((opt, i) => {
                const active = role === opt.role;
                return (
                  <Pressable
                    key={opt.role}
                    onPress={() => canEditMember && setRole(opt.role)}
                    style={({ pressed }) => [
                      styles.roleRow,
                      i < ROLE_OPTIONS.length - 1 && styles.divider,
                      pressed && { backgroundColor: COLORS.surface2 },
                    ]}
                  >
                    <View style={[styles.radio, active && styles.radioOn]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleTitle}>{opt.title}</Text>
                      <Text style={styles.roleText}>{opt.summary}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {selectedRole ? (
              <View style={styles.perms}>
                {selectedRole.permissions.map((perm) => (
                  <View key={perm.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Icon
                      name={perm.allowed ? 'check' : 'x'}
                      size={14}
                      color={perm.allowed ? COLORS.successText : COLORS.text.faint}
                      strokeWidth={2.2}
                      style={{ marginTop: 2 }}
                    />
                    <Text style={[styles.permText, !perm.allowed && { color: COLORS.text.muted }]}>{perm.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}

        {canEditMember ? (
          <Button title="Save changes" onPress={handleSave} loading={saving} size="lg" style={{ marginTop: 24 }} />
        ) : (
          <Text style={[styles.footnote, { textAlign: 'center', marginTop: 24 }]}>Managers cannot change the owner’s profile.</Text>
        )}

        {/* ── Less common actions ─────────────────────────────────── */}
        {(currentUserRole === 'owner' && userId !== currentUserId) || !isSubjectOwner ? (
          <View style={[styles.group, { marginTop: 28 }]}>
            {currentUserRole === 'owner' && userId !== currentUserId ? (
              <Pressable
                onPress={handleTransferOwnership}
                disabled={saving}
                style={({ pressed }) => [styles.actionRow, !isSubjectOwner && styles.divider, pressed && { backgroundColor: COLORS.surface2 }]}
              >
                <Text style={styles.actionText}>Make {displayName.split(' ')[0]} the owner</Text>
              </Pressable>
            ) : null}
            {!isSubjectOwner ? (
              <Pressable
                onPress={handleRemove}
                disabled={saving}
                style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: COLORS.surface2 }]}
              >
                <Text style={[styles.actionText, { color: COLORS.danger }]}>Remove from team</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function Figure({ label, value, sub, right, bottom }: { label: string; value: string; sub: string; right?: boolean; bottom?: boolean }) {
  return (
    <View
      style={[
        styles.figure,
        !right && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: COLORS.border },
        !bottom && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
      ]}
    >
      <Text style={styles.figLabel}>{label}</Text>
      <Text style={styles.figValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.figSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.divider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  name: { fontSize: 26, lineHeight: 31, fontFamily: FONT.display, color: COLORS.text.primary, letterSpacing: -0.4 },
  meta: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 },
  section: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3, marginTop: 28, marginBottom: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  figure: { width: '50%', padding: 14 },
  figLabel: { fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.secondary },
  figValue: { fontSize: 21, fontFamily: FONT.display, color: COLORS.text.primary, marginTop: 4, fontVariant: ['tabular-nums'] },
  figSub: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, minHeight: 50 },
  infoLabel: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.primary },
  infoValue: { flexShrink: 1, fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'right' },
  roleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: COLORS.borderDark, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOn: { borderColor: COLORS.ink, backgroundColor: COLORS.ink },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  roleTitle: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  roleText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, lineHeight: 18 },
  perms: { gap: 8, paddingHorizontal: 4, paddingTop: 12 },
  permText: { flex: 1, fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 19 },
  footnote: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 8, paddingHorizontal: 4 },
  actionRow: { paddingHorizontal: 16, minHeight: 52, justifyContent: 'center' },
  actionText: { fontSize: 15.5, fontFamily: FONT.medium, color: COLORS.text.primary },
});
