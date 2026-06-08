import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View, Pressable, StyleSheet, Animated, useWindowDimensions, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { TabView, SceneMap } from 'react-native-tab-view';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { useTabStore } from '@/store/tabStore';

// Import screens directly
import DashboardScreen from './_dashboard';
import InventoryScreen from './_inventory';
import SalesScreen from './_sales';
import DebtsScreen from './_debts';
import MoreScreen from './_more';

const renderScene = SceneMap({
  dashboard: DashboardScreen,
  inventory: InventoryScreen,
  sales: SalesScreen,
  debts: DebtsScreen,
  more: MoreScreen,
});

const AnimatedFeather = Animated.createAnimatedComponent(Feather);

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  dashboard: 'aperture',
  inventory: 'box',
  sales: 'shopping-cart',
  debts: 'users',
  more: 'grid',
};

function TabItem({
  route,
  index,
  position,
  jumpTo,
}: {
  route: any;
  index: number;
  position: Animated.AnimatedInterpolation<number>;
  jumpTo: (key: string) => void;
}) {
  const iconName = TAB_ICONS[route.key] || 'circle';

  // Use a very sharp interpolation to avoid "ghost" highlights.
  // The highlight only appears when the position is very close to the index.
  const activeOpacity = position.interpolate({
    inputRange: [index - 0.01, index, index + 0.01],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  const inactiveOpacity = position.interpolate({
    inputRange: [index - 0.01, index, index + 0.01],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Pressable
      onPress={() => jumpTo(route.key)}
      android_ripple={null}
      style={styles.tabItem}
    >
      <View style={styles.iconWrapper}>
        <Animated.View style={[styles.activeCircle, { opacity: activeOpacity }]} />
        <Animated.View style={[styles.iconLayer, { opacity: inactiveOpacity }]}>
          <Feather name={iconName} size={22} color="rgba(255,255,255,0.4)" />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, { opacity: activeOpacity }]}>
          <Feather name={iconName} size={22} color={COLORS.accent} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

export default function TabsScreen() {
  const layout = useWindowDimensions();
  const activeTab = useTabStore((s) => s.activeTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const isFocused = useIsFocused();

  const [routes] = useState([
    { key: 'dashboard', title: 'Dashboard' },
    { key: 'inventory', title: 'Inventory' },
    { key: 'sales', title: 'Sales' },
    { key: 'debts', title: 'Debts' },
    { key: 'more', title: 'More' },
  ]);

  // We use local state for the index to ensure the UI (both TabView and Highlights)
  // reacts instantly to taps and swipes.
  const [localIndex, setLocalIndex] = useState(() => {
    const idx = routes.findIndex(r => r.key === activeTab);
    return idx === -1 ? 0 : idx;
  });

  // Keep local index in sync with store changes (like hardware back button)
  useEffect(() => {
    const idx = routes.findIndex(r => r.key === activeTab);
    if (idx !== -1 && idx !== localIndex) {
      setLocalIndex(idx);
    }
  }, [activeTab, routes]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setLocalIndex(newIndex);
    const newTab = routes[newIndex].key;
    // Update store in the background
    setActiveTab(newTab);
  }, [routes, setActiveTab]);

  // Hardware Back Button: Return to Dashboard if not there, otherwise exit
  useEffect(() => {
    if (!isFocused) return;

    const onBackPress = () => {
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        return true; 
      }
      
      return false; // Allow default (exit app)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isFocused, activeTab, setActiveTab]);

  const renderTabBar = (props: any) => {
    return (
      <View style={styles.tabBar}>
        {props.navigationState.routes.map((route: any, i: number) => (
          <TabItem
            key={route.key}
            route={route}
            index={i}
            position={props.position}
            jumpTo={props.jumpTo}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <TabView
        navigationState={{ index: localIndex, routes }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={handleIndexChange}
        initialLayout={{ width: layout.width }}
        tabBarPosition="bottom"
        animationEnabled={true}
        lazy={true}
      />
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
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
