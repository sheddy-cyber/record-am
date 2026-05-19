import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from 'react-native-gesture-handler';

const TAB_ROUTES = ['dashboard', 'inventory', 'sales', 'debts', 'more'] as const;

export type SwipeableTabName = (typeof TAB_ROUTES)[number];

export function SwipeableTabScreen({
  name,
  children,
}: {
  name: SwipeableTabName;
  children: React.ReactNode;
}) {
  const currentIndex = TAB_ROUTES.indexOf(name);

  const handleStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.END) return;

    const { translationX, translationY, velocityX } = event.nativeEvent;
    if (Math.abs(translationY) > 70) return;

    const isSwipe = Math.abs(translationX) > 72 || Math.abs(velocityX) > 700;
    if (!isSwipe) return;

    const nextIndex = translationX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextTab = TAB_ROUTES[nextIndex];
    if (!nextTab) return;

    router.replace(`/(app)/(tabs)/${nextTab}` as any);
  };

  return (
    <PanGestureHandler
      activeOffsetX={[-36, 36]}
      failOffsetY={[-18, 18]}
      onHandlerStateChange={handleStateChange}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </PanGestureHandler>
  );
}
