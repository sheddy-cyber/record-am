import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/touchables';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { pickAndUploadBusinessLogo, removeBusinessLogo } from '@/lib/businessLogo';
import * as Clipboard from 'expo-clipboard';
import { Badge, Button, Card } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BusinessAvatar, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import Toast from 'react-native-toast-message';
import { dismissScreen } from '@/lib/navigation';

export default function ProfileScreen() {
  const { profile, user, setProfile, initialize, userRole, staffId, currentBusiness, currentBranch } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  // Synchronize input fields when profile refreshes
  React.useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
    if (profile?.phone) {
      setPhone(profile.phone);
    }
  }, [profile?.full_name, profile?.phone]);

  const isOwnerOrManager = userRole === 'owner' || userRole === 'manager';
  const isNameAlreadySet = Boolean(profile?.full_name?.trim());
  const isNameLocked = !isOwnerOrManager && isNameAlreadySet;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await initialize();
    } catch (_) {}
    setRefreshing(false);
  }, [initialize]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This cannot be undone. If you are the sole owner, your business and its records will be deleted. Team members keep the business history, but their name is removed from old records. Owners of shared businesses must transfer ownership or remove active members first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.rpc('delete_my_account');
              if (error) throw error;
              useAuthStore.getState().signOut();
              router.replace('/(auth)/login');
            } catch (err: any) {
              Alert.alert('Error', err.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName && !isNameLocked) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    if (isNameLocked && trimmedName !== profile?.full_name?.trim()) {
      Alert.alert(
        'Name Cannot Be Changed',
        'Staff members cannot change their name once set. Please contact your business owner or manager to update your name in Team settings.'
      );
      return;
    }

    setSaving(true);
    try {
      const targetName = isNameLocked ? (profile?.full_name?.trim() || trimmedName) : trimmedName;

      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: targetName, phone: phone.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile!, full_name: targetName, phone: phone.trim() });
      Toast.show({ type: 'success', text1: 'Profile updated' });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      Alert.alert('Error', 'Enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      Toast.show({ type: 'success', text1: 'Password changed', text2: 'Your password has been updated.' });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface}>
      <ScreenHeader
        title="My Profile"
        subtitle={user?.email ?? 'Account'}
       
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <BusinessAvatar
                name={currentBusiness?.name || profile?.full_name || user?.email || 'U'}
                logoUrl={currentBusiness?.logo_url}
                size={60}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 16 }}>
                  {profile?.full_name ?? 'User'}
                </Text>
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {userRole ? <Badge label={userRole.toUpperCase()} variant="accent" /> : null}
                  {staffId ? (
                    <TouchableOpacity
                      onPress={async () => {
                        await Clipboard.setStringAsync(staffId);
                        Toast.show({ type: 'success', text1: 'Staff ID copied', text2: staffId });
                      }}
                      activeOpacity={0.75}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.full,
                        backgroundColor: '#E3EBF3',
                      }}
                    >
                      <Text style={{ fontFamily: FONT.bold, fontSize: 11, color: COLORS.navy }}>
                        ID: {staffId}
                      </Text>
                      <Icon name="copy" size={10} color={COLORS.navy} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {currentBusiness && isOwnerOrManager ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingTop: 12,
                  paddingBottom: 14,
                  marginBottom: 14,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: COLORS.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.semiBold, fontSize: 13, color: COLORS.text.primary }}>
                    Business Logo (Profile Picture)
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.text.muted }}>
                    Shown on dashboard, profile & receipts
                  </Text>
                </View>
                <Button
                  title={currentBusiness.logo_url ? 'Change' : 'Upload Logo'}
                  variant="secondary"
                  size="sm"
                  loading={uploadingLogo}
                  onPress={async () => {
                    setUploadingLogo(true);
                    try {
                      const uploaded = await pickAndUploadBusinessLogo(currentBusiness.id);
                      if (uploaded) {
                        Toast.show({ type: 'success', text1: 'Business logo updated' });
                      }
                    } catch (err: any) {
                      Alert.alert('Upload Failed', err?.message || 'Unable to upload business logo.');
                    } finally {
                      setUploadingLogo(false);
                    }
                  }}
                />
                {currentBusiness.logo_url ? (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Remove Logo', 'Remove your business logo?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            setUploadingLogo(true);
                            try {
                              await removeBusinessLogo(currentBusiness.id);
                              Toast.show({ type: 'success', text1: 'Business logo removed' });
                            } catch (err: any) {
                              Alert.alert('Error', err?.message || 'Could not remove logo.');
                            } finally {
                              setUploadingLogo(false);
                            }
                          },
                        },
                      ]);
                    }}
                    style={{
                      padding: 8,
                      borderRadius: RADIUS.sm,
                      backgroundColor: '#F8E5E1',
                    }}
                  >
                    <Icon name="trash-2" size={15} color={COLORS.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 16 }}>
              Personal Information
            </Text>
            <InputField
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              required={!isNameLocked}
              editable={!isNameLocked}
              leftIcon={
                <Icon
                  name={isNameLocked ? 'lock' : 'user'}
                  size={16}
                  color={isNameLocked ? COLORS.text.muted : COLORS.navy}
                />
              }
              rightElement={
                isNameLocked ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: 'rgba(0, 78, 137, 0.08)',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: RADIUS.xs,
                    }}
                  >
                    <Icon name="shield" size={11} color={COLORS.navy} />
                    <Text style={{ fontSize: 11, fontFamily: FONT.semiBold, color: COLORS.navy }}>
                      Locked
                    </Text>
                  </View>
                ) : undefined
              }
              containerStyle={isNameLocked ? { marginBottom: 8 } : undefined}
            />

            {isNameLocked ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: SP.card,
                  backgroundColor: COLORS.surface2,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: RADIUS.sm,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: COLORS.border,
                }}
              >
                <Icon name="info" size={14} color={COLORS.text.muted} style={{ marginTop: 2 }} />
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: FONT.regular,
                    color: COLORS.text.secondary,
                    flex: 1,
                    lineHeight: 17,
                  }}
                >
                  Your name is set and locked for business audit trails. Only your business owner or manager can change it.
                </Text>
              </View>
            ) : null}

            <InputField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="08012345678" keyboardType="phone-pad" />
            <Button title="Save Profile" onPress={handleSaveProfile} loading={saving} size="md" variant="accent" />
          </Card>

          <Card>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 16 }}>
              Change Password
            </Text>
            <InputField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minimum 6 characters"
              isPassword
              leftIcon={<Icon name="lock" size={16} color={COLORS.text.muted} />}
            />
            <InputField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              isPassword
              leftIcon={<Icon name="lock" size={16} color={COLORS.text.muted} />}
            />
            <Button
              title="Update Password"
              onPress={handleChangePassword}
              loading={savingPassword}
              variant="accent"
              size="md"
            />
          </Card>

          <Card>
            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 12 }}>Account Info</Text>
            {[
              ...(staffId ? [{ label: 'Staff ID', value: staffId }] : []),
              ...(currentBranch?.name ? [{ label: 'Branch', value: currentBranch.name }] : []),
              { label: 'Email', value: user?.email ?? '-' },
              {
                label: 'Member since',
                value: user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long' })
                  : '-',
              },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: COLORS.borderSubtle,
                  gap: 16,
                }}
              >
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{item.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1, textAlign: 'right' }}>
                  {item.value}
                </Text>
              </View>
            ))}
          </Card>

          <Card style={{ marginTop: 12, marginBottom: 40, borderColor: COLORS.dangerLight, backgroundColor: '#fffbfb' }}>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger, marginBottom: 8 }}>
              Danger Zone
            </Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary, marginBottom: 16, lineHeight: 18 }}>
              Permanently delete your account and all associated data. This action cannot be undone.
            </Text>
            <Button 
              title="Delete Account" 
              onPress={handleDeleteAccount} 
              loading={deleting} 
              size="md" 
              variant="danger"
            />
          </Card>
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
