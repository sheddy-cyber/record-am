import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { COLORS, FONT, RADIUS } from '@/constants';
import { dismissScreen } from '@/lib/navigation';

export function PermissionDenied({
  title = 'This page is restricted',
  description = 'Your role does not have access to this business information.',
  onGoBack,
  fallbackHref,
}: {
  title?: string;
  description?: string;
  onGoBack?: () => void;
  /** Used when there is no navigation history (e.g. deep link). */
  fallbackHref?: Href;
}) {
  const handleGoBack = onGoBack ?? (() => dismissScreen(fallbackHref));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View
        style={{
          width: 54,
          height: 54,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.full,
          backgroundColor: COLORS.warningLight,
          marginBottom: 16,
        }}
      >
        <Feather name="lock" size={22} color={COLORS.warning} />
      </View>
      <Text style={{ fontSize: 17, fontFamily: FONT.bold, color: COLORS.text.primary, textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ marginTop: 7, fontSize: 13, lineHeight: 19, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
        {description}
      </Text>
      <TouchableOpacity
        onPress={handleGoBack}
        activeOpacity={0.75}
        style={{ marginTop: 20, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.ink }}
      >
        <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.inverse }}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}
