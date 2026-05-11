import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { InputField } from '@/components/forms';
import { BrandMark, BrandWordmark, ScreenShell } from '@/components/layout';
import { BRAND, COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { initialize } = useAuthStore();

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email';
    if (!password) nextErrors.password = 'Password is required';
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await initialize();
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingTop: 56, paddingHorizontal: 28, paddingBottom: 34, gap: 18 }}>
            <BrandMark size={48} />
            <View>
              <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginBottom: 6 }}>Welcome back</Text>
              <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: 'rgba(248,250,252,0.55)' }}>
                Sign in to keep your records moving.
              </Text>
            </View>
          </View>

          <View style={styles.formPanel}>
            <InputField
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              required
              leftIcon={<Feather name="mail" size={16} color={COLORS.text.muted} />}
            />
            <InputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              error={errors.password}
              required
              leftIcon={<Feather name="lock" size={16} color={COLORS.text.muted} />}
              rightElement={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              }
            />

            <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 }}>
              <Text style={{ color: COLORS.accent, fontSize: 13, fontFamily: FONT.medium }}>Forgot password?</Text>
            </TouchableOpacity>

            <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg" />

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
        </ScrollView>
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
