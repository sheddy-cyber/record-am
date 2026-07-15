import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, View, Pressable, StyleSheet, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { useTabStore } from '@/store/tabStore';
import PagerView from 'react-native-pager-view';

// Import screens directly
import DashboardScreen from './_dashboard';
import InventoryScreen from './_inventory';
import SalesScreen from './_sales';
import DebtsScreen from './_debts';
import MoreScreen from './_more';

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  dashboard: 'aperture',
  inventory: 'box',
  sales: 'shopping-cart',
  debts: 'users',
  more: 'grid',
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
  const iconName = TAB_ICONS[routeKey] || 'circle';

  return (
    <Pressable
      onPressIn={onPressIn}
      android_ripple={null}
      style={styles.tabItem}
    >
      <View style={styles.iconWrapper}>
        {isActive && <View style={styles.activeCircle} />}
        <Feather 
          name={iconName} 
          size={22} 
          color={isActive ? COLORS.accent : "rgba(255,255,255,0.4)"} 
          style={{ position: 'absolute' }}
        />
      </View>
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
  // Tracks whether the user is actively swiping (dragging or settling).
  // PagerView reports: dragging → settling → onPageSelected → idle for swipes,
  // but fires NO scroll state changes for setPageWithoutAnimation() — only onPageSelected.
  // So we use this to distinguish swipes from programmatic page changes.
  const isUserSwipingRef = useRef(false);

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
    const state = e.nativeEvent.pageScrollState;
    if (state === 'dragging') {
      isUserSwipingRef.current = true;
    } else if (state === 'idle') {
      isUserSwipingRef.current = false;
    }
  }, []);

  // Only update tab state for genuine user swipes.
  // Programmatic setPageWithoutAnimation() also fires onPageSelected, but
  // without a preceding 'dragging' state — so isUserSwipingRef stays false.
  const handlePageSelected = useCallback((e: any) => {
    if (!isUserSwipingRef.current) return;

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
    <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? 88 : 72 }}>
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
  tabBar: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 88 : 72,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingTop: 8,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeCircle: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderRadius: 22,
  },
});
