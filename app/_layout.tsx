import { useEffect, useState } from 'react';
import { AppState, Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { COLORS, FONT } from '@/constants';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// ─── Steradian Font Assets ──────────────────────────────────────────────────
export const STERADIAN_FONT_ASSETS = {
  'Steradian Trial': require('../assets/fonts/SteradianTRIAL-Rg.otf'),
  'Steradian Trial Italic': require('../assets/fonts/SteradianTRIAL-RgIt.otf'),
  'Steradian Trial Medium': require('../assets/fonts/SteradianTRIAL-Md.otf'),
  'Steradian Trial Medium Italic': require('../assets/fonts/SteradianTRIAL-MdIt.otf'),
  'Steradian Trial Bold': require('../assets/fonts/SteradianTRIAL-Bd.otf'),
  'Steradian Trial Bold Italic': require('../assets/fonts/SteradianTRIAL-BdIt.otf'),
  'Steradian Trial Black': require('../assets/fonts/SteradianTRIAL-Blk.otf'),
  'Steradian Trial Black Italic': require('../assets/fonts/SteradianTRIAL-BlkIt.otf'),
  'Steradian Trial Light': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Light Italic': require('../assets/fonts/SteradianTRIAL-LtIt.otf'),
  'Steradian Trial Thin': require('../assets/fonts/SteradianTRIAL-Th.otf'),
  'Steradian Trial Thin Italic': require('../assets/fonts/SteradianTRIAL-ThIt.otf'),
  'Steradian Trial Extra Light': require('../assets/fonts/SteradianTRIAL-XLt.otf'),
  'Steradian Trial Extra Light Italic': require('../assets/fonts/SteradianTRIAL-XLtIt.otf'),
  'Steradian Trial Ultra Light': require('../assets/fonts/SteradianTRIAL-UltLt.otf'),
  'Steradian Trial Ultra Light Italic': require('../assets/fonts/SteradianTRIAL-UltLtIt.otf'),
} as const;

// ─── Global default font ────────────────────────────────────────────────────
// Set the base Steradian family as the default for every Text and TextInput.
// Individual components use the FONT helper from constants for specific weights.
const textDefaults = (Text as any);
textDefaults.defaultProps = textDefaults.defaultProps || {};
textDefaults.defaultProps.style = [
  { fontFamily: FONT.regular },
  textDefaults.defaultProps.style,
];

const inputDefaults = (TextInput as any);
inputDefaults.defaultProps = inputDefaults.defaultProps || {};
inputDefaults.defaultProps.style = [
  { fontFamily: FONT.regular },
  inputDefaults.defaultProps.style,
];

export default function RootLayout() {
  const { setSession, initialize, currentBusiness, currentBranch, user } = useAuthStore();
  const [appInitialized, setAppInitialized] = useState(false);
  const [fontsLoaded, fontError] = useFonts(STERADIAN_FONT_ASSETS);

  useEffect(() => {
    let active = true;

    initialize()
      .catch((err) => {
        console.log('[Record Am] Initialization warning:', err);
      })
      .finally(() => {
        if (active) {
          setAppInitialized(true);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [initialize, setSession]);

  useEffect(() => {
    if (appInitialized && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appInitialized, fontsLoaded, fontError]);

  useEffect(() => {
    if (isExpoGo || !currentBusiness || !currentBranch) return;

    const setup = async () => {
      try {
        const {
          registerForPushNotifications,
          cancelDailySummaryNotification,
          scheduleDailySummaryNotification,
          checkAndNotifyLowStock,
          checkAndNotifyOverdueDebts,
        } = await import('@/lib/notifications');
        const { getAppSettings, getTimeParts } = await import('@/lib/appSettings');
        const settings = await getAppSettings();
        const token = await registerForPushNotifications();
        if (token) {
          if (settings.dailySummaryEnabled) {
            const reminderTime = getTimeParts(settings.dailySummaryTime, '20:00');
            await scheduleDailySummaryNotification(reminderTime.hour, reminderTime.minute);
          } else {
            await cancelDailySummaryNotification();
          }
          await checkAndNotifyLowStock(currentBusiness.id, currentBranch.id);
          await checkAndNotifyOverdueDebts(currentBusiness.id);
        }
      } catch (err) {
        console.log('[Record Am] Notification setup skipped:', err);
      }
    };

    setup();
  }, [currentBusiness?.id, currentBranch?.id]);

  useEffect(() => {
    if (!currentBusiness || !currentBranch || !user) return;

    let active = true;
    const runAutoCloseCheck = async () => {
      try {
        const { maybeAutoCloseDailyBalance } = await import('@/lib/dailyBalanceAutomation');
        const result = await maybeAutoCloseDailyBalance(currentBusiness.id, currentBranch.id, user.id);
        if (!active || result.status !== 'closed' || !result.summaryDate) return;

        Toast.show({
          type: 'success',
          text1: 'Day auto-closed',
          text2: `${result.summaryDate} was automatically balanced at the scheduled time.`,
        });
      } catch (err) {
        console.log('[Record Am] Auto-close check skipped:', err);
      }
    };

    runAutoCloseCheck();
    const interval = setInterval(runAutoCloseCheck, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runAutoCloseCheck();
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [currentBusiness?.id, currentBranch?.id, user?.id]);

  if (!appInitialized || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <Toast />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
