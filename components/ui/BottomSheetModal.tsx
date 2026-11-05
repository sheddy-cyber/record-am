import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS, SP } from '@/constants';

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
}

export function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  contentStyle,
  showHandle = true,
  showCloseButton = true,
  maxHeight = '88%',
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();

  // Track closing animation state without delaying initial mount
  const [isClosing, setIsClosing] = useState(false);
  const isMounted = visible || isClosing;

  // Stored sheet height in a ref so layout measurement never triggers a mid-animation re-render
  const sheetHeightRef = useRef<number>(360);

  // Initialize translateY right at the bottom edge for instant 0ms entry
  const translateY = useRef(new Animated.Value(360)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  // Run entrance/dismissal animation immediately when visible changes
  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setIsClosing(false);

      // Start right at the bottom edge
      const startY = sheetHeightRef.current || 360;
      translateY.setValue(startY);
      backdropOpacity.setValue(0);

      // Start animation immediately — 0ms delay, rapid 200ms cubic rise
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          // Cubic decelerate curve: peak upward velocity at t=0 so it begins rising instantaneously upon tap
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isMounted && !isClosingRef.current) {
      handleDismiss();
    }
  }, [visible]);

  const handleDismiss = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);

    const exitY = sheetHeightRef.current || 360;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: exitY,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsClosing(false);
      isClosingRef.current = false;
      onClose();
    });
  };

  // Android hardware back button listener
  useEffect(() => {
    if (!isMounted) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismiss();
      return true;
    });

    return () => backHandler.remove();
  }, [isMounted]);

  // Swipe-down-to-dismiss responder on the handle area
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 70 || gesture.vy > 0.5) {
          handleDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            mass: 0.8,
            stiffness: 260,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 60) {
      sheetHeightRef.current = h;
    }
  };

  if (!isMounted) return null;

  return (
    <Modal
      transparent
      visible={isMounted}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalRoot}>
        {/* Animated Dim Backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropOpacity,
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </Animated.View>

        {/* Animated Bottom Sheet */}
        <Animated.View
          onLayout={onSheetLayout}
          style={[
            styles.sheetContainer,
            {
              maxHeight: maxHeight as any,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY }],
            },
            contentStyle,
          ]}
        >
          {showHandle && (
            <View {...panResponder.panHandlers} style={styles.handleContainer}>
              <View style={styles.handleBar} />
            </View>
          )}

          {(title || showCloseButton) && (
            <View style={styles.headerRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
                {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
              </View>

              {showCloseButton && (
                <TouchableOpacity
                  onPress={handleDismiss}
                  style={styles.closeCircleButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={17} color={COLORS.text.muted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  sheetContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingHorizontal: SP.page,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  closeCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
