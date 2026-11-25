import React, { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { InputField } from '@/components/forms';
import { AuthScaffold } from '@/components/auth';
import { useAlertStore } from '@/store/alertStore';
import { formatAuthError, getAuthCallbackUrl, isValidEmail, normaliseEmail } from '@/lib/auth';
import { dismissScreen } from '@/lib/navigation';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <AuthScaffold
      onBack={() => dismissScreen()}
      title="Reset your password"
      subtitle="Enter the email you signed up with. We'll send a link, and a six-digit code if your email supports it."
    >
      <InputField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError('');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        importantForAutofill="yes"
        autoFocus
        returnKeyType="send"
        onSubmitEditing={handleReset}
        error={error}
      />
      <Button title="Send reset link" onPress={handleReset} loading={loading} size="lg" style={{ marginTop: 12 }} />
    </AuthScaffold>
  );
}
