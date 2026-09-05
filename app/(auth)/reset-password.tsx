import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Button, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandWordmark, ScreenShell } from '@/components/layout';
import { PasswordStrength } from '@/components/auth';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { COLORS, FONT, RADIUS } from '@/constants';
import { formatAuthError, getPasswordError } from '@/lib/auth';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ recovery?: string | string[] }>();
  const recoveryAuthorized = useMemo(() => (Array.isArray(params.recovery) ? params.recovery[0] : params.recovery) === '1', [params.recovery]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);

  useEffect(() => {
    let active = true;

    const checkRecoverySession = async () => {
      if (!recoveryAuthorized) {
        if (active) {
          setCanReset(false);
          setIsCheckingSession(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (active) {
        setCanReset(Boolean(data.session));
        setIsCheckingSession(false);
      }
    };

    checkRecoverySession();
    return () => { active = false; };
  }, [recoveryAuthorized]);

  const handleUpdatePassword = async () => {
    const passwordError = getPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await useAuthStore.getState().initialize();
      useAlertStore.getState().showAlert('Password updated', 'Your password has been changed. You are signed in securely.', { type: 'info' });
      router.replace('/');
    } catch (updateError) {
      setError(formatAuthError(updateError));
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingSession) return <LoadingScreen message="Verifying reset link…" />;

  if (!canReset) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
        <View style={styles.invalidContent}>
          <View style={styles.invalidIcon}><Feather name="alert-circle" size={28} color={COLORS.warning} /></View>
          <Text style={styles.title}>This link is no longer valid</Text>
          <Text style={styles.subtitle}>Reset links and verification codes expire for your security. Request a new reset email to continue.</Text>
          <Button title="Request new reset email" onPress={() => router.replace('/(auth)/forgot-password')} size="lg" style={{ width: '100%', marginTop: 28 }} />
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={{ padding: 18 }}>
            <Text style={styles.secondaryAction}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: COLORS.surface }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><BrandWordmark /></View>
        <View style={styles.content}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Create a new password</Text>
            <Text style={styles.subtitle}>Choose a unique password with at least 8 characters, including letters and a number or symbol.</Text>
          </View>
          <InputField
            label="New password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={(text) => { setPassword(text); setError(''); }}
            isPassword
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            importantForAutofill="yes"
            autoFocus
            error={error}
            required
            leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
          />
          <PasswordStrength password={password} />
          <InputField
            label="Confirm new password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChangeText={(text) => { setConfirmPassword(text); setError(''); }}
            isPassword
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            importantForAutofill="yes"
            returnKeyType="go"
            onSubmitEditing={handleUpdatePassword}
            error={error && password === confirmPassword ? error : undefined}
            required
            leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
          />
        </View>
        <View style={styles.footer}>
          <Button title="Update password" onPress={handleUpdatePassword} loading={loading} size="lg" />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
  titleContainer: { marginBottom: 32 },
  title: { fontSize: 28, fontFamily: FONT.black, color: COLORS.text.primary, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 22 },
  footer: { padding: 24, paddingBottom: 48 },
  invalidContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, alignItems: 'center' },
  invalidIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.warningLight, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  secondaryAction: { color: COLORS.text.secondary, fontFamily: FONT.medium, fontSize: 14 },
});
