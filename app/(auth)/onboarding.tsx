import React, { useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import { Icon, IconName } from '@/components/icons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useAlertStore } from '@/store/alertStore';
import { useTabStore } from '@/store/tabStore';
import { Button, Group, ListRow } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { AuthScaffold, useStepTransition } from '@/components/auth';
import { BRAND, BUSINESS_TYPES, COLORS, CURRENCY_SYMBOL, FONT, TYPE } from '@/constants';
import { BusinessType } from '@/types';

const STEPS = ['Business', 'Location', 'Ready'];

export default function OnboardingScreen() {
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

  const titles = ['Tell us about your business', 'Where do you trade?', "You're ready"];
  const subtitles = [
    'Your business name appears on receipts and reports.',
    'Optional. You can add or change this later in Settings.',
    'Here is what we have set up. You can change any of it later.',
  ];

  const summary: { icon: IconName; label: string; value?: string }[] = [
    { icon: 'store', label: 'Business', value: businessName.trim() },
    { icon: 'tag', label: 'Type', value: BUSINESS_TYPES.find((item) => item.value === businessType)?.label },
    { icon: 'cash', label: 'Currency', value: `Nigerian Naira (${CURRENCY_SYMBOL})` },
    { icon: 'map-pin', label: 'First branch', value: 'Main branch' },
  ];

  return (
    <AuthScaffold
      onBack={step > 0 ? handleBack : undefined}
      topRight={
        step === 0 ? (
          <Pressable onPress={handleBack} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ fontSize: 14.5, fontFamily: FONT.medium, color: COLORS.text.muted }}>Sign out</Text>
          </Pressable>
        ) : undefined
      }
      progress={{ step, total: STEPS.length }}
      eyebrow={`Step ${step + 1} of ${STEPS.length}`}
      title={titles[step]}
      subtitle={subtitles[step]}
    >
      <Animated.View style={[{ flex: 1 }, transition]}>
        {step === 0 ? (
          <>
            <InputField
              label="Business name"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Mama Emeka Stores"
              autoCapitalize="words"
              error={errors.businessName}
            />
            <SelectField
              label="What do you sell?"
              value={businessType}
              options={BUSINESS_TYPES}
              onChange={(value) => setBusinessType(value as BusinessType)}
            />
            <InputField
              label="Business phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="0801 234 5678"
              keyboardType="phone-pad"
            />
          </>
        ) : null}

        {step === 1 ? (
          <InputField
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. 12 Adeola Street, Lagos"
            multiline
            numberOfLines={3}
          />
        ) : null}

        {step === 2 ? (
          <Group>
            {summary.map((item) => (
              <ListRow key={item.label} icon={item.icon} title={item.value || '—'} subtitle={item.label} />
            ))}
          </Group>
        ) : null}

        <View style={{ marginTop: 'auto', paddingTop: 16, gap: 10 }}>
          {step === 0 ? (
            <>
              <Button
                title="Continue"
                size="lg"
                onPress={() => {
                  if (!validateStepOne()) return;
                  setStep(1);
                }}
              />
              <Pressable
                onPress={() => router.push('/(auth)/join-business')}
                style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 14, opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={{ ...TYPE.callout, fontSize: 14.5, color: COLORS.text.muted }}>
                  Joining a team? <Text style={{ color: COLORS.text.primary, fontFamily: FONT.semiBold }}>Enter a Business ID</Text>
                </Text>
              </Pressable>
            </>
          ) : step === 1 ? (
            <>
              <Button title="Continue" size="lg" onPress={() => setStep(2)} />
              <Button title="Skip for now" size="lg" variant="ghost" onPress={() => setStep(2)} />
            </>
          ) : (
            <Button title={`Open ${BRAND.name}`} onPress={handleFinish} loading={loading} size="lg" />
          )}
        </View>
      </Animated.View>
    </AuthScaffold>
  );
}
