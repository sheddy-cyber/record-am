import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Keyboard,
  KeyboardEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  TextInput,
  TextInputProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

type KeyboardAwareScrollContextValue = {
  scrollToInput: (target: TextInput | null) => void;
  clearFocusedInput: (target: TextInput | null) => void;
};

const KeyboardAwareScrollContext =
  createContext<KeyboardAwareScrollContextValue | null>(null);

export const useKeyboardAwareScroll = () =>
  useContext(KeyboardAwareScrollContext);

const assignRef = <T,>(ref: React.Ref<T> | undefined, value: T | null) => {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  (ref as React.MutableRefObject<T | null>).current = value;
};

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  extraScrollHeight?: number;
};

export const KeyboardAwareScrollView = React.forwardRef<
  ScrollView,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    extraScrollHeight = 20,
    keyboardShouldPersistTaps = "handled",
    keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
    onScroll,
    scrollEventThrottle = 16,
    ...props
  },
  forwardedRef,
) {
  const scrollRef = useRef<ScrollView>(null);
  const activeInputRef = useRef<TextInput | null>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const scrollYRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView, []);

  const ensureInputVisible = useCallback(
    (target: TextInput | null) => {
      const keyboardTop = keyboardTopRef.current;
      if (!target || keyboardTop === null) return;

      requestAnimationFrame(() => {
        target.measureInWindow((_x, y, _width, height) => {
          const inputBottom = y + height;
          const visibleBottom = keyboardTop - extraScrollHeight;

          if (inputBottom <= visibleBottom) return;

          const overlap = inputBottom - visibleBottom;
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollYRef.current + overlap),
            animated: true,
          });
        });
      });
    },
    [extraScrollHeight],
  );

  const scheduleScrollToInput = useCallback(
    (target: TextInput | null, delay = Platform.OS === "android" ? 140 : 40) => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        ensureInputVisible(target);
      }, delay);
    },
    [ensureInputVisible],
  );

  const scrollToInput = useCallback(
    (target: TextInput | null) => {
      activeInputRef.current = target;
      scheduleScrollToInput(target);
    },
    [scheduleScrollToInput],
  );

  const clearFocusedInput = useCallback((target: TextInput | null) => {
    if (!target || activeInputRef.current !== target) return;
    activeInputRef.current = null;
  }, []);

  useEffect(() => {
    const handleKeyboardFrame = (event: KeyboardEvent) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      scheduleScrollToInput(activeInputRef.current, Platform.OS === "android" ? 80 : 0);
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const frameEvent =
      Platform.OS === "ios" ? Keyboard.addListener("keyboardWillChangeFrame", handleKeyboardFrame) : null;
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardFrame);
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTopRef.current = null;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      frameEvent?.remove();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scheduleScrollToInput]);

  return (
    <KeyboardAwareScrollContext.Provider value={{ scrollToInput, clearFocusedInput }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        scrollEventThrottle={scrollEventThrottle}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAwareScrollContext.Provider>
  );
});

export const KeyboardAwareTextInput = React.forwardRef<TextInput, TextInputProps>(
  function KeyboardAwareTextInput({ onBlur, onFocus, ...props }, forwardedRef) {
    const inputRef = useRef<TextInput>(null);
    const keyboardAware = useKeyboardAwareScroll();

    return (
      <TextInput
        ref={(value) => {
          inputRef.current = value;
          assignRef(forwardedRef, value);
        }}
        onFocus={(event) => {
          keyboardAware?.scrollToInput(inputRef.current);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          keyboardAware?.clearFocusedInput(inputRef.current);
          onBlur?.(event);
        }}
        {...props}
      />
    );
  },
);
