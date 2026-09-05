import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/forms';
import { BrandWordmark, ScreenShell } from '@/components/layout';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import {
  AUTH_RESEND_COOLDOWN_SECONDS,
  EMAIL_CODE_LENGTH,
  formatAuthError,
  getAuthCallbackUrl,
  getAuthFlow,
  isValidEmail,
  normaliseEmail,
  type AuthFlow,
} from '@/lib/auth';
import { COLORS, FONT, RADIUS, TYPE } from '@/constants';

const COPY: Record<AuthFlow, { title: string; description: string; icon: keyof typeof Feather.glyphMap }> = {
  signup: {
    title: 'Confirm your email',
    description: 'We sent a secure confirmation email to',
    icon: 'mail',
  },
  login: {
    title: 'Check your email',
    description: 'If an account exists for this address, we sent a secure sign-in email to',
    icon: 'log-in',
  },
  recovery: {
    title: 'Check your email',
    description: 'If an account exists for this address, we sent password reset instructions to',
    icon: 'key',
  },
};

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string | string[]; flow?: string | string[] }>();
  const email = useMemo(() => normaliseEmail(Array.isArray(params.email) ? params.email[0] ?? '' : params.email ?? ''), [params.email]);
  const flow = getAuthFlow(Array.isArray(params.flow) ? params.flow[0] : params.flow);
  const copy = COPY[flow];
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(AUTH_RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (!secondsRemaining) return;
    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const returnToSignIn = () => router.replace('/(auth)/login');

  const completeVerification = async (verificationCode: string) => {
    if (!isValidEmail(email)) {
      setError('This verification request is missing an email address. Start again from sign in.');
      return;
    }
    if (verificationCode.length !== EMAIL_CODE_LENGTH) {
      setError(`Enter the ${EMAIL_CODE_LENGTH}-digit code from your email.`);
      return;
    }

    setIsVerifying(true);
    setError('');
    try {
      const { data, error: verificationError } = await supabase.auth.verifyOtp({
        email,
        token: verificationCode,
        type: flow === 'recovery' ? 'recovery' : 'email',
      });
      if (verificationError) throw verificationError;

      const session = data.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('We could not verify that email. Request a new email and try again.');

      useAuthStore.getState().setSession(session);

      if (flow === 'recovery') {
        router.replace({ pathname: '/(auth)/reset-password', params: { recovery: '1' } });
        return;
      }

      await useAuthStore.getState().initialize();
      router.replace(flow === 'signup' ? '/(auth)/onboarding' : '/');
    } catch (verificationError) {
      setError(formatAuthError(verificationError));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const nextCode = value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
    setCode(nextCode);
    if (error) setError('');
    if (nextCode.length === EMAIL_CODE_LENGTH && !isVerifying) {
      completeVerification(nextCode);
    }
  };

  const handleResend = async () => {
    if (secondsRemaining || !isValidEmail(email)) return;

    setIsResending(true);
    setError('');
    try {
      if (flow === 'signup') {
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: getAuthCallbackUrl('signup') },
        });
        if (resendError) throw resendError;
      } else if (flow === 'recovery') {
        const { error: resendError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthCallbackUrl('recovery'),
        });
        if (resendError) throw resendError;
      } else {
        const { error: resendError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: getAuthCallbackUrl('login'),
          },
        });
        if (resendError) throw resendError;
      }

      setCode('');
      setSecondsRemaining(AUTH_RESEND_COOLDOWN_SECONDS);
      useAlertStore.getState().showAlert('Email sent', 'Check your inbox and spam folder for the newest email.', { type: 'info' });
    } catch (resendError) {
      setError(formatAuthError(resendError));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={returnToSignIn} style={styles.backButton} accessibilityLabel="Back to sign in">
            <Feather name="arrow-left" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <BrandWordmark />
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Feather name={copy.icon} size={28} color={COLORS.ink} />
          </View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.description}>{copy.description}</Text>
          <Text style={styles.email}>{email || 'your email address'}</Text>

          <View style={styles.linkNotice}>
            <Feather name="shield" size={16} color={COLORS.info} />
            <Text style={styles.linkNoticeText}>
              Open the secure link in the email. If your email includes a six-digit code instead, enter it below.
            </Text>
          </View>

          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>Verification code</Text>
            <TextInput
              value={code}
              onChangeText={handleCodeChange}
              placeholder="000000"
              placeholderTextColor={COLORS.text.muted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              importantForAutofill="yes"
              maxLength={EMAIL_CODE_LENGTH}
              autoFocus
              editable={!isVerifying}
              style={[styles.codeInput, error ? styles.codeInputError : null]}
              accessibilityLabel="Six digit verification code"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Button
            title="Verify code"
            onPress={() => completeVerification(code)}
            loading={isVerifying}
            disabled={code.length !== EMAIL_CODE_LENGTH}
            size="lg"
          />

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn&apos;t receive an email? </Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={secondsRemaining > 0 || isResending}
              accessibilityRole="button"
            >
              <Text style={[styles.resendAction, secondsRemaining > 0 || isResending ? styles.resendDisabled : null]}>
                {secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : isResending ? 'Sending…' : 'Resend email'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={returnToSignIn} style={styles.changeEmailButton}>
            <Text style={styles.changeEmailText}>Use a different email address</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, backgroundColor: COLORS.surface },
  header: { paddingHorizontal: 24, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', gap: 16 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { ...TYPE.h1, color: COLORS.text.primary, textAlign: 'center', marginBottom: 10 },
  description: { color: COLORS.text.secondary, fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  email: { color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 15, textAlign: 'center', marginTop: 4 },
  linkNotice: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.infoLight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 28, alignItems: 'flex-start' },
  linkNoticeText: { flex: 1, color: COLORS.text.secondary, fontFamily: FONT.regular, fontSize: 13, lineHeight: 19 },
  codeSection: { width: '100%', marginTop: 30, marginBottom: 18 },
  codeLabel: { color: COLORS.text.primary, fontFamily: FONT.medium, fontSize: 13, marginBottom: 8 },
  codeInput: { height: 56, borderWidth: 1, borderColor: COLORS.borderDark, borderRadius: RADIUS.md, backgroundColor: COLORS.card, color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 24, letterSpacing: 10, textAlign: 'center', paddingHorizontal: 12 },
  codeInputError: { borderColor: COLORS.danger },
  error: { color: COLORS.danger, fontFamily: FONT.regular, fontSize: 12, lineHeight: 18, marginTop: 8 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 },
  resendText: { color: COLORS.text.muted, fontFamily: FONT.regular, fontSize: 13 },
  resendAction: { color: COLORS.accent, fontFamily: FONT.bold, fontSize: 13 },
  resendDisabled: { color: COLORS.text.muted },
  changeEmailButton: { paddingVertical: 18, marginTop: 4 },
  changeEmailText: { color: COLORS.text.secondary, fontFamily: FONT.medium, fontSize: 13 },
});
