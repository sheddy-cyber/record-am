import React, { useState } from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useOfflineStore } from '@/store/offlineStore';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, ScreenShell } from '@/components/layout';
import { AuthBackButton, AuthProgress, PasswordStrength, useStepTransition } from '@/components/auth';
import { BRAND, COLORS, FONT, RADIUS, TYPE } from '@/constants';
import { formatAuthError, getAuthCallbackUrl, getPasswordError, isValidEmail, normaliseEmail } from '@/lib/auth';

const STEPS = ['Name', 'Contact', 'Password'];
const LAST_STEP_INDEX = STEPS.length - 1;

const HEADINGS = [
  {
    title: "What's your name?",
    subtitle: (
      <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>
        Let&apos;s get your <Text style={{ fontStyle: 'italic' }}>{BRAND.name}</Text> account started.
      </Text>
    ),
  },
  { title: 'How can we reach you?', subtitle: "We'll use these to secure your account." },
  { title: 'Create a password', subtitle: 'Make it strong and easy for you to remember.' },
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Clamp the rendered step in case Fast Refresh restores an older, invalid
  // state after a previous app version advanced beyond the final screen.
  const activeStep = Math.min(Math.max(step, 0), LAST_STEP_INDEX);
  const transition = useStepTransition(activeStep);

  const validateStep = (current: number) => {
    const nextErrors: Record<string, string> = {};
    if (current === 0) {
      if (!fullName.trim()) nextErrors.fullName = 'Full name is required';
    }
    if (current === 1) {
      if (!email.trim()) nextErrors.email = 'Email is required';
      else if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email';
      if (!phone.trim()) nextErrors.phone = 'Phone number is required';
    }
    if (current === 2) {
      if (!password) nextErrors.password = 'Password is required';
      else {
        const passwordError = getPasswordError(password);
        if (passwordError) nextErrors.password = passwordError;
      }
      if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleNext = () => {
    if (activeStep >= LAST_STEP_INDEX || !validateStep(activeStep)) return;
    setErrors({});
    setStep((current) => Math.min(current + 1, LAST_STEP_INDEX));
  };

  const handleBack = () => {
    setErrors({});
    if (activeStep === 0) {
      router.back();
      return;
    }
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleRegister = async () => {
    if (!validateStep(2)) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: normaliseEmail(email),
        password,
        options: {
          data: { full_name: fullName.trim(), phone: phone.trim() },
          emailRedirectTo: getAuthCallbackUrl('signup'),
        },
      });
      if (error) throw error;

      if (data.session) {
        useAuthStore.getState().setSession(data.session);
        await useAuthStore.getState().initialize();
        router.replace('/(auth)/onboarding');
      } else {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email: normaliseEmail(email), flow: 'signup' },
        });
      }
    } catch (err: any) {
      useAlertStore.getState().showAlert('Could not create account', formatAuthError(err), { type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const heading = HEADINGS[activeStep];

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: COLORS.surface }}>
        <View style={{ backgroundColor: COLORS.ink, paddingTop: insets.top + 16, paddingHorizontal: 28, paddingBottom: 28, gap: 18 }}>
          <AuthBackButton onPress={handleBack} />
          {activeStep === 0 ? <BrandMark size={60} badge /> : null}
          <AuthProgress step={activeStep} total={STEPS.length} />
          <View>
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.45)' }}>
              Step {activeStep + 1} of {STEPS.length}
            </Text>
            <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 8, marginBottom: 6 }}>{heading.title}</Text>
            <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>{heading.subtitle}</Text>
          </View>
        </View>

        <View style={styles.formPanel}>
          <Animated.View style={transition}>
            {activeStep === 0 ? (
              <InputField
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Emeka Johnson"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                importantForAutofill="yes"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={handleNext}
                error={errors.fullName}
                required
                leftIcon={<Feather name="user" size={16} color={COLORS.text.muted} />}
              />
            ) : null}

            {activeStep === 1 ? (
              <>
                <InputField
                  label="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  autoFocus
                  error={errors.email}
                  required
                  leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
                />
                <InputField
                  label="Phone Number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="08012345678"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  importantForAutofill="yes"
                  returnKeyType="next"
                  onSubmitEditing={handleNext}
                  error={errors.phone}
                  required
                  leftIcon={<Feather name="phone" size={16} color={COLORS.text.muted} />}
                />
              </>
            ) : null}

            {activeStep === 2 ? (
              <>
                <InputField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  isPassword
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                  autoFocus
                  error={errors.password}
                  required
                  leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
                />
                <PasswordStrength password={password} />
                <InputField
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat your password"
                  isPassword
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                  returnKeyType="go"
                  onSubmitEditing={handleRegister}
                  error={errors.confirmPassword}
                  required
                  leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
                />
              </>
            ) : null}

            {activeStep < LAST_STEP_INDEX ? (
              <Button title="Continue" onPress={handleNext} size="lg" style={{ marginTop: 8 }} />
            ) : (
              <Button title="Create Account" onPress={handleRegister} loading={loading} size="lg" style={{ marginTop: 8 }} />
            )}
          </Animated.View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 }}>
            <Text style={{ color: COLORS.text.muted, fontSize: 14, fontFamily: FONT.regular }}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={{ color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 14 }}>Sign in</Text>
            </TouchableOpacity>
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
