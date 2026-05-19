import { Tabs } from 'expo-router';
import { Platform, View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT } from '@/constants';

function TabIcon({ name, label, focused }: { name: keyof typeof Feather.glyphMap; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 4 }}>
      <Feather
        name={name}
        size={20}
        color={focused ? COLORS.accent : 'rgba(239,239,208,0.45)'}
      />
      <Text
        style={{
          fontSize: 10,
          fontFamily: FONT.medium,
          color: focused ? COLORS.accent : 'rgba(239,239,208,0.45)',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
      {focused ? (
        <View
          style={{
            width: 18,
            height: 2,
            borderRadius: 1,
            backgroundColor: COLORS.accent,
            marginTop: 1,
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
          borderTopWidth: 1,
          borderTopColor: 'rgba(239,239,208,0.08)',
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="home" label="Home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="package" label="Stock" focused={focused} /> }}
      />
      <Tabs.Screen
        name="sales"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="shopping-cart" label="Sales" focused={focused} /> }}
      />
      <Tabs.Screen
        name="debts"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="credit-card" label="Debts" focused={focused} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="menu" label="More" focused={focused} /> }}
      />
    </Tabs>
  );
}
