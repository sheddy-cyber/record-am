import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, TextInput, ScrollView, ViewStyle, TextInputProps, StyleSheet } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import { haptics } from '@/lib/haptics';
import { Icon } from '@/components/icons';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { useKeyboardAwareScroll, formatAmountInput } from './keyboard';

// ─── Input Field ────────────────────────────────────────────────────────────

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  containerStyle?: ViewStyle;
  required?: boolean;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  isPassword?: boolean;
  isAmount?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  error,
  hint,
  prefix,
  suffix,
  containerStyle,
  required,
  leftIcon,
  rightElement,
  isPassword,
  isAmount,
  secureTextEntry,
  onFocus,
  onBlur,
  onChangeText,
  value,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardAware = useKeyboardAwareScroll();
  const displayPrefix = prefix?.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  const displaySuffix = suffix?.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  const effectiveSecureTextEntry = isPassword ? !showPassword : secureTextEntry;

  const renderRightElement = () => {
    if (isPassword) {
      return (
        <Pressable
          onPress={() => setShowPassword((prev) => !prev)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({
            padding: 6,
            opacity: pressed ? 0.6 : 1,
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer' as any,
          })}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} color={COLORS.text.muted} />
        </Pressable>
      );
    }
    return rightElement;
  };

  const displayValue = isAmount ? formatAmountInput(value) : value;

  const handleChangeText = (text: string) => {
    if (isAmount) {
      onChangeText?.(text.replace(/,/g, ''));
    } else {
      onChangeText?.(text);
    }
  };

  return (
    <View style={[{ marginBottom: SP.card }, containerStyle]}>
      {label ? (
        <Text style={labelStyle}>
          {label}
          {required ? <Text style={{ color: COLORS.accent }}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{
          flexDirection: 'row',
          alignItems: props.multiline ? 'flex-start' : 'center',
          gap: 10,
          borderRadius: 14,
          borderCurve: 'continuous',
          borderWidth: 1,
          paddingHorizontal: 14,
          backgroundColor: props.editable === false ? COLORS.surface2 : COLORS.card,
          borderColor: error ? COLORS.danger : focused ? COLORS.text.primary : COLORS.border,
          minHeight: 52,
          overflow: 'hidden',
        }}
      >
        {leftIcon}
        {displayPrefix ? (
          <Text style={{ fontSize: 16, fontFamily: FONT.medium, color: COLORS.text.muted }}>{displayPrefix}</Text>
        ) : null}
        <TextInput
          ref={inputRef}
          secureTextEntry={effectiveSecureTextEntry}
          underlineColorAndroid="transparent"
          selectionColor={COLORS.accent}
          cursorColor={COLORS.text.primary}
          placeholderTextColor={COLORS.text.faint}
          importantForAutofill="no"
          value={displayValue}
          onChangeText={handleChangeText}
          {...props}
          style={[
            {
              flex: 1,
              fontSize: 16,
              fontFamily: isAmount ? FONT.medium : FONT.regular,
              color: COLORS.text.primary,
              paddingVertical: props.multiline ? 14 : 0,
              textAlignVertical: props.multiline ? 'top' : 'center',
              includeFontPadding: false,
              backgroundColor: 'transparent',
              minHeight: props.multiline ? 88 : 50,
              fontVariant: isAmount ? ['tabular-nums'] : undefined,
            },
            props.style,
          ]}
          onFocus={(event) => {
            setFocused(true);
            (keyboardAware as any)?.scrollToInput?.(inputRef.current);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            (keyboardAware as any)?.clearFocusedInput?.(inputRef.current);
            onBlur?.(event);
          }}
        />
        {displaySuffix ? <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted }}>{displaySuffix}</Text> : null}
        {renderRightElement()}
      </Pressable>
      {error ? <Text style={{ ...TYPE.footnote, color: COLORS.dangerText, marginTop: 6, marginLeft: 2 }}>{error}</Text> : null}
      {!error && hint ? <Text style={{ ...TYPE.footnote, color: COLORS.text.muted, marginTop: 6, marginLeft: 2, lineHeight: 16 }}>{hint}</Text> : null}
    </View>
  );
};

const labelStyle = {
  fontSize: 13.5,
  fontFamily: FONT.medium,
  color: COLORS.text.secondary,
  marginBottom: 7,
  marginLeft: 2,
} as const;

// ─── Select Field ───────────────────────────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  options,
  onChange,
  error,
  placeholder = 'Select an option',
  required,
  containerStyle,
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={[{ marginBottom: SP.card }, containerStyle]}>
      {label ? (
        <Text style={labelStyle}>
          {label}
          {required ? <Text style={{ color: COLORS.accent }}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 14,
          borderCurve: 'continuous',
          borderWidth: 1,
          paddingHorizontal: 14,
          minHeight: 52,
          backgroundColor: pressed ? COLORS.surface2 : COLORS.card,
          borderColor: error ? COLORS.danger : open ? COLORS.text.primary : COLORS.border,
        })}
        onPress={() => setOpen(true)}
      >
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, fontFamily: FONT.regular, color: selected ? COLORS.text.primary : COLORS.text.faint, flex: 1 }}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Icon name="chevron-down" size={17} color={COLORS.text.muted} />
      </Pressable>

      <BottomSheetModal visible={open} onClose={() => setOpen(false)} title={label} maxHeight="75%" scroll={false}>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 18,
              borderCurve: 'continuous',
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: COLORS.border,
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    minHeight: 50,
                    borderBottomWidth: index < options.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: COLORS.border,
                    backgroundColor: pressed ? COLORS.surface2 : 'transparent',
                  })}
                  onPress={() => {
                    haptics.selection();
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15.5,
                      fontFamily: isSelected ? FONT.semiBold : FONT.regular,
                      color: COLORS.text.primary,
                      flex: 1,
                    }}
                  >
                    {option.label}
                  </Text>
                  {isSelected ? <Icon name="check" size={18} color={COLORS.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </BottomSheetModal>
      {error ? <Text style={{ ...TYPE.footnote, color: COLORS.dangerText, marginTop: 6, marginLeft: 2 }}>{error}</Text> : null}
    </View>
  );
};

// ─── Toggle ─────────────────────────────────────────────────────────────────

export const Toggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, description, disabled }) => (
  <Pressable
    disabled={disabled}
    onPress={() => {
      haptics.selection();
      onChange(!value);
    }}
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SP.card,
      paddingVertical: 2,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <View style={{ flex: 1, marginRight: SP.card }}>
      <Text style={{ fontSize: 15.5, fontFamily: FONT.regular, color: COLORS.text.primary, letterSpacing: -0.15 }}>{label}</Text>
      {description ? (
        <Text style={{ ...TYPE.footnote, color: COLORS.text.muted, marginTop: 3, lineHeight: 17 }}>{description}</Text>
      ) : null}
    </View>
    <Switch value={value} />
  </Pressable>
);

/** Visual switch. Wrap it in something pressable; it animates on its own. */
export function Switch({ value }: { value: boolean }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, speed: 22, bounciness: 5, useNativeDriver: false }).start();
  }, [value, anim]);
  return (
    <Animated.View
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 2,
        justifyContent: 'center',
        backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.borderDark, COLORS.ink] }),
      }}
    >
      <Animated.View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 2,
        }}
      />
    </Animated.View>
  );
}

export { KeyboardAwareScrollView, KeyboardAwareTextInput } from './keyboard';
