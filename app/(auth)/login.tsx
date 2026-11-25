import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTabStore } from '@/store/tabStore';
import { useAlertStore } from '@/store/alertStore';
import { useOfflineStore } from '@/store/offlineStore';
import { Button } from '@/components/ui';
import { InputField } from '@/components/forms';
import { AuthFooterLink, AuthNotice, AuthScaffold } from '@/components/auth';
import { COLORS, FONT } from '@/constants';
import { formatAuthError, isValidEmail, normaliseEmail } from '@/lib/auth';

export default function LoginScreen() {
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
    <AuthScaffold
      showMark
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      notice={!isOnline ? <AuthNotice tone="danger" icon="wifi-off" text="You're offline. Signing in needs a connection." /> : null}
      footer={<AuthFooterLink prompt="New to Record Am?" action="Create an account" onPress={() => router.push('/(auth)/register')} />}
    >
      <InputField
        label="Email"
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
        returnKeyType="next"
        error={errors.email}
      />

      <InputField
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        placeholder="Your password"
        isPassword
        autoComplete="password"
        textContentType="password"
        importantForAutofill="yes"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        error={errors.password}
      />

      <Pressable
        hitSlop={8}
        style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: -4, marginBottom: 28, opacity: pressed ? 0.5 : 1 })}
        onPress={() => router.push('/(auth)/forgot-password')}
      >
        <Text style={{ color: COLORS.accentDark, fontSize: 14, fontFamily: FONT.medium }}>Forgot password?</Text>
      </Pressable>

      <Button title="Sign in" onPress={handleLogin} loading={loading} size="lg" />
    </AuthScaffold>
  );
}
