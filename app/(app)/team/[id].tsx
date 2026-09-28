import React, { useState, useEffect } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
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

  const handleSave = async () => {
    if (!id || !userId) return;
    
    if (!editedName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    
    setSaving(true);
    try {
      await updateTeamMemberProfile(userId, editedName.trim(), editedPhone.trim());
      if (initialRole !== role) {
        await updateTeamMemberRole(id, role);
      }
      Toast.show({ type: 'success', text1: 'Staff member updated successfully' });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Staff Member',
      `Are you sure you want to remove ${name} from this business? They will lose access immediately.`,
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
              Toast.show({ type: 'success', text1: 'Staff removed successfully' });
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message);
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // Only the owner can transfer; only makes sense for this screen's subject
  const handleTransferOwnership = () => {
    if (!currentBusiness?.id || !userId) return;

    Alert.alert(
      'Transfer Ownership',
      `Are you sure you want to make ${name || 'this staff member'} the new owner of ${currentBusiness.name}?\n\nYou will become a Manager and lose owner-level controls. This cannot be undone without the new owner's cooperation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await transferOwnership(currentBusiness.id, userId);
              // Immediately update our own role in the auth store
              setUserRole('manager');
              Toast.show({
                type: 'success',
                text1: 'Ownership transferred',
                text2: `${name || 'Staff member'} is now the business owner.`,
              });
              router.back();
            } catch (err: any) {
              Alert.alert('Transfer Failed', err.message || 'Could not transfer ownership. Please try again.');
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
      <ScreenHeader
        title={`Manage Staff`}
        left={<HeaderAction icon="x" onPress={() => router.back()} />}
      />

      <ScrollView contentContainerStyle={{ padding: SP.page, gap: 24 }}>
        {stats && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Feather name="bar-chart-2" size={16} color={COLORS.ink} />
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Activity & Performance</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>GOODS SOLD</Text>
                <Text style={styles.statBoxValue}>{formatCurrency(stats.salesWorth)}</Text>
                <Text style={styles.statBoxSub}>
                  {stats.salesCount} {stats.salesCount === 1 ? 'sale' : 'sales'}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>GOODS RESTOCKED</Text>
                <Text style={styles.statBoxValue}>{formatCurrency(stats.purchasesWorth)}</Text>
                <Text style={styles.statBoxSub}>
                  {stats.purchasesCount} {stats.purchasesCount === 1 ? 'entry' : 'entries'}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>CASH COLLECTED</Text>
                <Text style={[styles.statBoxValue, { color: COLORS.success }]}>
                  {formatCurrency(stats.paidAmount)}
                </Text>
                <Text style={styles.statBoxSub}>
                  {stats.owedAmount > 0
                    ? `Owes ${formatCurrency(stats.owedAmount)}`
                    : 'Cleared'}
                </Text>
              </View>

              {stats.expensesAmount > 0 && (
                <View style={styles.statBox}>
                  <Text style={styles.statBoxLabel}>EXPENSES RECORDED</Text>
                  <Text style={styles.statBoxValue}>{formatCurrency(stats.expensesAmount)}</Text>
                  <Text style={styles.statBoxSub}>{stats.expensesCount} logged</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile Information</Text>
          <View style={{ gap: 16 }}>
            <InputField
              label="Full Name"
              placeholder="e.g. John Doe"
              value={editedName}
              onChangeText={setEditedName}
            />
            
            <InputField
              label="Phone Number"
              placeholder="e.g. +1234567890"
              value={editedPhone}
              onChangeText={setEditedPhone}
              keyboardType="phone-pad"
            />

            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyLabel}>Email Address</Text>
              <Text style={styles.readOnlyValue}>{email || 'No email provided'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Access Control</Text>
          <SelectField
            label="Role"
            value={role}
            onChange={(val) => setRole(val as UserRole)}
            options={[
              { label: 'Manager (Full access except deleting business)', value: 'manager' },
              { label: 'Cashier (Can record sales & expenses, view dashboard)', value: 'cashier' },
              { label: 'Auditor (Read-only access to records)', value: 'auditor' },
            ]}
          />
        </View>

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: 8 }}
        />

        {/* ── Transfer Ownership — owner only, not for viewing yourself ── */}
        {currentUserRole === 'owner' && userId !== currentUserId && (
          <View style={styles.transferCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Feather name="shield" size={15} color={COLORS.ink} />
              <Text style={styles.transferTitle}>Transfer Ownership</Text>
            </View>
            <Text style={styles.transferSubtitle}>
              Make {name || 'this staff member'} the new owner of this business. You will become a Manager.
            </Text>
            <Button
              title="Transfer Ownership to This Member"
              onPress={handleTransferOwnership}
              variant="secondary"
              disabled={saving}
              icon="shield"
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerSubtitle}>
            Revoke this staff member's access to the business completely.
          </Text>
          <Button
            title="Remove from Business"
            onPress={handleRemove}
            variant="danger"
            disabled={saving}
          />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginBottom: 16,
  },
  readOnlyField: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  readOnlyLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    marginBottom: 4,
  },
  readOnlyValue: {
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  dangerCard: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger + '30',
    marginTop: 24,
  },
  dangerTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.danger,
    marginBottom: 8,
  },
  dangerSubtitle: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.danger,
    marginBottom: 16,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  statBoxLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  statBoxValue: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  statBoxSub: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  transferCard: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.ink + '30',
    marginTop: 8,
  },
  transferTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  transferSubtitle: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },
});
