// ============================================================
// RECORD AM - Tappable building blocks
// Drop-in replacements for React Native's TouchableOpacity and Pressable.
// They wait a moment before showing the pressed look, so putting a finger on
// a card to scroll the list does not make the card react as if tapped: if the
// finger moves, the list takes the touch and the card never lights up. A quick
// tap still shows the pressed look and fires straight away, and long presses
// take the same time as before.
// Use these everywhere instead of the react-native ones (the tab bar is the
// exception: it sits outside any list and switches on touch-down).
// ============================================================

import React, { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  PressableProps,
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';

/**
 * How long a finger must rest before a control shows it is pressed. Long
 * enough for a scroll to start first, short enough to feel instant.
 */
export const PRESS_DELAY_MS = 130;

// React Native counts a long press from the delayed press-in, so take the
// delay off again to keep each long press as quick as it was set to be.
const longPressDelay = (delayLongPress: number | null | undefined, pressDelay: number) =>
  delayLongPress == null ? undefined : Math.max(10, delayLongPress - pressDelay);

export const TouchableOpacity = forwardRef<
  React.ComponentRef<typeof RNTouchableOpacity>,
  TouchableOpacityProps
>(function TouchableOpacity({ delayPressIn = PRESS_DELAY_MS, delayLongPress, ...props }, ref) {
  return (
    <RNTouchableOpacity
      ref={ref}
      delayPressIn={delayPressIn}
      delayLongPress={longPressDelay(delayLongPress, delayPressIn)}
      {...props}
    />
  );
});

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { unstable_pressDelay = PRESS_DELAY_MS, delayLongPress, ...props },
  ref,
) {
  return (
    <RNPressable
      ref={ref}
      unstable_pressDelay={unstable_pressDelay}
      delayLongPress={longPressDelay(delayLongPress, unstable_pressDelay)}
      {...props}
    />
  );
});
