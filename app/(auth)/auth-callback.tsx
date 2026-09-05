import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, LoadingScreen } from '@/components/ui';
import { BrandWordmark, ScreenShell } from '@/components/layout';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { COLORS, FONT } from '@/constants';
import { formatAuthError, getAuthFlow, type AuthFlow } from '@/lib/auth';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFlow(flowValue: string | undefined, typeValue: string | undefined): AuthFlow {
  if (flowValue) return getAuthFlow(flowValue);
  if (typeValue === 'recovery') return 'recovery';
  if (typeValue === 'signup') return 'signup';
  return 'login';
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const code = first(params.code);
  const accessToken = first(params.access_token);
  const refreshToken = first(params.refresh_token);
  const callbackError = first(params.error_description) ?? first(params.error);
  const flow = useMemo(() => resolveFlow(first(params.flow), first(params.type)), [params.flow, params.type]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const finishAuthentication = async () => {
      try {
        if (callbackError) throw new Error(callbackError);

        let session = null;
        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          session = data.session;
        } else if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          session = data.session;
        } else {
          session = (await supabase.auth.getSession()).data.session;
        }

        if (!session) throw new Error('This email link is invalid or has expired.');
        useAuthStore.getState().setSession(session);

        if (flow === 'recovery') {
          router.replace({ pathname: '/(auth)/reset-password', params: { recovery: '1' } });
          return;
        }

        await useAuthStore.getState().initialize();
        router.replace(flow === 'signup' ? '/(auth)/onboarding' : '/');
      } catch (authError) {
        if (active) setError(formatAuthError(authError, 'This email link is invalid or has expired.'));
      }
    };

    finishAuthentication();
    return () => { active = false; };
  }, [accessToken, callbackError, code, flow, refreshToken]);

  if (!error) return <LoadingScreen message="Verifying secure link…" />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="dark">
      <View style={styles.content}>
        <BrandWordmark />
        <View style={styles.icon}><Feather name="alert-circle" size={28} color={COLORS.danger} /></View>
        <Text style={styles.title}>We couldn&apos;t verify that link</Text>
        <Text style={styles.message}>{error}</Text>
        <Button title="Back to sign in" onPress={() => router.replace('/(auth)/login')} size="lg" style={styles.button} />
        <TouchableOpacity onPress={() => router.replace('/(auth)/forgot-password')} style={styles.secondaryAction}>
          <Text style={styles.secondaryText}>Request a new password reset email</Text>
        </TouchableOpacity>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center', marginTop: 48, marginBottom: 20 },
  title: { color: COLORS.text.primary, fontFamily: FONT.bold, fontSize: 24, textAlign: 'center', marginBottom: 10 },
  message: { color: COLORS.text.secondary, fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { width: '100%', marginTop: 30 },
  secondaryAction: { padding: 18, marginTop: 2 },
  secondaryText: { color: COLORS.text.secondary, fontFamily: FONT.medium, fontSize: 13 },
});
