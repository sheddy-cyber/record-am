import React, { useState, useEffect } from "react";
import { KeyboardAwareScrollView as LibraryKeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { TextInput, TextInputProps, Keyboard, Platform, StyleSheet } from "react-native";
import { COLORS } from "@/constants";

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

  const flatStyle = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom = typeof flatStyle.paddingBottom === "number" ? flatStyle.paddingBottom : 24;

  const mergedContentContainerStyle = {
    ...flatStyle,
    paddingBottom: basePaddingBottom + keyboardHeight,
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

export const KeyboardAwareTextInput = React.forwardRef<TextInput, TextInputProps>(
  function KeyboardAwareTextInput(props, ref) {
    return (
      <TextInput
        ref={ref}
        underlineColorAndroid="transparent"
        selectionColor={COLORS.accent}
        cursorColor={COLORS.accent}
        importantForAutofill="no"
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
