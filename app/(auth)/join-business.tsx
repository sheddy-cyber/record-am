import React, { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTabStore } from '@/store/tabStore';
import { Button, showAlertDialog } from '@/components/ui';
import { AuthScaffold } from '@/components/auth';
import { InputField } from '@/components/forms';
import { Business } from '@/types';
import { dismissScreen } from '@/lib/navigation';

export default function JoinBusinessScreen() {
  const [businessId, setBusinessId] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user, setCurrentBusiness, setCurrentBranch, setUserRole, setStaffId } = useAuthStore();

  const handleJoin = async () => {
    if (!businessId.trim()) {
      showAlertDialog('Business ID needed', 'Paste the Business ID your manager shared with you.');
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

      // Call the RPC to join the business and get the details (including generated staff_id)
      const { data, error: rpcError } = await supabase.rpc('join_business_by_id', {
        p_business_id: businessId.trim(),
      });

      if (rpcError || !data) {
        throw new Error(rpcError?.message || 'Failed to join business.');
      }

      const payload = data as {
        success?: boolean;
        error?: string;
        business?: Business;
        branch?: any;
        role?: string;
        staff_id?: string;
        member?: { role?: string; staff_id?: string };
      };

      if (payload.success === false) {
        throw new Error(payload.error || 'Failed to join business.');
      }

      const assignedStaffId = payload.staff_id || payload.member?.staff_id || null;
      const assignedRole = payload.role || payload.member?.role || 'cashier';

      if (payload.business) setCurrentBusiness(payload.business);
      if (payload.branch) setCurrentBranch(payload.branch);
      setUserRole(assignedRole as any);
      setStaffId(assignedStaffId);
      useTabStore.getState().setActiveTab('dashboard');

      const navNext = () => router.replace('/(app)/(tabs)');
      if (assignedStaffId) {
        Alert.alert(
          'Joined Business',
          `Welcome to ${payload.business?.name ?? 'the team'}!\n\nYour Staff ID is ${assignedStaffId}.`,
          [{ text: 'Continue', onPress: navNext }],
        );
      } else {
        navNext();
      }
    } catch (err: any) {
      showAlertDialog('Could not join', err.message || 'Check the Business ID and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold
      onBack={() => dismissScreen()}
      title="Join your team"
      subtitle="Ask the business owner for their Business ID. You'll find it under More → Team."
    >
      <InputField
        label="Business ID"
        value={businessId}
        onChangeText={setBusinessId}
        placeholder="Paste the ID here"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />
      <Button title="Join business" onPress={handleJoin} loading={loading} size="lg" style={{ marginTop: 12 }} />
    </AuthScaffold>
  );
}
