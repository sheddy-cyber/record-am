import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTabStore } from '@/store/tabStore';
import { useAlertStore } from '@/store/alertStore';
import { useOfflineStore } from '@/store/offlineStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, BrandWordmark, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, TYPE } from '@/constants';
import { formatAuthError, isValidEmail, normaliseEmail } from '@/lib/auth';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { initialize } = useAuthStore();
  const isOnline = useOfflineStore((s) => s.isOnline);

  const validateForm = () => {
    const nextErrors: typeof errors = {};
    if (!email.trim()) {
      nextErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      nextErrors.email = 'Enter a valid email';
    }

    if (!password) {
      nextErrors.password = 'Password is required';
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normaliseEmail(email), password });
      if (error) throw error;
      useTabStore.getState().setActiveTab('dashboard');
      await initialize();
      router.replace('/');
    } catch (err: any) {
      const message = formatAuthError(err);
      if (message === 'Confirm your email before signing in.') {
        useAlertStore.getState().showAlert('Email confirmation needed', message, {
          confirmText: 'Verify email',
          onConfirm: () => router.push({
            pathname: '/(auth)/verify-email',
            params: { email: normaliseEmail(email), flow: 'signup' },
          }),
          type: 'info',
        });
      } else {
        useAlertStore.getState().showAlert('Sign in failed', message, { type: 'danger' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: COLORS.surface }}>
        <View style={{ backgroundColor: COLORS.ink, paddingTop: insets.top + 16, paddingHorizontal: 28, paddingBottom: 30, gap: 18 }}>
          <BrandMark size={60} badge />
          <View>
            <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 4, marginBottom: 6 }}>
              Welcome back
            </Text>
            <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>
              Sign in to keep your records moving.
            </Text>
            {!isOnline && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: 'rgba(231,76,60,0.15)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e74c3c' }}>
                <Feather name="wifi-off" size={16} color="#e74c3c" />
                <Text style={{ color: '#fdf0ef', fontSize: 13, fontFamily: FONT.medium, flex: 1 }}>
                  You are offline. An internet connection is required to sign in.
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.formPanel}>
          <View style={{ gap: 4 }}>
            <InputField
              label="Email address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              autoFocus
              returnKeyType="next"
              error={errors.email}
              required
              leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
            />

            <InputField
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Enter your password"
              isPassword
              autoComplete="password"
              textContentType="password"
              importantForAutofill="yes"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              error={errors.password}
              required
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
            />

            <TouchableOpacity
              style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 }}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={{ color: COLORS.accent, fontSize: 13, fontFamily: FONT.medium }}>Forgot password?</Text>
            </TouchableOpacity>

            <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg" />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 }}>
            <Text style={{ color: COLORS.text.muted, fontSize: 14, fontFamily: FONT.regular }}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 14 }}>Register</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center', paddingBottom: 16, marginTop: 32 }}>
            <BrandWordmark size={20} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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

