import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandWordmark, ScreenShell } from '@/components/layout';
import { useAlertStore } from '@/store/alertStore';
import { COLORS, FONT, RADIUS } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAuthError, getAuthCallbackUrl, isValidEmail, normaliseEmail } from '@/lib/auth';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  const handleReset = async () => {
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(normaliseEmail(email), {
        redirectTo: getAuthCallbackUrl('recovery'),
      });
      if (requestError) throw requestError;

      // Do not disclose whether the address exists. This is the same response
      // for every successful request to protect account privacy.
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: normaliseEmail(email), flow: 'recovery' },
      });
    } catch (requestError) {
      const message = formatAuthError(requestError);
      setError(message);
      useAlertStore.getState().showAlert('Could not send email', message, { type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: COLORS.surface }}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back to sign in">
            <Feather name="arrow-left" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          <BrandWordmark />
        </View>

        <View style={styles.content}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we&apos;ll send secure reset instructions. Use the link in the email, or enter its six-digit code if one is included.
            </Text>
          </View>

          <InputField
            label="Email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={(text) => { setEmail(text); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            autoFocus
            returnKeyType="send"
            onSubmitEditing={handleReset}
            error={error}
            required
            leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
          />
        </View>

        <View style={styles.footer}>
          <Button title="Send reset instructions" onPress={handleReset} loading={loading} size="lg" icon="send" />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 16 },
  backButton: { padding: 4, marginLeft: -4 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
  titleContainer: { marginBottom: 40 },
  title: { fontSize: 28, fontFamily: FONT.black, color: COLORS.text.primary, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 22 },
  footer: { padding: 24, paddingBottom: 48 },
});
