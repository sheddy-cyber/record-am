import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler, Animated } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '@/constants';
import { useTabStore } from '@/store/tabStore';
import { useVoiceStore } from '@/store/voiceStore';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import screens directly
import DashboardScreen from './_dashboard';
import InventoryScreen from './_inventory';
import SalesScreen from './_sales';
import MoreScreen from './_more';

const TAB_CONFIG: Record<string, { label: string; icon: keyof typeof Feather.glyphMap }> = {
  dashboard: { label: 'Hub', icon: 'home' },
  inventory: { label: 'Inventory', icon: 'box' },
  sales: { label: 'Sales', icon: 'shopping-cart' },
  more: { label: 'More', icon: 'grid' },
};

const ROUTES = [
  { key: 'dashboard', component: DashboardScreen },
  { key: 'inventory', component: InventoryScreen },
  { key: 'sales', component: SalesScreen },
  { key: 'more', component: MoreScreen },
];

const ACTIVE_TAB_COLOR = COLORS.gold; // Canary Gold — aligned with today's revenue & executive highlights
const ACTIVE_TAB_BG = COLORS.goldMuted;
const ACTIVE_TAB_BORDER = 'rgba(250, 204, 21, 0.32)';

const INACTIVE_TAB_COLOR = '#94A3B8'; // Crisp silver-slate on deep slate obsidian dock

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
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0.94)).current;
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (isActive) {
      scaleAnim.setValue(0.85);
      Animated.spring(scaleAnim, {
        toValue: 1,
        bounciness: 7,
        speed: 20,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 0.94,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive, scaleAnim]);

  const handlePressIn = () => {
    if (isActive) {
      // Subtle single spring pulse if user taps the current active tab
      scaleAnim.setValue(0.92);
      Animated.spring(scaleAnim, {
        toValue: 1,
        bounciness: 6,
        speed: 20,
        useNativeDriver: true,
      }).start();
    }
    onPressIn();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      android_ripple={null}
      style={styles.tabItem}
    >
      <Animated.View
        style={[
          styles.iconWrapper,
          isActive && styles.activeIconWrapper,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Feather 
          name={config.icon} 
          size={20} 
          color={isActive ? ACTIVE_TAB_COLOR : INACTIVE_TAB_COLOR} 
        />
      </Animated.View>
      <Text
        style={{
          fontSize: 10.5,
          fontFamily: isActive ? FONT.bold : FONT.medium,
          color: isActive ? ACTIVE_TAB_COLOR : INACTIVE_TAB_COLOR,
          marginTop: 2,
          letterSpacing: isActive ? -0.1 : 0,
        }}
        numberOfLines={1}
      >
        {config.label}
      </Text>
    </Pressable>
  );
});

// ─── Prominent Center Mic Action Button ───────────────────────────────────────
const CenterMicButton = React.memo(function CenterMicButton({
  onPress,
  isListening,
}: {
  onPress: () => void;
  isListening: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      bounciness: 4,
      speed: 25,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      bounciness: 8,
      speed: 20,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.centerMicWrapper}
      android_ripple={null}
      accessibilityRole="button"
      accessibilityLabel="Voice Command"
    >
      <Animated.View
        style={[
          styles.centerMicCircle,
          isListening && styles.centerMicListening,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Feather
          name="mic"
          size={25}
          color={isListening ? '#FFFFFF' : '#0F172A'}
        />
      </Animated.View>
      <Text style={styles.centerMicLabel}>Voice</Text>
    </Pressable>
  );
});

// ─── Tab bar: isolated component — 4 tabs + prominent center mic button ───────
function TabBar({ onTabPress }: { onTabPress: (routeKey: string, index: number) => void }) {
  const insets = useSafeAreaInsets();
  const activeTab = useTabStore((s) => s.activeTab);
  const openVoice = useVoiceStore((s) => s.open);
  const isListening = useVoiceStore((s) => s.state === 'listening');

  return (
    <View style={styles.tabBarContainer}>
      <View style={[
        styles.tabBar,
        { 
          paddingBottom: Math.max(insets.bottom, 8),
          height: 64 + Math.max(insets.bottom, 8)
        }
      ]}>
        {/* Hub */}
        <TabIcon
          routeKey="dashboard"
          isActive={activeTab === 'dashboard'}
          onPressIn={() => onTabPress('dashboard', 0)}
        />

        {/* Inventory */}
        <TabIcon
          routeKey="inventory"
          isActive={activeTab === 'inventory'}
          onPressIn={() => onTabPress('inventory', 1)}
        />

        {/* Center Mic Button */}
        <CenterMicButton onPress={openVoice} isListening={isListening} />

        {/* Sales */}
        <TabIcon
          routeKey="sales"
          isActive={activeTab === 'sales'}
          onPressIn={() => onTabPress('sales', 2)}
        />

        {/* More */}
        <TabIcon
          routeKey="more"
          isActive={activeTab === 'more'}
          onPressIn={() => onTabPress('more', 3)}
        />
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
  const insets = useSafeAreaInsets();
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
          offscreenPageLimit={3}
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
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.navPanel, // Deep Slate Obsidian (#0F172A)
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 6,
    overflow: 'visible',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
  },
  iconWrapper: {
    width: 48,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconWrapper: {
    backgroundColor: ACTIVE_TAB_BG,
    borderWidth: 1,
    borderColor: ACTIVE_TAB_BORDER,
    borderRadius: 14,
  },
  centerMicWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    marginTop: -16,
  },
  centerMicCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.navPanel,
  },
  centerMicListening: {
    backgroundColor: '#EF4444',
  },
  centerMicLabel: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.gold,
    marginTop: 2,
    letterSpacing: 0.1,
  },
});
