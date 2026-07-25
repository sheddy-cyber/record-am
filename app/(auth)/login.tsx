import React, { useState } from 'react';
import { View, Text, Animated, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useAlertStore } from '@/store/alertStore';
import { useOfflineStore } from '@/store/offlineStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, BrandWordmark, ScreenShell } from '@/components/layout';
import { AuthBackButton, AuthProgress, useStepTransition } from '@/components/auth';
import { COLORS, FONT, RADIUS, TYPE } from '@/constants';

const STEPS = ['Email', 'Password'];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { initialize } = useAuthStore();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const transition = useStepTransition(step);

  const validateEmail = () => {
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email';
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const goToPassword = () => {
    if (!validateEmail()) return;
    setErrors({});
    setStep(1);
  };

  const handleBack = () => {
    setErrors({});
    setStep(0);
  };

  const handleLogin = async () => {
    if (!password) {
      setErrors({ password: 'Password is required' });
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await initialize();
      router.replace('/');
    } catch (err: any) {
      useAlertStore.getState().showAlert('Sign in failed', err.message, { type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: COLORS.surface }}>
          <View style={{ backgroundColor: COLORS.ink, paddingTop: insets.top + 16, paddingHorizontal: 28, paddingBottom: 30, gap: 18 }}>
            {step === 0 ? <BrandMark size={48} /> : <AuthBackButton onPress={handleBack} />}
            <AuthProgress step={step} total={STEPS.length} />
            <View>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.45)' }}>
                Step {step + 1} of {STEPS.length}
              </Text>
              <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 8, marginBottom: 6 }}>
                {step === 0 ? 'Welcome back' : 'Enter your password'}
              </Text>
              <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>
                {step === 0 ? 'Sign in to keep your records moving.' : `Signing in as ${email.trim()}`}
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
            <Animated.View style={transition}>
              {step === 0 ? (
                <>
                  <InputField
                    label="Email address"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={goToPassword}
                    error={errors.email}
                    required
                    leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
                  />
                  <Button title="Continue" onPress={goToPassword} size="lg" style={{ marginTop: 8 }} />
                </>
              ) : (
                <>
                  <InputField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoFocus
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    error={errors.password}
                    required
                    leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
                    rightElement={
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                        <Feather name={showPassword ? 'eye' : 'eye-off'} size={16} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    }
                  />

                  <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 }}>
                    <Text style={{ color: COLORS.accent, fontSize: 13, fontFamily: FONT.medium }}>Forgot password?</Text>
                  </TouchableOpacity>

                  <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg" />
                </>
              )}
            </Animated.View>

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
      </KeyboardAvoidingView>
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
