import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { LoadingScreen } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP } from '@/constants';
import { BusinessMember, UserProfile } from '@/types';

type TeamMember = BusinessMember & { user_profiles: UserProfile };

const ROLE_COLORS: Record<string, string> = {
  owner: COLORS.accent,
  manager: COLORS.info,
  cashier: COLORS.success,
  auditor: COLORS.warning,
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  auditor: 'Auditor',
};

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const currentUserRole = useAuthStore((s) => s.userRole);
  const { fetchTeamMembers } = useBusinessStore();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!currentBusiness) return;
    try {
      const data = await fetchTeamMembers(currentBusiness.id);
      // Put owner at the top
      data.sort((a, b) => (a.role === 'owner' ? -1 : 1));
      setMembers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentBusiness, fetchTeamMembers]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMembers();
    setRefreshing(false);
  };

  const handleMemberPress = (member: TeamMember) => {
    if (currentUserRole !== 'owner' && currentUserRole !== 'manager') return;
    if (member.role === 'owner') return; // Cannot edit owner

    router.push({
      pathname: '/(app)/team/[id]',
      params: { 
        id: member.id, 
        userId: member.user_id,
        name: member.user_profiles?.full_name || 'Unnamed Staff',
        email: member.user_profiles?.email || '',
        phone: member.user_profiles?.phone || '',
        role: member.role
      },
    });
  };

  const handleCopyBusinessId = async () => {
    if (currentBusiness?.id) {
      await Clipboard.setStringAsync(currentBusiness.id);
      Alert.alert('Copied', 'Business ID copied to clipboard');
    }
  };

  if (loading && members.length === 0) {
    return <LoadingScreen message="Loading team..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.background} statusBarStyle="dark">
      <ScreenHeader
        title="Team Directory"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />

      <ScrollView
        contentContainerStyle={{ padding: SP.page, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />
        }
      >
        <View style={styles.businessIdContainer}>
          <View style={styles.businessIdHeader}>
            <Feather name="shield" size={18} color={COLORS.text.secondary} />
            <Text style={styles.businessIdTitle}>Staff Invitation ID</Text>
          </View>
          <View style={styles.businessIdRow}>
            <Text style={styles.businessIdValue} numberOfLines={1} ellipsizeMode="middle">
              {currentBusiness?.id}
            </Text>
            <TouchableOpacity onPress={handleCopyBusinessId} style={styles.copyButton}>
              <Text style={styles.copyButtonText}>Copy ID</Text>
              <Feather name="copy" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.businessIdHint}>
            Share this ID with your staff so they can join your business workspace.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Members ({members.length})</Text>

        <View style={styles.listContainer}>
          {members.map((member, index) => {
            const isLast = index === members.length - 1;
            const profile = member.user_profiles || {};
            const initials = (profile.full_name || 'U').charAt(0).toUpperCase();
            
            return (
              <TouchableOpacity
                key={member.id}
                onPress={() => handleMemberPress(member)}
                disabled={currentUserRole !== 'owner' && currentUserRole !== 'manager'}
                style={[styles.memberRow, !isLast && styles.borderBottom]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>

                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>
                      {profile.full_name || 'Unnamed Staff'}
                    </Text>
                    <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + '15' }]}>
                      <Text style={[styles.roleText, { color: ROLE_COLORS[member.role] }]}>
                        {ROLE_LABELS[member.role] || member.role}
                      </Text>
                    </View>
                  </View>
                  
                  {profile.phone ? (
                    <Text style={styles.contactText}>
                      <Feather name="phone" size={12} /> {profile.phone}
                    </Text>
                  ) : null}
                  
                  {profile.email ? (
                    <Text style={styles.contactText}>
                      <Feather name="mail" size={12} /> {profile.email}
                    </Text>
                  ) : null}

                  <Text style={styles.joinedText}>
                    Joined {new Date(member.joined_at || member.invited_at).toLocaleDateString()}
                  </Text>
                </View>

                {member.role !== 'owner' && (currentUserRole === 'owner' || currentUserRole === 'manager') && (
                  <Feather name="chevron-right" size={20} color={COLORS.border} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  businessIdContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  businessIdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  businessIdTitle: {
    fontSize: 14,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  businessIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
    gap: 16,
  },
  businessIdValue: {
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  copyButtonText: {
    fontSize: 13,
    fontFamily: FONT.medium,
    color: COLORS.primary,
  },
  businessIdHint: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginBottom: 16,
    marginLeft: 4,
  },
  listContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.secondary,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  memberName: {
    fontSize: 16,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  roleText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    textTransform: 'uppercase',
  },
  contactText: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
  },
  joinedText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  }
});
