import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT } from '@/constants';

interface OfflineBannerProps {
  visible: boolean;
  pendingCount?: number;
  style?: ViewStyle;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible, pendingCount = 0, style }) => {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: insets.top + 10,
          alignSelf: 'center',
          backgroundColor: '#333333',
          borderRadius: 20,
          paddingVertical: 6,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          zIndex: 9999,
          elevation: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
        },
        style,
      ]}
    >
      <Feather name="wifi-off" size={14} color="#FFF" />
      <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: '#FFF' }}>
        Offline {pendingCount > 0 ? `\u00B7 ${pendingCount} pending` : ''}
      </Text>
    </View>
  );
};
