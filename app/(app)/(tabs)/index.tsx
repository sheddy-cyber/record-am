import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT } from '@/constants';
import { useTabStore } from '@/store/tabStore';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
function TabBar({ onTabPress }: { onTabPress: (routeKey: string, index: number) => void }) {
  const insets = useSafeAreaInsets();
  const activeTab = useTabStore((s) => s.activeTab);

  return (
    <View style={styles.tabBarContainer}>
      <View style={[
        styles.tabBar,
        { 
          paddingBottom: Math.max(insets.bottom, 8),
          height: 62 + Math.max(insets.bottom, 8)
        }
      ]}>
        {ROUTES.map((route, index) => (
          <TabIcon
            key={route.key}
            routeKey={route.key}
            isActive={activeTab === route.key}
            onPressIn={() => onTabPress(route.key, index)}
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
  const hasMountedRef = useRef(false);
  const currentPageIndexRef = useRef(0);

  useEffect(() => {
    useTabStore.getState().setActiveTab('dashboard');
    currentPageIndexRef.current = 0;
    pagerRef.current?.setPageWithoutAnimation(0);

    const timer = setTimeout(() => {
      hasMountedRef.current = true;
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Sync PagerView when activeTab changes from an EXTERNAL source
  // (e.g. dashboard quick-link calling setActiveTab('inventory') directly)
  useEffect(() => {
    const unsub = useTabStore.subscribe((state) => {
      const targetIndex = ROUTES.findIndex((r) => r.key === state.activeTab);
      // Only command PagerView if it is NOT already on this page.
      // This ensures native swipe gestures are never abruptly interrupted with setPageWithoutAnimation.
      if (targetIndex !== -1 && targetIndex !== currentPageIndexRef.current) {
        currentPageIndexRef.current = targetIndex;
        pagerRef.current?.setPageWithoutAnimation(targetIndex);
      }
    });
    return unsub;
  }, []);

  // Hardware Back Button: Return to Dashboard if not there, otherwise exit
  useEffect(() => {
    if (!isFocused) return;

    const onBackPress = () => {
      const currentTab = useTabStore.getState().activeTab;
      if (currentTab !== 'dashboard') {
        currentPageIndexRef.current = 0;
        pagerRef.current?.setPageWithoutAnimation(0);
        useTabStore.getState().setActiveTab('dashboard');
        return true; 
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isFocused]);

  // Update tab state when a new page is selected during a swipe.
  // Note: we record currentPageIndexRef BEFORE updating activeTab so the external
  // listener doesn't redundantly call setPageWithoutAnimation and kill the momentum!
  const handlePageSelected = useCallback((e: any) => {
    if (!hasMountedRef.current) return;

    const index = e.nativeEvent.position;
    currentPageIndexRef.current = index;
    const targetRoute = ROUTES[index];
    if (targetRoute) {
      const currentTab = useTabStore.getState().activeTab;
      if (currentTab !== targetRoute.key) {
        useTabStore.getState().setActiveTab(targetRoute.key);
      }
    }
  }, []);

  const handleTabPress = useCallback((routeKey: string, index: number) => {
    if (routeKey === useTabStore.getState().activeTab) return;

    currentPageIndexRef.current = index;
    pagerRef.current?.setPageWithoutAnimation(index);
    useTabStore.getState().setActiveTab(routeKey);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageSelected={handlePageSelected}
          overdrag={true}
          overScrollMode="auto"
          offscreenPageLimit={4}
        >
          {ROUTES.map((route) => (
            <View key={route.key} style={{ flex: 1 }}>
              <TabScene component={route.component} />
            </View>
          ))}
        </PagerView>
      </View>

      <TabBar onTabPress={handleTabPress} />
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
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
