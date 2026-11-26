import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import PagerView, { PagerHandle } from '@/components/navigation/Pager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '@/components/icons';
import { COLORS, FONT } from '@/constants';
import { haptics } from '@/lib/haptics';
import { useTabStore } from '@/store/tabStore';
import { useVoiceStore } from '@/store/voiceStore';

import DashboardScreen from './_dashboard';
import InventoryScreen from './_inventory';
import SalesScreen from './_sales';
import MoreScreen from './_more';

type TabKey = 'dashboard' | 'inventory' | 'sales' | 'more';

const TABS: Record<TabKey, { label: string; icon: IconName; activeIcon: IconName }> = {
  dashboard: { label: 'Home', icon: 'home', activeIcon: 'home-fill' },
  inventory: { label: 'Stock', icon: 'box', activeIcon: 'box-fill' },
  sales: { label: 'Sales', icon: 'receipt', activeIcon: 'receipt-fill' },
  more: { label: 'More', icon: 'grid', activeIcon: 'grid-fill' },
};

const ROUTES: { key: TabKey; component: React.ComponentType }[] = [
  { key: 'dashboard', component: DashboardScreen },
  { key: 'inventory', component: InventoryScreen },
  { key: 'sales', component: SalesScreen },
  { key: 'more', component: MoreScreen },
];

const TAB_BAR_HEIGHT = 58;

