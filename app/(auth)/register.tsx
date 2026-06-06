import React, { useState } from 'react';
import { View, Text, Animated, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandMark, ScreenShell } from '@/components/layout';
import { AuthBackButton, AuthProgress, PasswordStrength, useStepTransition } from '@/components/auth';
import { BRAND, COLORS, FONT, RADIUS, TYPE } from '@/constants';

const STEPS = ['Name', 'Contact', 'Password'];

const HEADINGS = [
  { title: "What's your name?", subtitle: `Let's get your ${BRAND.name} account started.` },
  { title: 'How can we reach you?', subtitle: "We'll use these to secure your account." },
  { title: 'Create a password', subtitle: 'Make it strong and easy for you to remember.' },
];

export default function RegisterScreen() {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const transition = useStepTransition(step);

  const validateStep = (current: number) => {
    const nextErrors: Record<string, string> = {};
    if (current === 0) {
      if (!fullName.trim()) nextErrors.fullName = 'Full name is required';
    }
    if (current === 1) {
      if (!email.trim()) nextErrors.email = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email';
      if (!phone.trim()) nextErrors.phone = 'Phone number is required';
    }
    if (current === 2) {
      if (!password) nextErrors.password = 'Password is required';
      else if (password.length < 6) nextErrors.password = 'Must be at least 6 characters';
      if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setErrors({});
    setStep((current) => current + 1);
  };

  const handleBack = () => {
    setErrors({});
    if (step === 0) {
      router.back();
      return;
    }
    setStep((current) => current - 1);
  };

  const handleRegister = async () => {
    if (!validateStep(2)) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
      });
      if (error) throw error;
      Alert.alert('Account created', "Let's set up your business.", [
        { text: 'Continue', onPress: () => router.replace('/(auth)/onboarding') },
      ]);
    } catch (err: any) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const heading = HEADINGS[step];

  return (
    <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ paddingTop: 48, paddingHorizontal: 28, paddingBottom: 28, gap: 18 }}>
            <AuthBackButton onPress={handleBack} />
            {step === 0 ? <BrandMark size={46} /> : null}
            <AuthProgress step={step} total={STEPS.length} />
            <View>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.45)' }}>
                Step {step + 1} of {STEPS.length}
              </Text>
              <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 8, marginBottom: 6 }}>{heading.title}</Text>
              <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.55)' }}>{heading.subtitle}</Text>
            </View>
          </View>

          <View style={styles.formPanel}>
            <Animated.View style={transition}>
              {step === 0 ? (
                <InputField
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Emeka Johnson"
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={handleNext}
                  error={errors.fullName}
                  required
                  leftIcon={<Feather name="user" size={16} color={COLORS.text.muted} />}
                />
              ) : null}

              {step === 1 ? (
                <>
                  <InputField
                    label="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
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
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                    error={errors.phone}
                    required
                    leftIcon={<Feather name="phone" size={16} color={COLORS.text.muted} />}
                  />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <InputField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Minimum 6 characters"
                    secureTextEntry={!showPassword}
                    autoFocus
                    error={errors.password}
                    required
                    leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
                    rightElement={
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                        <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    }
                  />
                  <PasswordStrength password={password} />
                  <InputField
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat your password"
                    secureTextEntry={!showPassword}
                    returnKeyType="go"
                    onSubmitEditing={handleRegister}
                    error={errors.confirmPassword}
                    required
                    leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
                  />
                </>
              ) : null}

              {step < 2 ? (
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
