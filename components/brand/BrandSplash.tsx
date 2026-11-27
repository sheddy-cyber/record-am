// ============================================================
// RECORD AM - Launch splash
// Picks up exactly where the native splash leaves off (same tile, same size,
// same place on the same paper), so the hand-over is invisible. If loading
// takes a moment the dot of the "r." breathes; when the first screen is
// ready the tile lifts slightly and the splash fades away to reveal it.
// The native splash images are made by scripts/generate-brand-assets.js with
// the same tile size (SPLASH_TILE_DP).
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { BrandMark } from '@/components/layout';
import { COLORS, FONT } from '@/constants';

export const SPLASH_TILE_SIZE = 112;

/** The cream of the glyph on the clay tile (see BrandMark). */
const GLYPH = '#FAF6EF';

// Where the dot of the "r." sits on the 100-unit tile (glyph scaled 1.18
// around 50,52; see BrandMark).
const DOT = { cx: 50 + (62.5 - 50) * 1.18, cy: 52 + (64.5 - 52) * 1.18, r: 6.8 * 1.18 };

/** Longest the splash will wait before showing the app anyway. */
const MAX_WAIT_MS = 10000;

export function BrandSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const dot = useRef(new Animated.Value(1)).current;
  const caption = useRef(new Animated.Value(0)).current;
  const [timedOut, setTimedOut] = useState(false);
  const hidNative = useRef(false);
  // The native splash centres the tile on the whole screen. The app's root
  // view starts at the top of the screen but can be taller than it (Android
  // edge-to-edge), so centring inside the view would put the tile lower.
  // Place it against the screen height instead.
  const tileTop = Math.round(Dimensions.get('screen').height / 2 - SPLASH_TILE_SIZE / 2);
  const leaving = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const done = ready || timedOut;

  // Breathe the dot, then show a line of text, only if loading is slow.
  useEffect(() => {
    if (done) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 0.3, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const startBreathing = setTimeout(() => breathe.start(), 700);
    const showCaption = setTimeout(
      () => Animated.timing(caption, { toValue: 1, duration: 400, useNativeDriver: true }).start(),
      2500,
    );
    const giveUp = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => {
      clearTimeout(startBreathing);
      clearTimeout(showCaption);
      clearTimeout(giveUp);
      breathe.stop();
    };
  }, [done, dot, caption]);

  // Ready: settle the dot, lift the tile a touch and fade out.
  useEffect(() => {
    if (!done || leaving.current) return;
    leaving.current = true;
    // One frame so the first screen has painted underneath.
    const frame = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(dot, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 280, delay: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => onDoneRef.current());
    });
    return () => cancelAnimationFrame(frame);
  }, [done, dot, lift, opacity]);

  // Hide the native splash once this one has been drawn in the same place.
  const hideNative = () => {
    if (hidNative.current) return;
    hidNative.current = true;
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    });
  };

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const k = SPLASH_TILE_SIZE / 100;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}
      pointerEvents={done ? 'none' : 'auto'}
      onLayout={hideNative}
    >
      <Animated.View style={[styles.tile, { top: tileTop, transform: [{ scale }] }]}>
        <BrandMark size={SPLASH_TILE_SIZE} hideDot />
        <Animated.View
          style={{
            position: 'absolute',
            left: (DOT.cx - DOT.r) * k,
            top: (DOT.cy - DOT.r) * k,
            width: DOT.r * 2 * k,
            height: DOT.r * 2 * k,
            borderRadius: DOT.r * k,
            backgroundColor: GLYPH,
            opacity: dot,
          }}
        />
      </Animated.View>
      <Animated.View style={[styles.captionWrap, { opacity: caption }]}>
        <Text style={styles.caption}>Getting your records ready</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  tile: { position: 'absolute', width: SPLASH_TILE_SIZE, height: SPLASH_TILE_SIZE },
  captionWrap: { position: 'absolute', left: 0, right: 0, bottom: '30%', alignItems: 'center' },
  caption: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, letterSpacing: 0.1 },
});
