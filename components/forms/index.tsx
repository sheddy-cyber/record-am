import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ViewStyle, TextInputProps, Modal, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import { useKeyboardAwareScroll } from './keyboard';

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
  onFocus,
  onBlur,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardAware = useKeyboardAwareScroll();
  const displayPrefix = prefix?.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  const displaySuffix = suffix?.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return (
    <View style={[{ marginBottom: SP.card }, containerStyle]}>
      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.secondary, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ fontFamily: FONT.regular, color: COLORS.danger }}> *</Text> : null}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          paddingHorizontal: 14,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: error ? COLORS.danger : focused ? COLORS.accent : COLORS.border,
          minHeight: 48,
        }}
      >
        {leftIcon}
        {displayPrefix ? <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.secondary }}>{displayPrefix}</Text> : null}
        <TextInput
          ref={inputRef}
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: FONT.regular,
            color: COLORS.text.primary,
            paddingVertical: 12,
          }}
          placeholderTextColor={COLORS.text.muted}
          onFocus={(event) => {
            setFocused(true);
            keyboardAware?.scrollToInput(inputRef.current);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            keyboardAware?.clearFocusedInput(inputRef.current);
            onBlur?.(event);
          }}
          {...props}
        />
        {displaySuffix ? <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted }}>{displaySuffix}</Text> : null}
        {rightElement}
      </View>
      {error ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.danger, marginTop: 4 }}>{error}</Text> : null}
      {!error && hint ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>{hint}</Text> : null}
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
      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.secondary, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ fontFamily: FONT.regular, color: COLORS.danger }}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: RADIUS.md,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: COLORS.card,
          borderColor: error ? COLORS.danger : open ? COLORS.accent : COLORS.border,
        }}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 15, fontFamily: FONT.regular, color: selected ? COLORS.text.primary : COLORS.text.muted, flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.text.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,20,50,0.45)',
            justifyContent: 'center',
            paddingHorizontal: SP.lg,
            paddingVertical: 32,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: 'rgba(255,255,255,0.98)',
              borderRadius: RADIUS.xl,
              maxHeight: 400,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(221,232,240,0.8)',
            }}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: SP.card,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.text.primary }}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.7}>
                <Feather name="x" size={18} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {options.map((option, index) => (
                <TouchableOpacity
                  key={option.value}
                  style={{
                    paddingHorizontal: SP.card,
                    paddingVertical: 14,
                    borderBottomWidth: index < options.length - 1 ? 1 : 0,
                    borderBottomColor: COLORS.border,
                    backgroundColor: option.value === value ? COLORS.accentLight : COLORS.card,
                  }}
                  activeOpacity={0.7}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: option.value === value ? FONT.medium : FONT.regular,
                      color: option.value === value ? COLORS.accentMuted : COLORS.text.primary,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {error ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.danger, marginTop: 4 }}>{error}</Text> : null}
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
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.card }}>
    <View style={{ flex: 1, marginRight: SP.card }}>
      <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>{label}</Text>
      {description ? (
        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>{description}</Text>
      ) : null}
    </View>
    <TouchableOpacity
      style={{
        width: 48,
        height: 28,
        borderRadius: RADIUS.full,
        padding: 3,
        justifyContent: 'center',
        backgroundColor: value ? COLORS.ink : COLORS.borderDark,
      }}
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: RADIUS.full,
          backgroundColor: value ? COLORS.accent : COLORS.card,
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </TouchableOpacity>
  </View>
);

export { KeyboardAwareScrollView, KeyboardAwareTextInput } from './keyboard';
