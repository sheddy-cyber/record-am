import React, { useState } from 'react';
import { View, Text, Animated, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useAlertStore } from '@/store/alertStore';
import { useTabStore } from '@/store/tabStore';
import { Button, Card } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { BrandMark, BrandWordmark, ScreenShell } from '@/components/layout';
import { AuthBackButton, AuthProgress, useStepTransition } from '@/components/auth';
import { BRAND, BUSINESS_TYPES, COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { BusinessType } from '@/types';

const STEPS = ['Business', 'Location', 'Ready'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('provisions');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { user, setCurrentBusiness, setCurrentBranch, setUserRole } = useAuthStore();
  const { createBusiness } = useBusinessStore();
  const transition = useStepTransition(step);

  const validateStepOne = () => {
    const nextErrors: Record<string, string> = {};
    if (!businessName.trim()) nextErrors.businessName = 'Business name is required';
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleFinish = async () => {
    setLoading(true);

    try {
      let currentUser = user;
      if (!currentUser) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          useAuthStore.getState().setSession(session);
          currentUser = session.user;
        }
      }

      if (!currentUser) {
        throw new Error('User session not found. Please log in to complete business setup.');
      }

      const business = await createBusiness(
        {
          name: businessName.trim(),
          type: businessType,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          currency: 'NGN',
          currency_symbol: CURRENCY_SYMBOL,
        },
        currentUser.id
      );

      if (!business) throw new Error('Could not create business');

      const { data: branch } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_main', true)
        .single();

      setCurrentBusiness(business);
      if (branch) setCurrentBranch(branch);
      setUserRole('owner');
      useTabStore.getState().setActiveTab('dashboard');
      router.replace('/(app)/(tabs)');
    } catch (err: any) {
      useAlertStore.getState().showAlert('Setup failed', err.message || 'Could not create business. Please try again.', { type: 'danger' });
    } finally {
      setLoading(false);
    }
  };
  const handleBack = async () => {
    if (step > 0) {
      setStep((currentStep) => currentStep - 1);
      return;
    }
    
    // If on step 0, sign out and go back to login
    setLoading(true);
    try {
      await supabase.auth.signOut();
      useAuthStore.getState().signOut();
      router.replace('/(auth)/login');
    } catch (err) {
      // Fallback
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ backgroundColor: COLORS.ink, paddingTop: insets.top + 16, paddingHorizontal: SP.xl, paddingBottom: SP.xl, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandWordmark invert size={24} />
          {step === 0 && (
            <TouchableOpacity onPress={handleBack} style={{ padding: 4 }}>
              <Text style={{ color: COLORS.text.muted, fontSize: 13, fontFamily: FONT.medium }}>Sign Out</Text>
            </TouchableOpacity>
          )}
        </View>
        <AuthProgress step={step} total={STEPS.length} />
        <View>
          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.45)' }}>Step {step + 1} of {STEPS.length}</Text>
          <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 8 }}>
            {step === 0 && 'Set up your business'}
            {step === 1 && 'Where are you located?'}
            {step === 2 && 'You\u2019re all set'}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.5)', marginTop: 6 }}>
            {step === 0 && 'Tell us what your business is called and what you sell.'}
            {step === 1 && 'Add your location now or skip and fill it in later.'}
            {step === 2 && (
              <Text style={{ color: 'rgba(250,250,248,0.5)' }}>
                <Text style={{ fontStyle: 'italic' }}>{BRAND.name}</Text> is ready for your business.
              </Text>
            )}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg }}>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: SP.xl, flexGrow: 1 }}>
          <Animated.View style={[{ flex: 1 }, transition]}>
          {step === 0 ? (
            <>
              <InputField
                label="Business Name"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="e.g. Mama Emeka Stores"
                autoCapitalize="words"
                error={errors.businessName}
                required
                leftIcon={<Feather name="briefcase" size={16} color={COLORS.text.muted} />}
              />
              <SelectField
                label="Business Type"
                value={businessType}
                options={BUSINESS_TYPES}
                onChange={(value) => setBusinessType(value as BusinessType)}
                required
              />
              <InputField
                label="Business Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="08012345678"
                keyboardType="phone-pad"
                leftIcon={<Feather name="phone" size={16} color={COLORS.text.muted} />}
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <InputField
                label="Business Address"
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. 12 Adeola Street, Lagos"
                multiline
                numberOfLines={3}
                leftIcon={<Feather name="map-pin" size={16} color={COLORS.text.muted} />}
              />
              <Card variant="muted">
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Feather name="info" size={16} color={COLORS.info} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: FONT.regular, color: COLORS.info, lineHeight: 18 }}>
                    You can update the address later from Business Settings.
                  </Text>
                </View>
              </Card>
            </>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: 12 }}>
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <BrandMark size={76} />
              </View>
              {[
                { icon: 'check-circle', label: 'Business', value: businessName, color: COLORS.success },
                { icon: 'tag', label: 'Type', value: BUSINESS_TYPES.find((item) => item.value === businessType)?.label, color: COLORS.info },
                { icon: 'dollar-sign', label: 'Currency', value: `Nigerian Naira (${CURRENCY_SYMBOL})`, color: COLORS.warning },
                { icon: 'home', label: 'Branch', value: 'Main Branch (default)', color: COLORS.text.secondary },
              ].map((item) => (
                <Card key={item.label}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Feather name={item.icon as keyof typeof Feather.glyphMap} size={18} color={item.color} />
                    <View>
                      <Text style={{ ...TYPE.overline, color: COLORS.text.muted }}>{item.label}</Text>
                      <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.value}</Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 'auto', paddingTop: 24, gap: 10 }}>
            {step < 2 ? (
              <>
                <Button
                  title="Continue"
                  onPress={() => {
                    if (step === 0 && !validateStepOne()) return;
                    setStep((currentStep) => currentStep + 1);
                  }}
                  size="lg"
                />
                {step > 0 ? <Button title="Back" onPress={() => setStep((currentStep) => currentStep - 1)} variant="secondary" size="lg" /> : null}
                {step === 1 ? (
                  <TouchableOpacity onPress={() => setStep(2)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ color: COLORS.text.muted, fontSize: 14, fontFamily: FONT.regular }}>Skip for now</Text>
                  </TouchableOpacity>
                ) : null}
                {step === 0 ? (
                  <TouchableOpacity onPress={() => router.push('/(auth)/join-business')} style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <Text style={{ color: COLORS.text.secondary, fontSize: 14, fontFamily: FONT.medium }}>
                      Have a Business ID? <Text style={{ color: COLORS.accent, fontFamily: FONT.bold }}>Join Business</Text>
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <Button title={`Open ${BRAND.name}`} onPress={handleFinish} loading={loading} size="lg" variant="accent" />
            )}
          </View>
          </Animated.View>
        </KeyboardAwareScrollView>
      </View>
    </ScreenShell>
  );
}
