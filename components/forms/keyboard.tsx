import React, { useState, useEffect } from "react";
import { KeyboardAwareScrollView as LibraryKeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { TextInput, TextInputProps, Keyboard, Platform, StyleSheet } from "react-native";

export type KeyboardAwareScrollViewProps = React.ComponentProps<typeof LibraryKeyboardAwareScrollView>;

export const KeyboardAwareScrollView = React.forwardRef<
  any,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    keyboardShouldPersistTaps = "handled",
    enableOnAndroid = true,
    extraScrollHeight = 130,
    extraHeight = 130,
    contentContainerStyle,
    ...props
  },
  ref
) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const flatStyle = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom = typeof flatStyle.paddingBottom === "number" ? flatStyle.paddingBottom : 20;

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
      contentContainerStyle={mergedContentContainerStyle}
      {...props}
    >
      {children}
    </LibraryKeyboardAwareScrollView>
  );
});

export const KeyboardAwareTextInput = React.forwardRef<TextInput, TextInputProps>(
  function KeyboardAwareTextInput(props, ref) {
    return <TextInput ref={ref} {...props} />;
  }
);

export const useKeyboardAwareScroll = () => undefined;
