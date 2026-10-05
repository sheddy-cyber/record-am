import React, { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Feather } from '@expo/vector-icons';
import { format, isToday, isYesterday, isThisWeek, subMonths, subDays } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { supabase } from '@/lib/supabase';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  recordExpenseOffline,
  updateExpenseOffline,
  deleteExpenseOffline,
} from '@/lib/offlineRecords';
import { readCachedExpenses, cacheExpenses } from '@/lib/offlineStore';
import { Button, Card, EmptyState, LoadingScreen } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField } from '@/components/forms';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, EXPENSE_CATEGORIES, FONT, PAYMENT_METHODS, RADIUS } from '@/constants';
import { Expense, PaymentMethod } from '@/types';
import { dismissScreen } from '@/lib/navigation';

// Category metadata with styling and icons
const CATEGORY_META: Record<
  string,
  { label: string; icon: keyof typeof Feather.glyphMap; color: string; bg: string }
> = {
  rent: { label: 'Rent', icon: 'home', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.12)' },
  electricity: { label: 'Electricity', icon: 'zap', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' },
  transport: { label: 'Transport', icon: 'truck', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)' },
  salary: { label: 'Salary', icon: 'users', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)' },
  supplies: { label: 'Supplies', icon: 'package', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.12)' },
  maintenance: { label: 'Maintenance', icon: 'tool', color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)' },
  marketing: { label: 'Marketing', icon: 'volume-2', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.12)' },
  internet: { label: 'Internet', icon: 'wifi', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.12)' },
  water: { label: 'Water', icon: 'droplet', color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.12)' },
  security: { label: 'Security', icon: 'shield', color: '#64748B', bg: 'rgba(100, 116, 139, 0.12)' },
  other: { label: 'Other', icon: 'tag', color: COLORS.accent, bg: 'rgba(202, 138, 4, 0.12)' },
};

const getCategoryMeta = (cat: string) => {
  const key = (cat || '').toLowerCase();
  return (
    CATEGORY_META[key] ?? {
      label: cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Expense',
      icon: 'tag' as keyof typeof Feather.glyphMap,
      color: COLORS.accent,
      bg: 'rgba(202, 138, 4, 0.12)',
    }
  );
};

const CATEGORY_CHIPS = [
  { key: 'all', label: 'All' },
  ...EXPENSE_CATEGORIES.map((c) => ({ key: c.value, label: c.label.split(' / ')[0] })),
];

const formatCurrency = (val: number) =>
  `${CURRENCY_SYMBOL}${Number(val || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch, user } = useAuthStore();
  const params = useLocalSearchParams<{ expenseId?: string | string[]; action?: string }>();

  // State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Time Period & Search & Category Filters
  const [selectedPeriod, setSelectedPeriod] = useState<string>('this_month');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // Form Fields
  const [expenseCategory, setExpenseCategory] = useState('rent');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  // Load expenses from cache and remote
  const loadExpenses = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    try {
      // 1. Read cached expenses for instant render
      const cached = await readCachedExpenses(currentBusiness.id, currentBranch.id);
      if (cached && cached.length > 0) {
        setExpenses(cached);
      }

      // 2. Fetch fresh data from Supabase
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('business_id', currentBusiness.id)
        .eq('branch_id', currentBranch.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        setExpenses(data as Expense[]);
        await cacheExpenses(currentBusiness.id, currentBranch.id, data as Expense[]);
      }
    } catch (err) {
      console.warn('Failed to load expenses:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBusiness, currentBranch]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Realtime synchronization
  useRealtimeRefresh({
    channelName: `expenses-${currentBranch?.id ?? 'unknown'}`,
    enabled: Boolean(currentBusiness && currentBranch),
    watch: [currentBusiness?.id, currentBranch?.id],
    tables: [
      ...(currentBranch ? [{ table: 'expenses', filter: `branch_id=eq.${currentBranch.id}` }] : []),
    ],
    onRefresh: loadExpenses,
  });

  // Handle deep link / navigation params (e.g. ?expenseId=123 or ?action=new)
  useEffect(() => {
    const targetId = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
    if (targetId && expenses.length > 0) {
      const match = expenses.find((e) => e.id === targetId);
      if (match) {
        startEditExpense(match);
      }
    } else if (params.action === 'new') {
      startNewExpense();
    }
  }, [params.expenseId, params.action, expenses]);

  // Start new expense
  const startNewExpense = () => {
    setEditingExpense(null);
    setExpenseCategory('rent');
    setExpenseDescription('');
    setExpenseAmount('');
    setExpenseMethod('cash');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setViewMode('form');
  };

  // Start editing expense
  const startEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseCategory(expense.category);
    setExpenseDescription(expense.description);
    setExpenseAmount(expense.amount.toString());
    setExpenseMethod(expense.payment_method);
    setExpenseDate(expense.expense_date);
    setViewMode('form');
  };

  // Close form view
  const closeForm = () => {
    setViewMode('list');
    setEditingExpense(null);
  };

  // Save / Update expense handler
  const handleSaveExpense = async () => {
    if (!currentBusiness || !currentBranch) return;

    if (!expenseDescription.trim()) {
      Alert.alert('Description required', 'Enter a short description for this expense.');
      return;
    }

    const cleanAmount = expenseAmount.toString().replace(/,/g, '');
    const parsedAmount = parseFloat(cleanAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid expense amount.');
      return;
    }

    setSaving(true);

    try {
      if (editingExpense) {
        const updated = await updateExpenseOffline({
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          expense: editingExpense,
          category: expenseCategory,
          description: expenseDescription.trim(),
          amount: parsedAmount,
          paymentMethod: expenseMethod,
          expenseDate,
        });

        setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        Toast.show({
          type: 'success',
          text1: 'Expense updated',
          text2: `${updated.description} · ${formatCurrency(updated.amount)}`,
        });
      } else {
        const created = await recordExpenseOffline({
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          userId: user?.id,
          category: expenseCategory,
          description: expenseDescription.trim(),
          amount: parsedAmount,
          paymentMethod: expenseMethod,
          expenseDate,
        });

        setExpenses((prev) => [created, ...prev]);
        Toast.show({
          type: 'success',
          text1: 'Expense recorded',
          text2: `${created.description} · ${formatCurrency(created.amount)}`,
        });
      }

      // Sync stores
      void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
      void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);

      closeForm();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err.message || 'Could not save expense',
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete expense handler
  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense.description}" (${formatCurrency(expense.amount)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentBusiness || !currentBranch) return;
            try {
              await deleteExpenseOffline({
                businessId: currentBusiness.id,
                branchId: currentBranch.id,
                expenseId: expense.id,
              });

              setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
              void useAnalyticsStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);
              void useDashboardStore.getState().refreshFromCache(currentBusiness.id, currentBranch.id);

              Toast.show({
                type: 'success',
                text1: 'Expense deleted',
                text2: `${expense.description} removed`,
              });

              if (viewMode === 'form') {
                closeForm();
              }
            } catch (err: any) {
              Toast.show({
                type: 'error',
                text1: 'Delete failed',
                text2: err.message || 'Could not delete expense',
              });
            }
          },
        },
      ]
    );
  };

  // Generate dynamic period options (presets + past 12 months + any recorded months)
  const periodOptions = useMemo(() => {
    const options: { key: string; label: string }[] = [
      { key: 'this_month', label: 'This Month' },
      { key: 'today', label: 'Today' },
      { key: 'this_week', label: 'This Week' },
      { key: 'all', label: 'All Time' },
    ];

    const now = new Date();
    const currentMonthKey = format(now, 'yyyy-MM');
    const monthsSet = new Set<string>();

    // Add past 12 months
    for (let i = 1; i <= 12; i++) {
      const d = subMonths(now, i);
      monthsSet.add(format(d, 'yyyy-MM'));
    }

    // Also include any older months present in data
    expenses.forEach((e) => {
      const dStr = e.expense_date || (e.created_at ? e.created_at.slice(0, 10) : '');
      if (dStr && dStr.length >= 7) {
        const monthKey = dStr.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(monthKey) && monthKey !== currentMonthKey) {
          monthsSet.add(monthKey);
        }
      }
    });

    // Sort descending by year-month
    const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));

    sortedMonths.forEach((mKey) => {
      const [y, m] = mKey.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      options.push({
        key: mKey,
        label: format(d, 'MMM yyyy'),
      });
    });

    return options;
  }, [expenses]);

  // Selected period label for display
  const selectedPeriodLabel = useMemo(() => {
    const found = periodOptions.find((p) => p.key === selectedPeriod);
    if (found) return found.label;
    if (/^\d{4}-\d{2}$/.test(selectedPeriod)) {
      try {
        const [y, m] = selectedPeriod.split('-').map(Number);
        return format(new Date(y, m - 1, 1), 'MMMM yyyy');
      } catch {}
    }
    return selectedPeriod;
  }, [periodOptions, selectedPeriod]);

  const selectedCategoryLabel = useMemo(
    () => CATEGORY_CHIPS.find((category) => category.key === selectedCategory)?.label ?? 'All categories',
    [selectedCategory],
  );

  // Check if expense matches the selected time period
  const matchesPeriod = useCallback((expenseDateStr: string, periodKey: string): boolean => {
    if (periodKey === 'all') return true;
    if (!expenseDateStr) return false;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const thisMonthPrefix = format(new Date(), 'yyyy-MM');

    if (periodKey === 'today') {
      return expenseDateStr.startsWith(todayStr);
    }

    if (periodKey === 'this_week') {
      try {
        const [y, m, d] = expenseDateStr.slice(0, 10).split('-').map(Number);
        if (y && m && d) {
          const dateObj = new Date(y, m - 1, d);
          return isThisWeek(dateObj, { weekStartsOn: 1 });
        }
      } catch {}
      return false;
    }

    if (periodKey === 'this_month') {
      return expenseDateStr.startsWith(thisMonthPrefix);
    }

    // Monthly period key format: 'YYYY-MM'
    if (/^\d{4}-\d{2}$/.test(periodKey)) {
      return expenseDateStr.startsWith(periodKey);
    }

    return true;
  }, []);

  // Filter expenses by selected time period
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dStr = e.expense_date || (e.created_at ? e.created_at.slice(0, 10) : '');
      return matchesPeriod(dStr, selectedPeriod);
    });
  }, [expenses, selectedPeriod, matchesPeriod]);

  // Apply every active control before calculating the visible total or building date groups.
  const filteredExpenses = useMemo(() => {
    return periodExpenses.filter((item) => {
      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = deferredSearchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.amount.toString().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [periodExpenses, selectedCategory, deferredSearchQuery]);

  const visibleExpenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
    [filteredExpenses],
  );

  // Date-grouped expenses for the already filtered selection.
  const groupedExpenses = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const exp of filteredExpenses) {
      const key = exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : 'Unknown');
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(exp);
    }

    // Sort descending by date
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((dateKey) => {
      const items = map.get(dateKey)!.sort((a, b) => {
        const tA = new Date(a.created_at || a.expense_date).getTime();
        const tB = new Date(b.created_at || b.expense_date).getTime();
        return tB - tA;
      });

      const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      let dateLabel = dateKey;
      try {
        const [y, m, d] = dateKey.split('-').map(Number);
        if (y && m && d) {
          const parsed = new Date(y, m - 1, d);
          if (isToday(parsed)) {
            dateLabel = `Today · ${format(parsed, 'd MMM yyyy')}`;
          } else if (isYesterday(parsed)) {
            dateLabel = `Yesterday · ${format(parsed, 'd MMM yyyy')}`;
          } else {
            dateLabel = format(parsed, 'EEEE · d MMM yyyy');
          }
        }
      } catch {}

      return {
        title: dateKey,
        dateKey,
        dateLabel,
        totalAmount,
        items,
        data: items,
      };
    });
  }, [filteredExpenses]);

  const hasExtraFilters = Boolean(searchQuery.trim()) || selectedCategory !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
  };

  const resetFilters = () => {
    clearFilters();
    setSelectedPeriod('this_month');
  };

  if (loading && expenses.length === 0) {
    return <LoadingScreen message="Loading expenses..." />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM VIEW (Record or Edit Expense)
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === 'form') {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title={editingExpense ? 'Edit Expense' : 'Record Expense'}
          subtitle={
            editingExpense
              ? 'Update operational cost details.'
              : 'Capture an operational cost for your branch.'
          }
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeForm} />}
        />
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Card style={{ padding: 18, gap: 14 }}>
            <SelectField
              label="Category"
              value={expenseCategory}
              options={EXPENSE_CATEGORIES}
              onChange={setExpenseCategory}
              required
            />
            <InputField
              label="Description"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
              placeholder="e.g. March shop rent, generator diesel"
              required
            />
            <InputField
              label="Amount"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              placeholder="0"
              keyboardType="numeric"
              prefix={CURRENCY_SYMBOL}
              isAmount={true}
              required
            />
            <SelectField
              label="Payment Method"
              value={expenseMethod}
              options={PAYMENT_METHODS}
              onChange={(value) => setExpenseMethod(value as PaymentMethod)}
            />
            <View>
              <InputField
                label="Date"
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="YYYY-MM-DD"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  onPress={() => setExpenseDate(format(new Date(), 'yyyy-MM-dd'))}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor:
                      expenseDate === format(new Date(), 'yyyy-MM-dd')
                        ? COLORS.accent
                        : COLORS.surface2,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: RADIUS.full,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.medium,
                      fontSize: 12,
                      color:
                        expenseDate === format(new Date(), 'yyyy-MM-dd')
                          ? '#FFFFFF'
                          : COLORS.text.secondary,
                    }}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setExpenseDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor:
                      expenseDate === format(subDays(new Date(), 1), 'yyyy-MM-dd')
                        ? COLORS.accent
                        : COLORS.surface2,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: RADIUS.full,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.medium,
                      fontSize: 12,
                      color:
                        expenseDate === format(subDays(new Date(), 1), 'yyyy-MM-dd')
                          ? '#FFFFFF'
                          : COLORS.text.secondary,
                    }}
                  >
                    Yesterday
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginTop: 10, gap: 12 }}>
              <Button
                title={editingExpense ? 'Update Expense' : 'Save Expense'}
                onPress={handleSaveExpense}
                loading={saving}
                size="lg"
                variant="accent"
              />
              {editingExpense ? (
                <Button
                  title="Delete Expense"
                  onPress={() => handleDeleteExpense(editingExpense)}
                  disabled={saving}
                  size="md"
                  variant="ghost"
                  textStyle={{ color: COLORS.danger }}
                  style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
                />
              ) : null}
            </View>
          </Card>
        </KeyboardAwareScrollView>
      </ScreenShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST VIEW (Expenses with period filter & date grouping)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Expenses"
        subtitle={`${filteredExpenses.length} shown · ${selectedPeriodLabel}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        right={<HeaderAction icon="plus" label="Record" onPress={startNewExpense} />}
      />

      {/* ── Compact search, selection and total ───────────────────────── */}
      <View
        style={{
          backgroundColor: COLORS.surface,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          gap: 10,
          zIndex: 10,
        }}
      >
        <View
          style={{
            borderWidth: 1,
            borderRadius: RADIUS.md,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            paddingHorizontal: 12,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Feather name="search" size={15} color={COLORS.text.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search description, category, amount..."
            placeholderTextColor={COLORS.text.muted}
            underlineColorAndroid="transparent"
            selectionColor={COLORS.accent}
            cursorColor={COLORS.accent}
            importantForAutofill="no"
            style={{
              fontFamily: FONT.regular,
              flex: 1,
              fontSize: 13.5,
              color: COLORS.text.primary,
              paddingVertical: 0,
            }}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={15} color={COLORS.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setFilterSheetVisible(true)}
            activeOpacity={0.8}
            style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card }}
          >
            <View style={{ width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: `${COLORS.accent}14` }}>
              <Feather name="calendar" size={14} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontFamily: FONT.regular, fontSize: 10.5, color: COLORS.text.muted }}>Time period</Text>
              <Text style={{ marginTop: 1, fontFamily: FONT.medium, fontSize: 12.5, color: COLORS.text.primary }} numberOfLines={1}>{selectedPeriodLabel}</Text>
            </View>
            <Feather name="chevron-down" size={15} color={COLORS.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterSheetVisible(true)}
            activeOpacity={0.8}
            style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: RADIUS.md, borderColor: selectedCategory === 'all' ? COLORS.border : COLORS.accent, backgroundColor: COLORS.card }}
          >
            <View style={{ width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: selectedCategory === 'all' ? COLORS.surface2 : `${COLORS.accent}14` }}>
              <Feather name="tag" size={14} color={selectedCategory === 'all' ? COLORS.text.muted : COLORS.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontFamily: FONT.regular, fontSize: 10.5, color: COLORS.text.muted }}>Category</Text>
              <Text style={{ marginTop: 1, fontFamily: FONT.medium, fontSize: 12.5, color: COLORS.text.primary }} numberOfLines={1}>{selectedCategoryLabel}</Text>
            </View>
            <Feather name="sliders" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </View>

        <View style={{ minHeight: 30, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
          <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
            {filteredExpenses.length} {filteredExpenses.length === 1 ? 'expense' : 'expenses'} shown
          </Text>
          <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: visibleExpenseTotal > 0 ? COLORS.danger : COLORS.text.primary }}>
            -{formatCurrency(visibleExpenseTotal)}
          </Text>
          {hasExtraFilters ? (
            <TouchableOpacity onPress={clearFilters} hitSlop={8} style={{ marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="x-circle" size={14} color={COLORS.text.muted} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={groupedExpenses}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={true}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadExpenses();
            }}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
        renderSectionHeader={({ section: { dateLabel, totalAmount } }) => (
          <View
            style={{
              backgroundColor: COLORS.surface,
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="calendar" size={13} color={COLORS.text.muted} />
              <Text
                style={{
                  fontFamily: FONT.bold,
                  fontSize: 13,
                  color: COLORS.text.primary,
                }}
              >
                {dateLabel}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: FONT.bold,
                fontSize: 13,
                color: COLORS.danger,
              }}
            >
              -{formatCurrency(totalAmount)}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const meta = getCategoryMeta(item.category);
          const timeStr = item.created_at
            ? format(new Date(item.created_at), 'h:mm a')
            : null;

          return (
            <View style={{ paddingHorizontal: 16 }}>
              <View
                style={{
                  backgroundColor: COLORS.card,
                  borderTopLeftRadius: isFirst ? RADIUS.lg : 0,
                  borderTopRightRadius: isFirst ? RADIUS.lg : 0,
                  borderBottomLeftRadius: isLast ? RADIUS.lg : 0,
                  borderBottomRightRadius: isLast ? RADIUS.lg : 0,
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderTopWidth: isFirst ? 1 : 0,
                  borderBottomWidth: isLast ? 1 : 0,
                  borderColor: COLORS.border,
                  overflow: 'hidden',
                }}
              >
                <TouchableOpacity
                  onPress={() => startEditExpense(item)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    gap: 12,
                  }}
                >
                  {/* Category Icon */}
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: meta.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={meta.icon} size={18} color={meta.color} />
                  </View>

                  {/* Details */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONT.bold,
                        color: COLORS.text.primary,
                      }}
                      numberOfLines={1}
                    >
                      {item.description}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 3,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FONT.medium,
                          fontSize: 11,
                          color: meta.color,
                        }}
                      >
                        {meta.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.text.muted }}>·</Text>
                      <Text
                        style={{
                          fontFamily: FONT.regular,
                          fontSize: 11,
                          color: COLORS.text.muted,
                        }}
                      >
                        {item.payment_method.toUpperCase()}
                      </Text>
                      {timeStr ? (
                        <>
                          <Text style={{ fontSize: 11, color: COLORS.text.muted }}>·</Text>
                          <Text
                            style={{
                              fontFamily: FONT.regular,
                              fontSize: 11,
                              color: COLORS.text.muted,
                            }}
                          >
                            {timeStr}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>

                  {/* Amount and Edit Button */}
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: FONT.bold,
                        color: COLORS.danger,
                      }}
                    >
                      -{formatCurrency(item.amount)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => startEditExpense(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: COLORS.surface2,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.sm,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      }}
                    >
                      <Feather name="edit-2" size={11} color={COLORS.text.secondary} />
                      <Text
                        style={{
                          fontFamily: FONT.medium,
                          fontSize: 11,
                          color: COLORS.text.secondary,
                        }}
                      >
                        Edit
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {!isLast ? (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: COLORS.border,
                      marginHorizontal: 14,
                    }}
                  />
                ) : null}
              </View>
            </View>
          );
        }}
        renderSectionFooter={() => <View style={{ height: 16 }} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            <EmptyState
              icon="dollar-sign"
              title={
                expenses.length === 0
                  ? 'No expenses recorded'
                  : `No expenses for ${selectedPeriodLabel}`
              }
              description={
                expenses.length === 0
                  ? 'Capture operational costs like rent, electricity, transport, salaries, and daily maintenance.'
                  : searchQuery || selectedCategory !== 'all'
                  ? 'Try adjusting your search query or selecting a different category filter.'
                  : `No expenses recorded during ${selectedPeriodLabel}. Tap below to record one or switch time period.`
              }
              action={
                expenses.length === 0 || (!searchQuery && selectedCategory === 'all')
                  ? {
                      label: 'Record New Expense',
                      onPress: startNewExpense,
                    }
                  : {
                      label: 'Clear Filters',
                      onPress: clearFilters,
                    }
              }
            />
          </View>
        }
      />

      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,33,28,0.48)' }}
          onPress={() => setFilterSheetVisible(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface, paddingTop: 12 }}
          >
            <View style={{ width: 38, height: 4, alignSelf: 'center', borderRadius: 4, backgroundColor: COLORS.borderDark }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 }}>
              <View>
                <Text style={{ fontFamily: FONT.bold, fontSize: 17, color: COLORS.text.primary }}>Filter expenses</Text>
                <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>Choose what appears in the list and total.</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterSheetVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
              <Text style={{ marginBottom: 9, fontFamily: FONT.medium, fontSize: 12, color: COLORS.text.secondary }}>TIME PERIOD</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {periodOptions.map((period) => {
                  const active = selectedPeriod === period.key;
                  return (
                    <TouchableOpacity
                      key={period.key}
                      onPress={() => setSelectedPeriod(period.key)}
                      activeOpacity={0.8}
                      style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, borderColor: active ? COLORS.ink : COLORS.border, backgroundColor: active ? COLORS.ink : COLORS.card }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: active ? COLORS.text.inverse : COLORS.text.secondary }}>{period.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ marginTop: 22, marginBottom: 9, fontFamily: FONT.medium, fontSize: 12, color: COLORS.text.secondary }}>CATEGORY</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORY_CHIPS.map((category) => {
                  const active = selectedCategory === category.key;
                  return (
                    <TouchableOpacity
                      key={category.key}
                      onPress={() => setSelectedCategory(category.key)}
                      activeOpacity={0.8}
                      style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, borderColor: active ? COLORS.accent : COLORS.border, backgroundColor: active ? `${COLORS.accent}14` : COLORS.card }}
                    >
                      <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: active ? COLORS.accent : COLORS.text.secondary }}>{category.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 18, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Button title="Reset" variant="secondary" size="md" style={{ flex: 0.75 }} onPress={resetFilters} />
              <Button title="Show expenses" variant="accent" icon="check" size="md" style={{ flex: 1.25 }} onPress={() => setFilterSheetVisible(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
