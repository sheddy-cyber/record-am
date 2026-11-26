// ============================================================
// RECORD AM - Branches
// One place for a multi-branch owner to see every shop at a glance, move
// between them, add or edit a branch, and move stock from one to another.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Icon } from '@/components/icons';
import { BottomSheetModal, Button, IconButton, PermissionDenied, Pill, PressableScale } from '@/components/ui';
import { InputField, Toggle } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, SP, TYPE } from '@/constants';
import { BranchTodayStats, fetchBranchTodayStats, invalidateBranchTodayStats, peekBranchTodayStats } from '@/lib/branchStats';
import { haptics } from '@/lib/haptics';
import { dismissScreen } from '@/lib/navigation';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { BranchHasRecordsError, isBranchOpen } from '@/lib/branches';
import { Branch, Product } from '@/types';

const money = (v: number) => `${CURRENCY_SYMBOL}${Math.round(v).toLocaleString('en-NG')}`;
const count = (v: number) => Number(v || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

const stockIn = (product: Product, branchId: string) =>
  Number(product.inventory?.find((inv) => inv.branch_id === branchId)?.quantity ?? 0);

export default function BranchesScreen() {
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const currentBranchId = useAuthStore((s) => s.currentBranch?.id);
  const isOwner = useAuthStore((s) => s.userRole === 'owner');
  const branches = useBusinessStore((s) => s.branches);
  const products = useBusinessStore((s) => s.products);
  const { fetchBranches, fetchProducts, createBranch, updateBranch, deleteBranch, setBranchOpen, setMainBranch, transferBranchStock } =
    useBusinessStore.getState();

  const [stats, setStats] = useState<Record<string, BranchTodayStats> | null>(() =>
    businessId ? peekBranchTodayStats(businessId) : null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Branch form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [makeMain, setMakeMain] = useState(false);
  const [saving, setSaving] = useState(false);

  // Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [productId, setProductId] = useState('');
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [moving, setMoving] = useState(false);

  const sorted = useMemo(
    () => [...branches].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.name.localeCompare(b.name)),
    [branches],
  );
  // Closed branches keep their history but drop out of day-to-day lists.
  const ordered = useMemo(() => sorted.filter(isBranchOpen), [sorted]);
  const closed = useMemo(() => sorted.filter((b) => !isBranchOpen(b)), [sorted]);

  const unitsByBranch = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of products) {
      if (p.is_service) continue;
      for (const inv of p.inventory ?? []) out[inv.branch_id] = (out[inv.branch_id] ?? 0) + Math.max(0, Number(inv.quantity ?? 0));
    }
    return out;
  }, [products]);

  const load = useCallback(
    async (force = false) => {
      if (!businessId) return;
      try {
        const list = await fetchBranches(businessId);
        const fresh = await fetchBranchTodayStats(
          businessId,
          list.map((b) => b.id),
          { force },
        );
        setStats(fresh);
      } catch (err) {
        console.warn('[Branches] load failed', err);
      } finally {
        setRefreshing(false);
      }
      fetchProducts(businessId, true).catch(() => {});
    },
    [businessId, fetchBranches, fetchProducts],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const values = stats ? Object.values(stats) : [];
    return {
      revenue: values.reduce((s, v) => s + v.todayRevenue, 0),
      sales: values.reduce((s, v) => s + v.todayCount, 0),
      units: Object.values(unitsByBranch).reduce((s, v) => s + v, 0),
    };
  }, [stats, unitsByBranch]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const switchTo = async (branch: Branch) => {
    if (branch.id === currentBranchId) return;
    haptics.selection();
    setSwitchingId(branch.id);
    try {
      await useAuthStore.getState().switchBranch(branch);
      Toast.show({ type: 'info', text1: branch.name, text2: 'You are now working in this branch.' });
    } finally {
      setSwitchingId(null);
    }
  };

  const openForm = (branch?: Branch) => {
    setEditing(branch ?? null);
    setName(branch?.name ?? '');
    setAddress(branch?.address ?? '');
    setPhone(branch?.phone ?? '');
    setMakeMain(false);
    setFormOpen(true);
  };

  const saveBranch = async () => {
    if (!businessId) return;
    if (!name.trim()) {
      Alert.alert('Name needed', 'Give the branch a name your team will recognise, like “Yaba” or “Main market”.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateBranch(editing.id, { name: name.trim(), address: address.trim(), phone: phone.trim() });
        if (currentBranchId === updated.id) useAuthStore.getState().setCurrentBranch(updated);
        Toast.show({ type: 'success', text1: 'Branch updated', text2: updated.name });
      } else {
        const created = await createBranch(businessId, {
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          is_main: makeMain,
        });
        Toast.show({ type: 'success', text1: 'Branch added', text2: `${created.name} is ready. Assign staff to it from Team.` });
      }
      setFormOpen(false);
      invalidateBranchTodayStats(businessId);
      void load(true);
    } catch (err: any) {
      Alert.alert('Could not save branch', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const showBranchMenu = (branch: Branch) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Edit details', onPress: () => openForm(branch) },
    ];
    if (!branch.is_main) {
      buttons.push({
        text: 'Make main branch',
        onPress: async () => {
          if (!businessId) return;
          try {
            await setMainBranch(businessId, branch.id);
            if (currentBranchId === branch.id) useAuthStore.getState().setCurrentBranch({ ...branch, is_main: true });
            Toast.show({ type: 'success', text1: `${branch.name} is now your main branch` });
          } catch (err: any) {
            Alert.alert('Could not change main branch', err?.message || 'Please try again.');
          }
        },
      });
      buttons.push({ text: 'Close branch', onPress: () => confirmClose(branch) });
      buttons.push({ text: 'Delete branch', style: 'destructive', onPress: () => confirmDelete(branch) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(branch.name, branch.address || undefined, buttons as any);
  };

  const leaveIfCurrent = async (branchId: string) => {
    if (currentBranchId !== branchId) return;
    const fallback = ordered.find((b) => b.id !== branchId && b.is_main) || ordered.find((b) => b.id !== branchId);
    if (fallback) await useAuthStore.getState().switchBranch(fallback);
  };

  const closeBranch = async (branch: Branch) => {
    if (!businessId) return;
    try {
      await setBranchOpen(businessId, branch.id, false);
      await leaveIfCurrent(branch.id);
      Toast.show({ type: 'success', text1: `${branch.name} closed`, text2: 'Its sales and records are kept.' });
      void load(true);
    } catch (err: any) {
      Alert.alert('Could not close branch', err?.message || 'Please try again.');
    }
  };

  const confirmClose = (branch: Branch) => {
    Alert.alert(
      `Close ${branch.name}?`,
      'It disappears from the branch switcher and staff lists, and staff working there move to the main branch. All of its sales and records are kept, and you can reopen it at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close branch', onPress: () => void closeBranch(branch) },
      ],
    );
  };

  const reopenBranch = async (branch: Branch) => {
    if (!businessId) return;
    try {
      await setBranchOpen(businessId, branch.id, true);
      Toast.show({ type: 'success', text1: `${branch.name} reopened` });
      void load(true);
    } catch (err: any) {
      Alert.alert('Could not reopen branch', err?.message || 'Please try again.');
    }
  };

  const confirmDelete = (branch: Branch) => {
    Alert.alert(
      `Delete ${branch.name}?`,
      'Only a branch with no sales or other records can be deleted. Stock still in this branch will be lost, so move it first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!businessId) return;
            try {
              await deleteBranch(businessId, branch.id);
              await leaveIfCurrent(branch.id);
              Toast.show({ type: 'success', text1: 'Branch deleted' });
              void load(true);
            } catch (err: any) {
              if (err instanceof BranchHasRecordsError) {
                Alert.alert(`${branch.name} has records`, err.message, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Close branch', onPress: () => void closeBranch(branch) },
                ]);
                return;
              }
              Alert.alert('Could not delete branch', err?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  // ── Transfer ───────────────────────────────────────────────────────────────
  const openTransfer = () => {
    if (ordered.length < 2) {
      Alert.alert('Add another branch first', 'Stock can only move between two open branches.');
      return;
    }
    const from = ordered.some((b) => b.id === currentBranchId) ? currentBranchId! : ordered[0].id;
    setFromId(from);
    setToId(ordered.find((b) => b.id !== from)?.id ?? '');
    setProductId('');
    setQuery('');
    setQty('');
    setNote('');
    setTransferOpen(true);
  };

  const movable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !p.is_service && p.is_active && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => stockIn(b, fromId) - stockIn(a, fromId) || a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [products, query, fromId]);

  const selected = products.find((p) => p.id === productId) ?? null;
  const available = selected ? stockIn(selected, fromId) : 0;
  const qtyNum = Number(qty);
  const qtyError =
    qty && (!Number.isFinite(qtyNum) || qtyNum <= 0)
      ? 'Enter a quantity above zero'
      : selected && qtyNum > available
      ? `Only ${count(available)} available in ${branches.find((b) => b.id === fromId)?.name ?? 'this branch'}`
      : undefined;

  const doTransfer = async () => {
    if (!businessId || !selected || !qtyNum || qtyError || fromId === toId) return;
    setMoving(true);
    try {
      await transferBranchStock({ businessId, productId: selected.id, fromBranchId: fromId, toBranchId: toId, quantity: qtyNum, notes: note });
      haptics.success();
      setTransferOpen(false);
      Toast.show({
        type: 'success',
        text1: 'Stock moved',
        text2: `${count(qtyNum)} ${selected.unit} of ${selected.name} to ${branches.find((b) => b.id === toId)?.name}`,
      });
    } catch (err: any) {
      Alert.alert('Could not move stock', err?.message || 'Please try again.');
    } finally {
      setMoving(false);
    }
  };

  if (!isOwner) {
    return (
      <ScreenShell>
        <ScreenHeader title="Branches" left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />} />
        <PermissionDenied
          title="Only the owner manages branches"
          description="Ask the business owner if you need to work in a different branch."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScreenHeader
        title="Branches"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={<IconButton icon="plus" variant="filled" onPress={() => openForm()} accessibilityLabel="Add branch" />}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: 56 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={COLORS.text.muted}
            colors={[COLORS.accent]}
          />
        }
      >
        {/* ── All branches today ─────────────────────────────────────── */}
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Today across all branches</Text>
          {stats ? (
            <Text style={styles.total}>{money(totals.revenue)}</Text>
          ) : (
            <ActivityIndicator style={{ alignSelf: 'flex-start', marginVertical: 18 }} color={COLORS.text.muted} />
          )}
          <Text style={styles.meta}>
            {totals.sales} {totals.sales === 1 ? 'sale' : 'sales'} · {ordered.length} {ordered.length === 1 ? 'branch' : 'branches'} ·{' '}
            {count(totals.units)} units in stock
          </Text>
        </View>

        <View style={styles.actions}>
          <PressableScale onPress={() => openForm()} containerStyle={{ flex: 1 }} style={styles.action}>
            <Icon name="store" size={20} color={COLORS.text.primary} />
            <Text style={styles.actionText}>Add branch</Text>
          </PressableScale>
          <PressableScale onPress={openTransfer} containerStyle={{ flex: 1 }} style={styles.action}>
            <Icon name="repeat" size={20} color={COLORS.text.primary} />
            <Text style={styles.actionText}>Move stock</Text>
          </PressableScale>
        </View>

        {/* ── Branch list ─────────────────────────────────────────────── */}
        <Text style={styles.section}>Your branches</Text>
        <View style={{ gap: 10 }}>
          {ordered.map((branch) => {
            const here = branch.id === currentBranchId;
            const s = stats?.[branch.id];
            return (
              <View key={branch.id} style={[styles.card, here && styles.cardHere]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[styles.badge, here && { backgroundColor: COLORS.ink }]}>
                    <Icon name="store" size={18} color={here ? '#FFFFFF' : COLORS.text.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {branch.name}
                      </Text>
                      {branch.is_main ? <Text style={styles.tag}>Main</Text> : null}
                    </View>
                    <Text style={styles.address} numberOfLines={1}>
                      {branch.address || 'No address yet'}
                      {branch.phone ? ` · ${branch.phone}` : ''}
                    </Text>
                  </View>
                  <IconButton icon="more-horizontal" variant="plain" size={34} onPress={() => showBranchMenu(branch)} accessibilityLabel={`${branch.name} options`} />
                </View>

                <View style={styles.figures}>
                  <Figure value={s ? money(s.todayRevenue) : '–'} label="today" />
                  <Figure value={s ? String(s.todayCount) : '–'} label={s?.todayCount === 1 ? 'sale' : 'sales'} />
                  <Figure value={count(unitsByBranch[branch.id] ?? 0)} label="units" />
                  <Figure value={s ? String(s.staffCount) : '–'} label="staff" />
                </View>

                {here ? (
                  <View style={styles.hereRow}>
                    <Icon name="check" size={15} color={COLORS.successText} strokeWidth={2.2} />
                    <Text style={styles.hereText}>You are working here</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => switchTo(branch)}
                    disabled={Boolean(switchingId)}
                    style={({ pressed }) => [styles.switch, pressed && { opacity: 0.7 }]}
                  >
                    {switchingId === branch.id ? (
                      <ActivityIndicator size="small" color={COLORS.text.primary} />
                    ) : (
                      <Text style={styles.switchText}>Switch to {branch.name}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        {closed.length > 0 ? (
          <>
            <Text style={styles.section}>Closed branches</Text>
            <View style={{ gap: 10 }}>
              {closed.map((branch) => {
                const here = branch.id === currentBranchId;
                return (
                  <View key={branch.id} style={[styles.card, here && styles.cardHere]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={styles.badge}>
                        <Icon name="store" size={18} color={COLORS.text.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: COLORS.text.secondary }]} numberOfLines={1}>
                          {branch.name}
                        </Text>
                        <Text style={styles.address} numberOfLines={2}>
                          {here ? 'You are viewing its records. ' : ''}Closed. Its sales and records are kept.
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      {here ? null : (
                        <Pressable
                          onPress={() => switchTo(branch)}
                          disabled={Boolean(switchingId)}
                          style={({ pressed }) => [styles.switch, { flex: 1 }, pressed && { opacity: 0.7 }]}
                        >
                          {switchingId === branch.id ? (
                            <ActivityIndicator size="small" color={COLORS.text.primary} />
                          ) : (
                            <Text style={styles.switchText}>View records</Text>
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => void reopenBranch(branch)}
                        style={({ pressed }) => [styles.switch, { flex: 1 }, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.switchText}>Reopen</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.footnote}>
          Each branch keeps its own stock, sales, expenses and debts. Products and customers are shared across the business. A
          branch with sales can be closed but not deleted, so its history is never lost.
        </Text>
      </ScrollView>

      {/* ── Add / edit sheet ─────────────────────────────────────────── */}
      <BottomSheetModal
        visible={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editing ? 'Edit branch' : 'New branch'}
        subtitle={editing ? undefined : 'Stock, sales and debts are tracked separately for each branch.'}
        scroll={false}
      >
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
          <InputField label="Name" value={name} onChangeText={setName} placeholder="e.g. Yaba" autoCapitalize="words" autoFocus={!editing} />
          <InputField label="Address (optional)" value={address} onChangeText={setAddress} placeholder="Street, market or plaza" />
          <InputField label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="0801 234 5678" keyboardType="phone-pad" />
          {!editing ? (
            <Toggle label="Make this the main branch" description="The main branch is the default for new staff." value={makeMain} onChange={setMakeMain} />
          ) : null}
          <Button title={editing ? 'Save changes' : 'Add branch'} onPress={saveBranch} loading={saving} size="lg" style={{ marginTop: 4 }} />
        </ScrollView>
      </BottomSheetModal>

      {/* ── Move stock sheet ─────────────────────────────────────────── */}
      <BottomSheetModal visible={transferOpen} onClose={() => !moving && setTransferOpen(false)} title="Move stock" maxHeight="92%" scroll={false}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>From</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {ordered.map((b) => (
              <Pill
                key={b.id}
                label={b.name}
                active={fromId === b.id}
                onPress={() => {
                  setFromId(b.id);
                  if (toId === b.id) setToId(ordered.find((x) => x.id !== b.id)?.id ?? '');
                }}
              />
            ))}
          </ScrollView>
          <Text style={styles.fieldLabel}>To</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {ordered
              .filter((b) => b.id !== fromId)
              .map((b) => (
                <Pill key={b.id} label={b.name} active={toId === b.id} onPress={() => setToId(b.id)} />
              ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Product</Text>
          {selected ? (
            <Pressable onPress={() => setProductId('')} style={({ pressed }) => [styles.picked, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{selected.name}</Text>
                <Text style={styles.address}>
                  {count(stockIn(selected, fromId))} in {branches.find((b) => b.id === fromId)?.name} · {count(stockIn(selected, toId))} in{' '}
                  {branches.find((b) => b.id === toId)?.name}
                </Text>
              </View>
              <Text style={styles.change}>Change</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.search}>
                <Icon name="search" size={16} color={COLORS.text.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Find a product"
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.searchInput}
                />
              </View>
              <View style={styles.list}>
                {movable.length === 0 ? (
                  <Text style={[styles.address, { padding: 14 }]}>No products match.</Text>
                ) : (
                  movable.map((p, i) => {
                    const have = stockIn(p, fromId);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          haptics.selection();
                          setProductId(p.id);
                        }}
                        disabled={have <= 0}
                        style={({ pressed }) => [
                          styles.listRow,
                          i < movable.length - 1 && styles.listDivider,
                          pressed && { backgroundColor: COLORS.surface2 },
                          have <= 0 && { opacity: 0.4 },
                        ]}
                      >
                        <Text style={[styles.listName]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.listQty}>{count(have)}</Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </>
          )}

          {selected ? (
            <>
              <InputField
                label="Quantity"
                value={qty}
                onChangeText={setQty}
                keyboardType="decimal-pad"
                placeholder="0"
                suffix={selected.unit}
                error={qtyError}
                hint={!qtyError ? `${count(available)} available` : undefined}
                containerStyle={{ marginTop: 16 }}
              />
              <InputField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Weekend restock for Yaba" />
              <Button
                title="Move stock"
                onPress={doTransfer}
                loading={moving}
                disabled={!qtyNum || Boolean(qtyError) || !toId}
                size="lg"
              />
            </>
          ) : null}
        </ScrollView>
      </BottomSheetModal>
    </ScreenShell>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.figValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.figLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary },
  total: { fontSize: 40, lineHeight: 48, fontFamily: FONT.display, color: COLORS.text.primary, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  action: {
    height: 56,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  section: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3, marginTop: 28, marginBottom: 10 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 14,
    gap: 14,
  },
  cardHere: { borderColor: COLORS.text.primary, borderWidth: 1 },
  badge: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.25, flexShrink: 1 },
  tag: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  address: { ...TYPE.footnote, color: COLORS.text.muted, marginTop: 2 },
  figures: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  figValue: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  figLabel: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 },
  hereRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, justifyContent: 'center', backgroundColor: COLORS.successLight, borderRadius: 12 },
  hereText: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.successText },
  switch: { height: 40, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 14, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  footnote: { ...TYPE.footnote, color: COLORS.text.muted, lineHeight: 17, marginTop: 14, paddingHorizontal: 4 },
  fieldLabel: { fontSize: 13.5, fontFamily: FONT.medium, color: COLORS.text.secondary, marginBottom: 8, marginTop: 4 },
  pills: { gap: 8, paddingBottom: 14 },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.text.primary,
    padding: 14,
    gap: 10,
  },
  change: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.accentDark },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 13, backgroundColor: COLORS.surface2, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15.5, fontFamily: FONT.regular, color: COLORS.text.primary, paddingVertical: 0 },
  list: {
    marginTop: 10,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
    maxHeight: 300,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 46, gap: 10 },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  listName: { flex: 1, fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.primary },
  listQty: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary, fontVariant: ['tabular-nums'] },
});
