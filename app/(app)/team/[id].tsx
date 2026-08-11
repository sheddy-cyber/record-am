import React, { useState } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP } from '@/constants';
import { UserRole } from '@/types';
import Toast from 'react-native-toast-message';

export default function EditTeamMemberScreen() {
  const { id, userId, name, email, phone, role: initialRole } = useLocalSearchParams<{ 
    id: string; 
    userId: string;
    name: string; 
    email: string;
    phone: string;
    role: string;
  }>();
  
  const [role, setRole] = useState<UserRole>((initialRole as UserRole) || 'cashier');
  const [editedName, setEditedName] = useState(name || '');
  const [editedPhone, setEditedPhone] = useState(phone || '');
  const [saving, setSaving] = useState(false);
  const { updateTeamMemberRole, updateTeamMemberProfile, removeTeamMember } = useBusinessStore();

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

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
      <ScreenHeader
        title={`Manage Staff`}
        left={<HeaderAction icon="x" onPress={() => router.back()} />}
      />

      <ScrollView contentContainerStyle={{ padding: SP.page, gap: 24 }}>
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
  }
});