// ─── Tab item ────────────────────────────────────────────────────────────────
const TabItem = React.memo(function TabItem({
  routeKey,
  isActive,
  onPress,
}: {
  routeKey: TabKey;
  isActive: boolean;
  onPress: () => void;
}) {
  const config = TABS[routeKey];
  const scale = useRef(new Animated.Value(1)).current;
  // 0 = outline (inactive), 1 = filled (active). Both glyphs stay mounted and
  // cross-fade, so a filled shape can never linger on an inactive tab.
  const active = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(active, {
      toValue: isActive ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isActive, active]);

  const pressIn = () => {
    Animated.timing(scale, { toValue: 0.88, duration: 70, useNativeDriver: true }).start();
    onPress();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 30, bounciness: 8, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={config.label}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
        <View style={styles.iconSlot}>
          <Animated.View style={[styles.iconLayer, { opacity: active.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
            <Icon name={config.icon} size={24} color={COLORS.text.muted} />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, { opacity: active }]}>
            <Icon name={config.activeIcon} size={24} color={COLORS.text.primary} backgroundColor={COLORS.card} />
          </Animated.View>
        </View>
        <Text style={[styles.tabLabel, { color: isActive ? COLORS.text.primary : COLORS.text.muted }]} numberOfLines={1}>
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// ─── Voice key ───────────────────────────────────────────────────────────────
// The one dark, round control in the bar: tap to talk to the app.
const VoiceKey = React.memo(function VoiceKey() {
  const openVoice = useVoiceStore((s) => s.open);
  const isListening = useVoiceStore((s) => s.state === 'listening' && s.isOpen);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => Animated.timing(scale, { toValue: 0.9, duration: 70, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 26, bounciness: 9, useNativeDriver: true }).start()}
      onPress={() => {
        haptics.press();
        openVoice();
      }}
      style={styles.voiceSlot}
      accessibilityRole="button"
      accessibilityLabel="Speak a command"
    >
      <Animated.View
        style={[styles.voiceKey, isListening && { backgroundColor: COLORS.accent }, { transform: [{ scale }] }]}
      >
        <Icon name="mic" size={22} color="#FFFFFF" strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
});

// ─── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ onTabPress }: { onTabPress: (key: TabKey, index: number) => void }) {
  const insets = useSafeAreaInsets();
  const activeTab = useTabStore((s) => s.activeTab);
  const bottom = Math.max(insets.bottom, 8);

  const item = (key: TabKey, index: number) => (
    <TabItem key={key} routeKey={key} isActive={activeTab === key} onPress={() => onTabPress(key, index)} />
  );

  return (
    <View style={[styles.tabBar, { paddingBottom: bottom, height: TAB_BAR_HEIGHT + bottom }]}>
      {item('dashboard', 0)}
      {item('inventory', 1)}
      <VoiceKey />
      {item('sales', 2)}
      {item('more', 3)}
    </View>
  );
}

const TabScene = React.memo(({ component: Component }: { component: React.ComponentType }) => <Component />);

// ─── Host ────────────────────────────────────────────────────────────────────
// Home renders first; the other tabs mount one at a time once the first frame
// has settled, so cold start stays quick and later tab switches are instant.
export default function TabsScreen() {
  const isFocused = useIsFocused();
  const pagerRef = useRef<PagerHandle>(null);
  const hasMountedRef = useRef(false);
  const currentIndexRef = useRef(0);
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    dashboard: true,
    inventory: false,
    sales: false,
    more: false,
  });

  const ensureMounted = useCallback((key: TabKey) => {
    setMounted((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  useEffect(() => {
    useTabStore.getState().setActiveTab('dashboard');
    currentIndexRef.current = 0;
    pagerRef.current?.setPageWithoutAnimation(0);

    const settle = setTimeout(() => {
      hasMountedRef.current = true;
    }, 300);

    // Warm the remaining tabs in the background, one per idle slot.
    let cancelled = false;
    const order: TabKey[] = ['sales', 'inventory', 'more'];
    const warmNext = (i: number) => {
      if (cancelled || i >= order.length) return;
      InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        ensureMounted(order[i]);
        setTimeout(() => warmNext(i + 1), 120);
      });
    };
    const warm = setTimeout(() => warmNext(0), 450);

    return () => {
      cancelled = true;
      clearTimeout(settle);
      clearTimeout(warm);
    };
  }, [ensureMounted]);

  // Follow tab changes requested elsewhere (e.g. "View stock" on Home).
  useEffect(() => {
    const unsub = useTabStore.subscribe((state) => {
      const target = ROUTES.findIndex((r) => r.key === state.activeTab);
      if (target !== -1) ensureMounted(ROUTES[target].key);
      if (target !== -1 && target !== currentIndexRef.current) {
        currentIndexRef.current = target;
        pagerRef.current?.setPageWithoutAnimation(target);
      }
    });
    return unsub;
  }, [ensureMounted]);

  // Android back: return to Home first, then leave the app.
  useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (useTabStore.getState().activeTab !== 'dashboard') {
        currentIndexRef.current = 0;
        pagerRef.current?.setPageWithoutAnimation(0);
        useTabStore.getState().setActiveTab('dashboard');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isFocused]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      if (!hasMountedRef.current) return;
      const index = e.nativeEvent.position;
      currentIndexRef.current = index;
      const route = ROUTES[index];
      if (route && useTabStore.getState().activeTab !== route.key) {
        ensureMounted(route.key);
        haptics.selection();
        useTabStore.getState().setActiveTab(route.key);
      }
    },
    [ensureMounted],
  );

  const handleTabPress = useCallback(
    (key: TabKey, index: number) => {
      if (key === useTabStore.getState().activeTab) return;
      haptics.selection();
      ensureMounted(key);
      currentIndexRef.current = index;
      pagerRef.current?.setPageWithoutAnimation(index);
      useTabStore.getState().setActiveTab(key);
    },
    [ensureMounted],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
        overdrag={false}
        offscreenPageLimit={3}
      >
        {ROUTES.map((route) => (
          <View key={route.key} style={{ flex: 1, backgroundColor: COLORS.surface }}>
            {mounted[route.key] ? <TabScene component={route.component} /> : null}
          </View>
        ))}
      </PagerView>
      <TabBar onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 6,
    backgroundColor: COLORS.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderDark,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  iconSlot: { width: 24, height: 24 },
  iconLayer: { position: 'absolute', top: 0, left: 0 },
  tabLabel: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  voiceSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  voiceKey: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
});
