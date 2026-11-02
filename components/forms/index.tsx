import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ViewStyle, TextInputProps, Modal, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
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
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={COLORS.text.muted} />
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
      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ fontFamily: FONT.regular, color: COLORS.danger }}> *</Text> : null}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: RADIUS.md,
          borderWidth: focused ? 1 : StyleSheet.hairlineWidth,
          paddingHorizontal: 14,
          backgroundColor: COLORS.card,
          borderColor: error ? COLORS.danger : focused ? COLORS.accent : COLORS.border,
          minHeight: 50,
          overflow: 'hidden',
        }}
      >
        {leftIcon}
        {displayPrefix ? <Text style={{ fontSize: 14.5, fontFamily: FONT.medium, color: COLORS.text.secondary }}>{displayPrefix}</Text> : null}
        <TextInput
          ref={inputRef}
          secureTextEntry={effectiveSecureTextEntry}
          underlineColorAndroid="transparent"
          selectionColor={COLORS.accent}
          cursorColor={COLORS.accent}
          placeholderTextColor={COLORS.text.muted}
          importantForAutofill="no"
          value={displayValue}
          onChangeText={handleChangeText}
          {...props}
          style={[
            {
              flex: 1,
              fontSize: 15,
              fontFamily: FONT.regular,
              color: COLORS.text.primary,
              paddingVertical: 12,
              backgroundColor: 'transparent',
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
        {displaySuffix ? <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted }}>{displaySuffix}</Text> : null}
        {renderRightElement()}
      </View>
      {error ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.danger, marginTop: 5 }}>{error}</Text> : null}
      {!error && hint ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 5 }}>{hint}</Text> : null}
    </View>
  );
};

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
      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ fontFamily: FONT.regular, color: COLORS.danger }}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: RADIUS.md,
          borderWidth: open ? 1 : StyleSheet.hairlineWidth,
          paddingHorizontal: 14,
          minHeight: 50,
          backgroundColor: COLORS.card,
          borderColor: error ? COLORS.danger : open ? COLORS.accent : COLORS.border,
        }}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: selected ? COLORS.text.primary : COLORS.text.muted, flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.text.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            justifyContent: 'center',
            paddingHorizontal: SP.lg,
            paddingVertical: 32,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: RADIUS.xl,
              maxHeight: 440,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: SP.card,
                paddingVertical: 16,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: COLORS.borderSubtle,
                backgroundColor: COLORS.surface2,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={18} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: SP.card,
                      paddingVertical: 14,
                      borderBottomWidth: index < options.length - 1 ? StyleSheet.hairlineWidth : 0,
                      borderBottomColor: COLORS.borderSubtle,
                      backgroundColor: isSelected ? COLORS.accentLight : COLORS.card,
                    }}
                    activeOpacity={0.7}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontFamily: isSelected ? FONT.bold : FONT.regular,
                        color: isSelected ? COLORS.accentMuted : COLORS.text.primary,
                      }}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? <Feather name="check" size={16} color={COLORS.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {error ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.danger, marginTop: 5 }}>{error}</Text> : null}
    </View>
  );
};

// ─── Toggle ─────────────────────────────────────────────────────────────────

export const Toggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}> = ({ label, value, onChange, description }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.card, paddingVertical: 2 }}>
    <View style={{ flex: 1, marginRight: SP.card }}>
      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.1 }}>{label}</Text>
      {description ? (
        <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, lineHeight: 17 }}>{description}</Text>
      ) : null}
    </View>
    <TouchableOpacity
      style={{
        width: 50,
        height: 28,
        borderRadius: RADIUS.full,
        padding: 3,
        justifyContent: 'center',
        backgroundColor: value ? COLORS.ink : COLORS.borderDark,
      }}
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: RADIUS.full,
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: value ? 22 : 0 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 2,
          elevation: 2,
        }}
      />
    </TouchableOpacity>
  </View>
);

export { KeyboardAwareScrollView, KeyboardAwareTextInput } from './keyboard';
