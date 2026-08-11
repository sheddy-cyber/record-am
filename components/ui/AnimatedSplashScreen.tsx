import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, Easing } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { COLORS, FONT } from '@/constants';

interface Props {
  isAppReady: boolean;
  onAnimationComplete: () => void;
}

export function AnimatedSplashScreen({ isAppReady, onAnimationComplete }: Props) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    // Hide the native splash screen as soon as our custom one mounts
    SplashScreen.hideAsync().catch(() => undefined);
    
    // Ensure the splash screen is visible for at least 1.5 seconds
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 20,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  useEffect(() => {
    if (isAppReady && minTimeElapsed) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsAnimationComplete(true);
        onAnimationComplete();
      });
    }
  }, [isAppReady, minTimeElapsed, fadeAnim, onAnimationComplete]);

  if (isAnimationComplete) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        <Image
          source={require('@/assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Record Am</Text>
        <Text style={styles.slogan}>Sales, stocks, expenses? Record am.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: FONT.black,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  slogan: {
    fontSize: 14,
    fontFamily: FONT.medium,
    color: '#64748B',
    marginTop: 8,
  },
});
