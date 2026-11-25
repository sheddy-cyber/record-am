import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { COLORS, FONT, SP } from '@/constants';

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  showHandle?: boolean;
  showCloseButton?: boolean;
  maxHeight?: number | string;
  /** Optional element shown at the right of the title row instead of the close button. */
  headerRight?: React.ReactNode;
}

const SCREEN_H = Dimensions.get('window').height;

export function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  contentStyle,
  showHandle = true,
  showCloseButton = true,
  maxHeight = '90%',
  headerRight,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const [isClosing, setIsClosing] = useState(false);
  const isMounted = visible || isClosing;

  const sheetHeightRef = useRef<number>(SCREEN_H * 0.6);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: sheetHeightRef.current + 40,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      closingRef.current = false;
      setIsClosing(false);
      onCloseRef.current();
    });
  };

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setIsClosing(false);
      translateY.setValue(sheetHeightRef.current + 40);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 28,
          stiffness: 340,
          mass: 0.8,
          overshootClamping: true,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isMounted && !closingRef.current) {
      dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!isMounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        translateY.setValue(g.dy > 0 ? g.dy : g.dy * 0.15);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.6) {
          dismiss();
        } else {
          Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 300, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 60) sheetHeightRef.current = h;
  };

  if (!isMounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.root}>
          <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
          </Animated.View>

          <Animated.View
            onLayout={onLayout}
            style={[
              styles.sheet,
              { maxHeight: maxHeight as any, paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
              contentStyle,
            ]}
          >
            <View {...pan.panHandlers}>
              {showHandle ? (
                <View style={styles.handleArea}>
                  <View style={styles.handle} />
                </View>
              ) : (
                <View style={{ height: 14 }} />
              )}

              {title || showCloseButton || headerRight ? (
                <View style={styles.header}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    {title ? <Text style={styles.title}>{title}</Text> : null}
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                  </View>
                  {headerRight ??
                    (showCloseButton ? (
                      <Pressable
                        onPress={dismiss}
                        hitSlop={10}
                        accessibilityLabel="Close"
                        style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
                      >
                        <Icon name="x" size={15} color={COLORS.text.secondary} strokeWidth={2.2} />
                      </Pressable>
                    ) : null)}
                </View>
              ) : null}
            </View>

            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.scrim },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: SP.page,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: COLORS.borderDark },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 },
  title: { fontSize: 19, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.35 },
  subtitle: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3, lineHeight: 18 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
