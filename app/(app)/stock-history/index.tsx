import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Badge, Button, EmptyState, PermissionDenied } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from "@/constants";
import { readAltUnitNote } from '@/lib/records';
import { printStockMovementReport } from '@/lib/reports';
import { StockMovement } from '@/types';
import { canViewFinancialData, hasPermission } from '@/lib/permissions';
import { attachProductSummaries } from '@/lib/dataAccess';
import { dismissScreen } from '@/lib/navigation';

const MOVEMENT_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    variant: 'success' | 'danger' | 'warning' | 'neutral' | 'primary';
    icon: keyof typeof Feather.glyphMap;
  }
> = {
  stock_in: { label: 'Stock In', color: COLORS.success, variant: 'success', icon: 'arrow-down-left' },
  stock_out: { label: 'Stock Out', color: COLORS.danger, variant: 'danger', icon: 'arrow-up-right' },
  adjustment: { label: 'Adjustment', color: COLORS.accent, variant: 'primary', icon: 'sliders' },
  transfer: { label: 'Transfer', color: COLORS.warning, variant: 'warning', icon: 'repeat' },
  damage: { label: 'Damaged', color: COLORS.danger, variant: 'danger', icon: 'x-octagon' },
  wastage: { label: 'Wastage', color: COLORS.warning, variant: 'warning', icon: 'trash-2' },
};

