// ============================================================
// RECORD AM - Branch switcher
// The one place a multi-branch owner changes which shop they're looking at.
// Opens from the branch pill on Home (and anywhere else that needs it).
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Icon } from '@/components/icons';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { COLORS, CURRENCY_SYMBOL, FONT, TYPE } from '@/constants';
import { BranchTodayStats, fetchBranchTodayStats, peekBranchTodayStats } from '@/lib/branchStats';
import { haptics } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Branch } from '@/types';

const money = (v: number) =>
  `${CURRENCY_SYMBOL}${Math.round(v).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/** Whether the current user can move between branches. */
export function useCanSwitchBranch() {
  const role = useAuthStore((s) => s.userRole);
  const count = useBusinessStore((s) => s.branches.length);
  return role === 'owner' && count > 1;
}

export function BranchSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const currentBranchId = useAuthStore((s) => s.currentBranch?.id);
  const isOwner = useAuthStore((s) => s.userRole === 'owner');
  const branches = useBusinessStore((s) => s.branches);
  const [stats, setStats] = useState<Record<string, BranchTodayStats> | null>(() =>
    businessId ? peekBranchTodayStats(businessId) : null,
  );
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...branches].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.name.localeCompare(b.name)),
    [branches],
  );

  useEffect(() => {
    if (!visible || !businessId || branches.length === 0) return;
    let active = true;
    fetchBranchTodayStats(
      businessId,
      branches.map((b) => b.id),
    )
      .then((data) => active && setStats(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, businessId, branches]);

  const total = stats ? Object.values(stats).reduce((s, v) => s + v.todayRevenue, 0) : null;

  const choose = async (branch: Branch) => {
    if (branch.id === currentBranchId) {
      onClose();
      return;
    }
    haptics.selection();
    setSwitchingTo(branch.id);
    try {
      await useAuthStore.getState().switchBranch(branch);
      onClose();
      Toast.show({ type: 'info', text1: branch.name, text2: 'You are now viewing this branch.' });
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Branches"
      subtitle={total !== null ? `${money(total)} taken across all branches today` : 'Choose the branch to work in'}
      maxHeight="80%"
    >
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          {ordered.map((branch, index) => {
            const active = branch.id === currentBranchId;
            const s = stats?.[branch.id];
            return (
              <Pressable
                key={branch.id}
                onPress={() => choose(branch)}
                disabled={Boolean(switchingTo)}
                style={({ pressed }) => [
                  styles.row,
                  index < ordered.length - 1 && styles.rowDivider,
                  pressed && { backgroundColor: COLORS.surface2 },
                ]}
              >
                <View style={[styles.badge, active && { backgroundColor: COLORS.ink }]}>
                  <Icon name="store" size={17} color={active ? '#FFFFFF' : COLORS.text.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {branch.name}
                    </Text>
                    {branch.is_main ? <Text style={styles.mainTag}>Main</Text> : null}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {s
                      ? `${money(s.todayRevenue)} today · ${s.todayCount} ${s.todayCount === 1 ? 'sale' : 'sales'}`
                      : branch.address || 'Loading today’s figures…'}
                  </Text>
                </View>
                {switchingTo === branch.id ? (
                  <ActivityIndicator size="small" color={COLORS.text.muted} />
                ) : active ? (
                  <Icon name="check" size={19} color={COLORS.accent} strokeWidth={2.2} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {isOwner ? (
          <Pressable
            onPress={() => {
              onClose();
              router.push('/(app)/branches' as any);
            }}
            style={({ pressed }) => [styles.manage, pressed && { opacity: 0.6 }]}
          >
            <Icon name="sliders" size={17} color={COLORS.text.secondary} />
            <Text style={styles.manageText}>Manage branches and transfers</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text.faint} />
          </Pressable>
        ) : null}
      </ScrollView>
    </BottomSheetModal>
  );
}

/** The small pill that shows the active branch and opens the switcher. */
export function BranchPill({ onPress }: { onPress: () => void }) {
  const name = useAuthStore((s) => s.currentBranch?.name);
  const canSwitch = useCanSwitchBranch();
  if (!name) return null;
  return (
    <Pressable
      onPress={canSwitch ? onPress : undefined}
      disabled={!canSwitch}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
      accessibilityRole={canSwitch ? 'button' : 'text'}
      accessibilityLabel={canSwitch ? `Branch: ${name}. Switch branch` : `Branch: ${name}`}
    >
      <Icon name="map-pin" size={13} color={COLORS.text.secondary} />
      <Text style={styles.pillText} numberOfLines={1}>
        {name}
      </Text>
      {canSwitch ? <Icon name="chevron-down" size={13} color={COLORS.text.secondary} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, flexShrink: 1, letterSpacing: -0.2 },
  mainTag: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  meta: { ...TYPE.footnote, color: COLORS.text.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  manage: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 4, marginTop: 4 },
  manageText: { flex: 1, fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface2,
    maxWidth: 220,
  },
  pillText: { fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary },
});

/** "Ikeja branch" when the business has more than one branch, so records never land in the wrong shop. */
export function useBranchSubtitle(): string | undefined {
  const name = useAuthStore((s) => s.currentBranch?.name);
  const many = useBusinessStore((s) => s.branches.length > 1);
  return many && name ? `${name} branch` : undefined;
}
