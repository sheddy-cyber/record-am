import { View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { BrandMark, BrandWordmark, ScreenShell } from '@/components/layout';
import { COLORS } from '@/constants';

export default function Index() {
  const { session, isInitialized, currentBusiness } = useAuthStore();

  if (!isInitialized) {
    return (
      <ScreenShell backgroundColor={COLORS.ink} statusBarStyle="light">
        <View style={styles.splash}>
          <BrandMark size={52} />
          <BrandWordmark invert size={26} />
        </View>
      </ScreenShell>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!currentBusiness) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(app)/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 24,
  },
});
