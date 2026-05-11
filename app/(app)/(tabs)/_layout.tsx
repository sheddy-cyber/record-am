import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW } from '@/constants';

function TabIcon({ name, focused }: { name: keyof typeof Feather.glyphMap; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 2 }}>
      <Feather
        name={name}
        size={20}
        color={focused ? COLORS.accent : COLORS.text.muted}
      />
      {focused ? (
        <View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: COLORS.accent,
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: COLORS.ink,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
          ...SHADOW.lg,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="package" focused={focused} /> }}
      />
      <Tabs.Screen
        name="sales"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="shopping-cart" focused={focused} /> }}
      />
      <Tabs.Screen
        name="debts"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="credit-card" focused={focused} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="menu" focused={focused} /> }}
      />
    </Tabs>
  );
}
