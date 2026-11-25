import React, { useState } from 'react';
import { Animated } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useOfflineStore } from '@/store/offlineStore';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { InputField } from '@/components/forms';
import { AuthFooterLink, AuthScaffold, PasswordStrength, useStepTransition } from '@/components/auth';
import { formatAuthError, getAuthCallbackUrl, getPasswordError, isValidEmail, normaliseEmail } from '@/lib/auth';
import { dismissScreen } from '@/lib/navigation';

const STEPS = ['Name', 'Contact', 'Password'];
const LAST_STEP_INDEX = STEPS.length - 1;

const HEADINGS = [
  { title: "What's your name?", subtitle: 'This is how your team and receipts will know you.' },
  { title: 'How can we reach you?', subtitle: 'Your email signs you in. Your number helps us recover the account.' },
  { title: 'Choose a password', subtitle: 'At least 8 characters. Longer is stronger.' },
];

export default function RegisterScreen() {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      dismissScreen();
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
    <AuthScaffold
      onBack={handleBack}
      progress={{ step: activeStep, total: STEPS.length }}
      eyebrow={`Step ${activeStep + 1} of ${STEPS.length}`}
      title={heading.title}
      subtitle={heading.subtitle}
      footer={<AuthFooterLink prompt="Already have an account?" action="Sign in" onPress={() => router.push('/(auth)/login')} />}
    >
      <Animated.View style={transition}>
        {activeStep === 0 ? (
          <InputField
            label="Full name"
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
          />
        ) : null}

        {activeStep === 1 ? (
          <>
            <InputField
              label="Email"
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
            />
            <InputField
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              placeholder="0801 234 5678"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              importantForAutofill="yes"
              returnKeyType="next"
              onSubmitEditing={handleNext}
              error={errors.phone}
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
            />
            <PasswordStrength password={password} />
            <InputField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Type it again"
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              returnKeyType="go"
              onSubmitEditing={handleRegister}
              error={errors.confirmPassword}
            />
          </>
        ) : null}

        {activeStep < LAST_STEP_INDEX ? (
          <Button title="Continue" onPress={handleNext} size="lg" style={{ marginTop: 12 }} />
        ) : (
          <Button title="Create account" onPress={handleRegister} loading={loading} size="lg" style={{ marginTop: 12 }} />
        )}
      </Animated.View>
    </AuthScaffold>
  );
}
