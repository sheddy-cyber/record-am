import React, { useState, useEffect } from "react";
import { KeyboardAwareScrollView as LibraryKeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { TextInput, TextInputProps, Keyboard, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants";

export const formatAmountInput = (value: string | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  const strValue = String(value);
  const isNegative = strValue.startsWith('-');
  const cleaned = strValue.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.slice(0, 2).join('.');
  return isNegative ? `-${formatted}` : formatted;
};

export type KeyboardAwareScrollViewProps = React.ComponentProps<typeof LibraryKeyboardAwareScrollView>;

export const KeyboardAwareScrollView = React.forwardRef<
  any,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    keyboardShouldPersistTaps = "handled",
    enableOnAndroid = true,
    extraScrollHeight = 56,
    extraHeight = 56,
    enableResetScrollToCoords = false,
    contentContainerStyle,
    ...props
  },
  ref
) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const insets = useSafeAreaInsets();
  const flatStyle = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom = typeof flatStyle.paddingBottom === "number" ? flatStyle.paddingBottom : 24;

  const mergedContentContainerStyle = {
    ...flatStyle,
    paddingBottom: basePaddingBottom + keyboardHeight + insets.bottom,
  };

  return (
    <LibraryKeyboardAwareScrollView
      innerRef={(r: any) => {
        if (ref) {
          if (typeof ref === "function") {
            ref(r);
          } else {
            (ref as any).current = r;
          }
        }
      }}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      enableOnAndroid={enableOnAndroid}
      extraScrollHeight={extraScrollHeight}
      extraHeight={extraHeight}
      enableResetScrollToCoords={enableResetScrollToCoords}
      contentContainerStyle={mergedContentContainerStyle}
      {...props}
    >
      {children}
    </LibraryKeyboardAwareScrollView>
  );
});

export interface KeyboardAwareTextInputProps extends TextInputProps {
  isAmount?: boolean;
}

export const KeyboardAwareTextInput = React.forwardRef<TextInput, KeyboardAwareTextInputProps>(
  function KeyboardAwareTextInput({ isAmount, value, onChangeText, ...props }, ref) {
    const displayValue = isAmount ? formatAmountInput(value) : value;

    const handleChangeText = (text: string) => {
      if (isAmount) {
        onChangeText?.(text.replace(/,/g, ''));
      } else {
        onChangeText?.(text);
      }
    };

    return (
      <TextInput
        ref={ref}
        underlineColorAndroid="transparent"
        selectionColor={COLORS.accent}
        cursorColor={COLORS.accent}
        importantForAutofill="no"
        value={displayValue}
        onChangeText={handleChangeText}
        {...props}
        style={[
          {
            backgroundColor: '#FFFFFF',
          },
          props.style,
        ]}
      />
    );
  }
);

export const useKeyboardAwareScroll = () => undefined;
