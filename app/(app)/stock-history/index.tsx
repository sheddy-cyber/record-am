import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Badge, Card, EmptyState, LoadingScreen } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, FONT, RADIUS, SP, TYPE } from "@/constants";
import { readAltUnitNote } from '@/lib/records';
import { StockMovement } from '@/types';

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

const formatCurrency = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function StockHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { currentBusiness, currentBranch } = useAuthStore();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;

    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, product:products(name, unit)')
        .eq('business_id', currentBusiness.id)
        .eq('branch_id', currentBranch.id)
        .order('created_at', { ascending: false })
        .limit(120);

      if (error) throw error;
      setMovements((data as StockMovement[]) ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBusiness, currentBranch]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const productName = (movement.product as any)?.name?.toLowerCase() ?? '';
      const reference = (movement.reference ?? '').toLowerCase();
      const matchesSearch = productName.includes(search.toLowerCase()) || reference.includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || movement.type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, movements, search]);

  const totalIn = filteredMovements.filter((movement) => movement.type === 'stock_in').reduce((sum, movement) => sum + movement.quantity, 0);
  const totalOut = filteredMovements.filter((movement) => ['stock_out', 'damage', 'wastage'].includes(movement.type)).reduce((sum, movement) => sum + movement.quantity, 0);

  if (loading) return <LoadingScreen message="Loading stock history..." />;

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Stock History"
        subtitle={`${filteredMovements.length} movement${filteredMovements.length === 1 ? '' : 's'} shown`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="search" size={16} color={COLORS.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search product or reference"
            placeholderTextColor={COLORS.text.muted}
            style={{ flex: 1, fontSize: 14, color: COLORS.text.primary, paddingVertical: 10 }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Total Movements', value: `${filteredMovements.length}`, color: COLORS.text.primary },
            { label: 'Units In', value: `+${totalIn}`, color: COLORS.success },
            { label: 'Units Out', value: `-${totalOut}`, color: COLORS.danger },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, padding: 12 }}>
              <Text style={{ fontSize: 11, color: COLORS.text.muted }}>{item.label}</Text>
              <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: item.color, marginTop: 6 }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'stock_in', label: 'In' },
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
                borderColor: filter === item.key ? COLORS.ink : COLORS.border,
                backgroundColor: filter === item.key ? COLORS.surface2 : COLORS.card,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredMovements.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No movements found"
          description="Stock activity will appear here as you record purchases, sales, and adjustments."
        />
      ) : (
        <FlatList
          data={filteredMovements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: insets.bottom + 92 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.ink} />}
          renderItem={({ item }) => {
            const config = MOVEMENT_CONFIG[item.type] ?? MOVEMENT_CONFIG.adjustment;
            const isIn = item.type === 'stock_in';
            const isOut = ['stock_out', 'damage', 'wastage'].includes(item.type);
            const displayUnit = readAltUnitNote(item.notes, (item.product as any)?.unit ?? '');

            return (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, backgroundColor: `${config.color}18`, borderWidth: 1, borderColor: `${config.color}30`, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={config.icon} size={16} color={config.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>
                    {(item.product as any)?.name ?? 'Unknown Product'}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 4 }}>
                    {format(new Date(item.created_at), 'MMM d, yyyy • h:mm a')}
                  </Text>
                  {item.reference ? <Text style={{ fontSize: 11, color: COLORS.text.muted, marginTop: 4 }}>Ref: {item.reference}</Text> : null}
                  {item.notes && !item.notes.startsWith('[record-am-unit]') ? (
                    <Text style={{ fontSize: 11, color: COLORS.text.secondary, marginTop: 4 }} numberOfLines={1}>
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
                  {item.total_cost !== undefined && item.total_cost > 0 ? (
                    <Text style={{ fontSize: 11, color: COLORS.text.muted }}>{formatCurrency(item.total_cost)}</Text>
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}
    </ScreenShell>
  );
}
