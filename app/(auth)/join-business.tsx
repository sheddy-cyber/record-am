import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTabStore } from '@/store/tabStore';
import { Button, Card } from '@/components/ui';
import { InputField, KeyboardAwareScrollView } from '@/components/forms';
import { BrandWordmark, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import { Business } from '@/types';

export default function JoinBusinessScreen() {
  const insets = useSafeAreaInsets();
  const [businessId, setBusinessId] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user, setCurrentBusiness, setCurrentBranch, setUserRole } = useAuthStore();

  const handleJoin = async () => {
    if (!businessId.trim()) {
      Alert.alert('Error', 'Please enter a Business ID');
      return;
    }

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
        throw new Error('User session not found. Please log in first.');
      }

      // Call the RPC to join the business and get the details
      const { data, error: rpcError } = await supabase.rpc('join_business_by_id', {
        p_business_id: businessId.trim()
      });

      if (rpcError || !data) {
        throw new Error(rpcError?.message || 'Failed to join business.');
      }

      // The RPC returns a JSON object with { business, branch, role }
      const { business, branch, role } = data as { business: Business, branch: any, role: string };

      setCurrentBusiness(business);
      setCurrentBranch(branch);
      setUserRole(role as any);
      useTabStore.getState().setActiveTab('dashboard');
      router.replace('/(app)/(tabs)');

    } catch (err: any) {
      Alert.alert('Join Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ backgroundColor: COLORS.ink, paddingTop: insets.top + 16, paddingHorizontal: SP.xl, paddingBottom: SP.xl, gap: 18 }}>
        <BrandWordmark invert size={24} />
        <View>
          <Text style={{ ...TYPE.h1, color: COLORS.text.inverse, marginTop: 8 }}>
            Join a Business
          </Text>
          <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: 'rgba(250,250,248,0.5)', marginTop: 6 }}>
            Enter the Business ID provided by your manager to link your account.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg }}>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: SP.xl, flexGrow: 1 }}>
          <InputField
            label="Business ID"
            value={businessId}
            onChangeText={setBusinessId}
            placeholder="e.g. 123e4567-e89b-12d3..."
            autoCapitalize="none"
            required
            hint="Paste the Business ID provided by the owner to link this account to their business."
          />

          <View style={{ marginTop: 'auto', paddingTop: 24, gap: 10 }}>
            <Button title="Join Business" onPress={handleJoin} loading={loading} size="lg" variant="accent" />
            <Button title="Cancel" onPress={() => router.back()} variant="ghost" size="lg" />
          </View>
        </KeyboardAwareScrollView>
      </View>
    </ScreenShell>
  );
}
