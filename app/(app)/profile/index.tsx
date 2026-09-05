import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Button, Card } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import Toast from 'react-native-toast-message';

export default function ProfileScreen() {
  const { profile, user, setProfile, initialize } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await initialize();
    } catch (_) {}
    setRefreshing(false);
  }, [initialize]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    if (!fullName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile!, full_name: fullName.trim(), phone: phone.trim() });
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
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="My Profile"
        subtitle={user?.email ?? 'Account'}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderWidth: 1,
                  borderRadius: RADIUS.md,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 24, fontFamily: FONT.bold, color: COLORS.ink }}>
                  {(profile?.full_name ?? user?.email ?? 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 16 }}>
                  {profile?.full_name ?? 'User'}
                </Text>
                <Text style={{ fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary, marginBottom: 16 }}>
              Personal Information
            </Text>
            <InputField label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full name" required />
            <InputField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="08012345678" keyboardType="phone-pad" />
            <Button title="Save Profile" onPress={handleSaveProfile} loading={saving} size="md" />
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
              secureTextEntry={!showNewPassword}
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
              rightElement={
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={{ padding: 4 }}>
                  <Feather name={showNewPassword ? 'eye' : 'eye-off'} size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              }
            />
            <InputField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry={!showConfirmPassword}
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
              rightElement={
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: 4 }}>
                  <Feather name={showConfirmPassword ? 'eye' : 'eye-off'} size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              }
            />
            <Button
              title="Update Password"
              onPress={handleChangePassword}
              loading={savingPassword}
              variant="secondary"
              size="md"
            />
          </Card>

          <Card style={{ backgroundColor: '#F9FAFB' }}>
            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.muted, marginBottom: 12 }}>Account Info</Text>
            {[
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
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
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

          <Card style={{ marginTop: 24, marginBottom: 40 }}>
            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.danger, marginBottom: 16 }}>
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
