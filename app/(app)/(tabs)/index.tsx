import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, View, Text, Pressable, StyleSheet, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT } from '@/constants';
import { useTabStore } from '@/store/tabStore';
import PagerView from 'react-native-pager-view';

// Import screens directly
import DashboardScreen from './_dashboard';
import InventoryScreen from './_inventory';
import SalesScreen from './_sales';
import DebtsScreen from './_debts';
import MoreScreen from './_more';

const TAB_CONFIG: Record<string, { label: string; icon: keyof typeof Feather.glyphMap }> = {
  dashboard: { label: 'Hub', icon: 'layout' },
  inventory: { label: 'Inventory', icon: 'box' },
  sales: { label: 'Sales', icon: 'shopping-cart' },
  debts: { label: 'Debts', icon: 'users' },
  more: { label: 'More', icon: 'grid' },
};

const ROUTES = [
  { key: 'dashboard', component: DashboardScreen },
  { key: 'inventory', component: InventoryScreen },
  { key: 'sales', component: SalesScreen },
  { key: 'debts', component: DebtsScreen },
  { key: 'more', component: MoreScreen },
];

// ─── Individual tab icon (never re-renders unless its own isActive changes) ───
const TabIcon = React.memo(function TabIcon({
  routeKey,
  isActive,
  onPressIn,
}: {
  routeKey: string;
  isActive: boolean;
  onPressIn: () => void;
}) {
  const config = TAB_CONFIG[routeKey] || { label: '', icon: 'circle' };

  return (
    <Pressable
      onPressIn={onPressIn}
      android_ripple={null}
      style={[
        styles.tabItem,
        isActive && styles.activeTabItem,
      ]}
    >
      <View style={[styles.iconWrapper, isActive && styles.activeIconWrapper]}>
        {isActive && <View style={styles.activeCircle} />}
        <Feather 
          name={config.icon} 
          size={isActive ? 21 : 18} 
          color={isActive ? COLORS.accent : "rgba(255,255,255,0.4)"} 
          style={{ position: 'absolute' }}
        />
      </View>
      <Text
        style={{
          fontSize: isActive ? 11 : 10,
          fontFamily: isActive ? FONT.bold : FONT.medium,
          color: isActive ? COLORS.accent : "rgba(255,255,255,0.45)",
          marginTop: isActive ? 1 : 3,
        }}
        numberOfLines={1}
      >
        {config.label}
      </Text>
    </Pressable>
  );
});

// ─── Tab bar: isolated component — only these 5 icons re-render on tab switch ───
function TabBar({ pagerRef }: { pagerRef: React.RefObject<any> }) {
  const activeTab = useTabStore((s) => s.activeTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const isOwnPressRef = useRef(false);

  // Sync PagerView when activeTab changes from an EXTERNAL source
  // (e.g. dashboard quick-link calling setActiveTab('inventory') directly)
  useEffect(() => {
    if (isOwnPressRef.current) {
      // Change came from our own handleTabPress — PagerView is already there
      isOwnPressRef.current = false;
      return;
    }
    // External change — move PagerView to match
    const idx = ROUTES.findIndex((r) => r.key === activeTab);
    if (idx !== -1) {
      pagerRef.current?.setPageWithoutAnimation(idx);
    }
  }, [activeTab, pagerRef]);

  const handleTabPress = useCallback((routeKey: string) => {
    // Skip if already on this tab
    if (routeKey === useTabStore.getState().activeTab) return;

    const index = ROUTES.findIndex((r) => r.key === routeKey);
    if (index !== -1) {
      // Mark as our own press so the useEffect above doesn't double-fire
      isOwnPressRef.current = true;
      // Native page swap (instant, runs on UI thread before React re-renders)
      pagerRef.current?.setPageWithoutAnimation(index);
      // Update JS state so tab icons highlight
      setActiveTab(routeKey);
    }
  }, [pagerRef, setActiveTab]);

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBar}>
        {ROUTES.map((route) => (
          <TabIcon
            key={route.key}
            routeKey={route.key}
            isActive={activeTab === route.key}
            onPressIn={() => handleTabPress(route.key)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Tab scene: memoized so it never re-renders from parent ───
const TabScene = React.memo(({ component: Component }: { component: React.ComponentType<any> }) => {
  return <Component />;
});

// ─── Main tabs container: does NOT subscribe to activeTab — zero re-renders on tab switch ───
export default function TabsScreen() {
  const isFocused = useIsFocused();
  const pagerRef = useRef<any>(null);
  const isUserSwipingRef = useRef(false);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    useTabStore.getState().setActiveTab('dashboard');
    pagerRef.current?.setPageWithoutAnimation(0);

    const timer = setTimeout(() => {
      hasMountedRef.current = true;
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Hardware Back Button: Return to Dashboard if not there, otherwise exit
  useEffect(() => {
    if (!isFocused) return;

    const onBackPress = () => {
      const currentTab = useTabStore.getState().activeTab;
      if (currentTab !== 'dashboard') {
        pagerRef.current?.setPageWithoutAnimation(0);
        useTabStore.getState().setActiveTab('dashboard');
        return true; 
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isFocused]);

  // Track PagerView scroll state to distinguish user swipes from programmatic changes
  const handlePageScrollStateChanged = useCallback((e: any) => {
    if (!hasMountedRef.current) return;
    const state = e.nativeEvent.pageScrollState;
    if (state === 'dragging') {
      isUserSwipingRef.current = true;
    } else if (state === 'idle') {
      isUserSwipingRef.current = false;
    }
  }, []);

  // Only update tab state for genuine user swipes.
  // Ignore initial layout/measurement scroll events on mount.
  const handlePageSelected = useCallback((e: any) => {
    if (!hasMountedRef.current || !isUserSwipingRef.current) return;

    const index = e.nativeEvent.position;
    const targetRoute = ROUTES[index];
    if (targetRoute) {
      const currentTab = useTabStore.getState().activeTab;
      if (currentTab !== targetRoute.key) {
        useTabStore.getState().setActiveTab(targetRoute.key);
      }
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageSelected={handlePageSelected}
          onPageScrollStateChanged={handlePageScrollStateChanged}
          overdrag={false}
          offscreenPageLimit={4}
        >
          {ROUTES.map((route) => (
            <View key={route.key} style={{ flex: 1 }}>
              <TabScene component={route.component} />
            </View>
          ))}
        </PagerView>
      </View>

      <TabBar pagerRef={pagerRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 90 : 76,
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingBottom: Platform.OS === 'ios' ? 22 : 8,
    paddingTop: 6,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  activeTabItem: {
    transform: [{ translateY: -3 }],
  },
  iconWrapper: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeIconWrapper: {
    width: 44,
    height: 32,
    borderRadius: 16,
  },
  activeCircle: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.28)',
  },
});