const formatCurrency = (value: number) => `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

type PeriodPreset = 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'custom';
type DatePickerTarget = 'start' | 'end' | null;

const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom range' },
];

const STOCK_MOVEMENTS_PAGE_SIZE = 1000;

export default function StockHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, userRole } = useAuthStore();
  const canViewStockHistory = hasPermission(userRole, 'stock-history.view');
  const canViewCosts = canViewFinancialData(userRole);
  const canExportStockHistory = hasPermission(userRole, 'stock-history.export');

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStartDate, setCustomStartDate] = useState(() => startOfDay(subDays(new Date(), 29)));
  const [customEndDate, setCustomEndDate] = useState(() => endOfDay(new Date()));
  const [periodSheetVisible, setPeriodSheetVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'last_7_days':
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case 'last_30_days':
        return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case 'custom':
        return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
      default:
        return { start: null, end: null };
    }
  }, [customEndDate, customStartDate, period]);

  const periodLabel = useMemo(() => {
    if (period === 'all') return 'All time';
    if (period === 'today') return 'Today';
    if (period === 'last_7_days') return 'Last 7 days';
    if (period === 'last_30_days') return 'Last 30 days';
    if (format(customStartDate, 'yyyy-MM-dd') === format(customEndDate, 'yyyy-MM-dd')) {
      return format(customStartDate, 'MMM d, yyyy');
    }
    return `${format(customStartDate, 'MMM d')} – ${format(customEndDate, 'MMM d, yyyy')}`;
  }, [customEndDate, customStartDate, period]);

  const load = useCallback(async () => {
    if (!canViewStockHistory || !currentBusiness || !currentBranch) return;

    setLoading(true);
    try {
      const allMovements: StockMovement[] = [];
      let offset = 0;

      // Fetch every page so a long selected period is not silently truncated in the printout.
      while (true) {
        const applyDateFilters = <T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
          query: T,
        ) => {
          let filtered = query;
          if (dateRange.start) {
            filtered = filtered.gte('created_at', dateRange.start.toISOString());
          }
          if (dateRange.end) {
            filtered = filtered.lte('created_at', dateRange.end.toISOString());
          }
          return filtered;
        };

        const { data, error } = canViewCosts
          ? await applyDateFilters(
              supabase
                .from('stock_movements')
                .select('*, product:products(name, unit)')
                .eq('business_id', currentBusiness.id)
                .eq('branch_id', currentBranch.id),
            )
              .order('created_at', { ascending: false })
              .range(offset, offset + STOCK_MOVEMENTS_PAGE_SIZE - 1)
          : await applyDateFilters(
              supabase
                .from('staff_stock_movements')
                .select('id, business_id, branch_id, product_id, type, quantity, reference, notes, created_at')
                .eq('business_id', currentBusiness.id)
                .eq('branch_id', currentBranch.id),
            )
              .order('created_at', { ascending: false })
              .range(offset, offset + STOCK_MOVEMENTS_PAGE_SIZE - 1);

        if (error) throw error;
        let page = (data ?? []) as StockMovement[];
        if (!canViewCosts) {
          page = attachProductSummaries(page) as StockMovement[];
        }
        allMovements.push(...page);

        if (page.length < STOCK_MOVEMENTS_PAGE_SIZE) break;
        offset += STOCK_MOVEMENTS_PAGE_SIZE;
      }

      setMovements(allMovements);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewCosts, canViewStockHistory, currentBusiness, currentBranch, dateRange.end, dateRange.start]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const productName = (movement.product as any)?.name?.toLowerCase() ?? '';
      const reference = (movement.reference ?? '').toLowerCase();
      const matchesSearch = productName.includes(search.toLowerCase()) || reference.includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || movement.type === filter;
      const movementDate = new Date(movement.created_at);
      const matchesPeriod =
        (!dateRange.start || movementDate >= dateRange.start) &&
        (!dateRange.end || movementDate <= dateRange.end);
      return matchesSearch && matchesFilter && matchesPeriod;
    });
  }, [dateRange.end, dateRange.start, filter, movements, search]);

  const totalIn = formatCount(filteredMovements.filter((movement) => movement.type === 'stock_in').reduce((sum, movement) => sum + movement.quantity, 0));
  const totalOut = formatCount(filteredMovements.filter((movement) => ['stock_out', 'damage', 'wastage'].includes(movement.type)).reduce((sum, movement) => sum + movement.quantity, 0));

  const selectPeriod = (preset: PeriodPreset) => {
    setPeriod(preset);
    setDatePickerTarget(null);
    if (preset !== 'custom') {
      setPeriodSheetVisible(false);
    }
  };

  const updateCustomDate = (target: Exclude<DatePickerTarget, null>, date: Date) => {
    if (target === 'start') {
      setCustomStartDate(startOfDay(date));
      if (date > customEndDate) setCustomEndDate(endOfDay(date));
    } else {
      setCustomEndDate(endOfDay(date));
      if (date < customStartDate) setCustomStartDate(startOfDay(date));
    }
  };

  const handlePrint = async () => {
    if (!canExportStockHistory || isPrinting) return;
    if (!currentBusiness) {
      Alert.alert('Business unavailable', 'Your business information is needed before this list can be printed.');
      return;
    }
    if (filteredMovements.length === 0) {
      Alert.alert('Nothing to print', 'Adjust the period or filters to include at least one stock item.');
      return;
    }

    const received = filteredMovements
      .filter((movement) => movement.type === 'stock_in')
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const issued = filteredMovements
      .filter((movement) => ['stock_out', 'damage', 'wastage'].includes(movement.type))
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const reportTitle = filter === 'stock_in' ? 'Purchase & Stock In List' : 'Stock Activity List';

    setIsPrinting(true);
    try {
      await printStockMovementReport({
        business: currentBusiness,
        branch: currentBranch,
        title: reportTitle,
        periodLabel,
        totalReceived: received,
        totalIssued: issued,
        searchQuery: search.trim() || undefined,
        items: filteredMovements.map((movement) => ({
          name: (movement.product as any)?.name ?? 'Unknown product',
          type: movement.type,
          quantity: movement.quantity,
          unit: readAltUnitNote(movement.notes, (movement.product as any)?.unit ?? ''),
          createdAt: movement.created_at,
          reference: movement.reference,
          totalCost: canViewCosts ? movement.total_cost : undefined,
        })),
      });
    } catch (err: any) {
      Alert.alert('Unable to print', err?.message ?? 'Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!canViewStockHistory) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Stock History"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Stock history is restricted"
          description="Your role does not include access to stock movement history."
        />
      </ScreenShell>
    );
  }


  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Stock History"
        subtitle={`${filteredMovements.length} movement${filteredMovements.length === 1 ? '' : 's'} shown`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={
          canExportStockHistory ? (
            <HeaderAction
              icon={isPrinting ? 'loader' : 'printer'}
              label={isPrinting ? 'Printing' : 'Print'}
              onPress={handlePrint}
            />
          ) : null
        }
      />

      <View style={{ padding: 16, gap: 10, paddingBottom: 8 }}>
        <View style={{ borderWidth: 1, borderRadius: 14, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="search" size={16} color={COLORS.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search product or reference"
            placeholderTextColor={COLORS.text.muted}
            underlineColorAndroid="transparent"
            selectionColor={COLORS.accent}
            cursorColor={COLORS.accent}
            importantForAutofill="no"
            style={{ fontFamily: FONT.regular, flex: 1, fontSize: 14, color: COLORS.text.primary, paddingVertical: 10, backgroundColor: '#FFFFFF' }}
          />
        </View>

        <TouchableOpacity
          onPress={() => setPeriodSheetVisible(true)}
          activeOpacity={0.8}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.accent}14` }}>
            <Feather name="calendar" size={15} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: 9 }}>
            <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>Time period</Text>
            <Text style={{ marginTop: 1, fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{periodLabel}</Text>
          </View>
          <Feather name="chevron-down" size={17} color={COLORS.text.muted} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
          <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
            {filteredMovements.length} listed · <Text style={{ fontFamily: FONT.medium, color: COLORS.success }}>+{totalIn} in</Text> · <Text style={{ fontFamily: FONT.medium, color: COLORS.danger }}>-{totalOut} out</Text>
          </Text>
          <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>Prints this selection</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'stock_in', label: 'Stock in' },
            { key: 'stock_out', label: 'Out' },
            { key: 'adjustment', label: 'Adjust' },
            { key: 'damage', label: 'Damage' },
            { key: 'wastage', label: 'Wastage' },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.8}
              style={{
                minWidth: 86,
                minHeight: 38,
                paddingHorizontal: 14,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderRadius: RADIUS.md,
                borderColor: filter === item.key ? COLORS.ink : COLORS.border,
                backgroundColor: filter === item.key ? COLORS.surface2 : COLORS.card,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        <FlashList
          data={filteredMovements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 92, paddingTop: 8 }}
          
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.ink} />}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingTop: 44, alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : (
              <EmptyState
                icon="clipboard"
                title="No movements found"
                description={period === 'all' && !search && filter === 'all' ? 'Stock activity will appear here as you record sales and inventory adjustments.' : 'Try another period, activity type, or search term.'}
              />
            )
          }

        renderItem={({ item, index }) => {
          const config = MOVEMENT_CONFIG[item.type] ?? MOVEMENT_CONFIG.adjustment;
          const isIn = item.type === 'stock_in';
          const isOut = ['stock_out', 'damage', 'wastage'].includes(item.type);
          const displayUnit = readAltUnitNote(item.notes, (item.product as any)?.unit ?? '');

          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: index === filteredMovements.length - 1 ? 0 : 1, borderBottomColor: COLORS.border }}>
              <View style={{ width: 42, height: 42, backgroundColor: `${config.color}18`, borderWidth: 1, borderRadius: 14, borderColor: `${config.color}30`, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={config.icon} size={16} color={config.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>
                  {(item.product as any)?.name ?? 'Unknown Product'}
                </Text>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                  {format(new Date(item.created_at), 'MMM d, yyyy \u00B7 h:mm a')}
                </Text>
                {item.reference ? <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted, marginTop: 4 }}>Ref: {item.reference}</Text> : null}
                {item.notes && !item.notes.startsWith('[record-am-unit]') ? (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.secondary, marginTop: 4 }} numberOfLines={1}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: isIn ? COLORS.success : isOut ? COLORS.danger : COLORS.accent }}>
                  {isIn ? '+' : isOut ? '-' : '±'}
                  {item.quantity} {displayUnit}
                </Text>
                <Badge label={config.label} variant={config.variant} />
                {canViewCosts && item.total_cost !== undefined && item.total_cost > 0 ? (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>{formatCurrency(item.total_cost)}</Text>
                ) : null}
              </View>
            </View>
          );
        }}
        />
      </View>

      <Modal
        visible={periodSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDatePickerTarget(null);
          setPeriodSheetVisible(false);
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,33,28,0.48)' }}
          onPress={() => {
            setDatePickerTarget(null);
            setPeriodSheetVisible(false);
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface }}
          >
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 4, marginBottom: 18, backgroundColor: COLORS.borderDark }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 17, fontFamily: FONT.bold, color: COLORS.text.primary }}>Choose time period</Text>
                <Text style={{ marginTop: 3, fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>Only matching items are shown and printed.</Text>
              </View>
              <TouchableOpacity onPress={() => setPeriodSheetVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PERIOD_OPTIONS.map((option) => {
                const active = period === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => selectPeriod(option.key)}
                    activeOpacity={0.8}
                    style={{ paddingHorizontal: 12, minHeight: 38, justifyContent: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: active ? COLORS.ink : COLORS.border, backgroundColor: active ? COLORS.ink : COLORS.card }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: active ? COLORS.text.inverse : COLORS.text.secondary }}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {period === 'custom' ? (
              <View style={{ marginTop: 16, gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.secondary }}>Custom dates</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {([
                    { target: 'start' as const, label: 'From', value: customStartDate },
                    { target: 'end' as const, label: 'To', value: customEndDate },
                  ]).map(({ target, label, value }) => (
                    <TouchableOpacity
                      key={target}
                      onPress={() => setDatePickerTarget(datePickerTarget === target ? null : target)}
                      activeOpacity={0.8}
                      style={{ flex: 1, padding: 12, borderWidth: 1, borderRadius: RADIUS.md, borderColor: datePickerTarget === target ? COLORS.accent : COLORS.border, backgroundColor: COLORS.card }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>{label}</Text>
                      <Text style={{ marginTop: 4, fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{format(value, 'MMM d, yyyy')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {datePickerTarget ? (
                  <View style={{ borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, overflow: 'hidden', backgroundColor: COLORS.card }}>
                    <DateTimePicker
                      value={datePickerTarget === 'start' ? customStartDate : customEndDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      maximumDate={datePickerTarget === 'start' ? customEndDate : new Date()}
                      minimumDate={datePickerTarget === 'end' ? customStartDate : undefined}
                      onChange={(_, date) => {
                        if (Platform.OS !== 'ios') setDatePickerTarget(null);
                        if (date) updateCustomDate(datePickerTarget, date);
                      }}
                    />
                    {Platform.OS === 'ios' ? (
                      <TouchableOpacity onPress={() => setDatePickerTarget(null)} style={{ alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.accent }}>Done</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                <Button title="Show selected period" variant="accent" icon="check" onPress={() => setPeriodSheetVisible(false)} />
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
