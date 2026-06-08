import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useOfflineStore } from '@/store/offlineStore';
import { useAlertStore } from '@/store/alertStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, ScreenShell } from '@/components/layout';
import { BRAND, COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { isOnline } = useOfflineStore();

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!fullName.trim()) nextErrors.fullName = 'Full name is required';
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email';
    if (!phone.trim()) nextErrors.phone = 'Phone number is required';
    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 6) nextErrors.password = 'Must be at least 6 characters';
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleRegister = async () => {
    if (!isOnline) {
      useAlertStore.getState().showAlert('Offline Mode', 'Internet connection required to register. Please connect and try again.', { type: 'warning' });
      return;
    }
    if (!validate()) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
      });
      if (error) throw error;
      useAlertStore.getState().showAlert('Account created', "Let's set up your business.", {
        confirmText: 'Continue',
        onConfirm: () => router.replace('/(auth)/onboarding'),
        type: 'info'
      });
    } catch (err: any) {
      useAlertStore.getState().showAlert('Registration failed', err.message, { type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ paddingTop: 48, paddingHorizontal: 28, paddingBottom: 30 }}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Feather name="arrow-left" size={20} color={COLORS.text.inverse} />
            </TouchableOpacity>
            <BrandMark size={46} />
            <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 18, marginBottom: 6 }}>Create account</Text>
            <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>
              Start using {BRAND.name} to keep your records sharp.
            </Text>
            {!isOnline && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: 'rgba(231,76,60,0.15)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e74c3c' }}>
                <Feather name="wifi-off" size={16} color="#e74c3c" />
                <Text style={{ color: '#fdf0ef', fontSize: 13, fontFamily: FONT.medium, flex: 1 }}>
                  You are offline. An internet connection is required to create an account.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.formPanel}>
            <InputField
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Emeka Johnson"
              autoCapitalize="words"
              error={errors.fullName}
              required
              leftIcon={<Feather name="user" size={16} color={COLORS.text.muted} />}
              editable={isOnline}
            />
            <InputField
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              required
              leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
              editable={isOnline}
            />
            <InputField
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              placeholder="08012345678"
              keyboardType="phone-pad"
              error={errors.phone}
              required
              leftIcon={<Feather name="phone" size={16} color={COLORS.text.muted} />}
              editable={isOnline}
            />
            <InputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 6 characters"
              secureTextEntry={!showPassword}
              error={errors.password}
              required
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
              editable={isOnline}
              rightElement={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }} disabled={!isOnline}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              }
            />
            <InputField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry={!showPassword}
              error={errors.confirmPassword}
              required
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
              editable={isOnline}
            />

            <Button
              title={isOnline ? "Create Account" : "Offline Mode"}
              onPress={handleRegister}
              loading={loading}
              disabled={!isOnline}
              size="lg"
              style={{ marginTop: 8, marginBottom: 24 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: COLORS.text.muted, fontSize: 14, fontFamily: FONT.regular }}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text style={{ color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 14 }}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    marginBottom: 24,
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(250,250,248,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formPanel: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
  },
});
