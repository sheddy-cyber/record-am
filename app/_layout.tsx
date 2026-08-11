import { useEffect, useState } from 'react';
import { AppState, Text, TextInput, View, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAlertStore } from '@/store/alertStore';
import { useTabStore } from '@/store/tabStore';
import { useAuthStore } from '@/store/authStore';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { COLORS, FONT, RADIUS } from '@/constants';
import { GlobalDialog, AnimatedSplashScreen } from '@/components/ui';

// Keep the native splash screen visible until our JS AnimatedSplashScreen renders
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'record-am-autofill-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      input:-webkit-autofill:active,
      textarea:-webkit-autofill,
      textarea:-webkit-autofill:hover,
      textarea:-webkit-autofill:focus,
      textarea:-webkit-autofill:active {
        -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
        -webkit-text-fill-color: #0F172A !important;
        transition: background-color 5000000s ease-in-out 0s !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Steradian Font Assets ──────────────────────────────────────────────────
export const STERADIAN_FONT_ASSETS = {
  'Steradian Trial': require('../assets/fonts/SteradianTRIAL-Rg.otf'),
  'Steradian Trial Italic': require('../assets/fonts/SteradianTRIAL-Rg.otf'),
  'Steradian Trial Medium': require('../assets/fonts/SteradianTRIAL-Md.otf'),
  'Steradian Trial Medium Italic': require('../assets/fonts/SteradianTRIAL-Md.otf'),
  'Steradian Trial Bold': require('../assets/fonts/SteradianTRIAL-Bd.otf'),
  'Steradian Trial Bold Italic': require('../assets/fonts/SteradianTRIAL-Bd.otf'),
  'Steradian Trial Black': require('../assets/fonts/SteradianTRIAL-Blk.otf'),
  'Steradian Trial Black Italic': require('../assets/fonts/SteradianTRIAL-Blk.otf'),
  'Steradian Trial Light': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Light Italic': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Thin': require('../assets/fonts/SteradianTRIAL-Th.otf'),
  'Steradian Trial Thin Italic': require('../assets/fonts/SteradianTRIAL-Th.otf'),
  'Steradian Trial Extra Light': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Extra Light Italic': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Ultra Light': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
  'Steradian Trial Ultra Light Italic': require('../assets/fonts/SteradianTRIAL-Lt.otf'),
} as const;

// ─── Global default font ────────────────────────────────────────────────────
// Set the base Steradian family as the default for every Text and TextInput.
// Individual components use the FONT helper from constants for specific weights.
const textDefaults = (Text as any);
textDefaults.defaultProps = textDefaults.defaultProps || {};
textDefaults.defaultProps.style = [
  { fontFamily: FONT.regular, includeFontPadding: false },
  textDefaults.defaultProps.style,
];

const inputDefaults = (TextInput as any);
inputDefaults.defaultProps = inputDefaults.defaultProps || {};
inputDefaults.defaultProps.style = [
  { fontFamily: FONT.regular, includeFontPadding: false },
  inputDefaults.defaultProps.style,
];

// ─── Custom Toast Configuration ───────────────────────────────────────────────

const ToastContent = ({ iconName, iconColor, text1, text2 }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
    <Feather name={iconName} size={22} color={iconColor} />
    <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
      {text1 ? (
        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: '#1A1A1C' }}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: '#4A4A4D', lineHeight: 18 }}>
          {text2}
        </Text>
      ) : null}
    </View>
  </View>
);

const ThemedToast = ({ text1, text2, type }: any) => {
  const isSuccess = type === 'success';
  const isError = type === 'error';
  const iconColor = isSuccess ? COLORS.success : isError ? COLORS.danger : COLORS.info;
  const iconName = isSuccess ? 'check-circle' : isError ? 'alert-circle' : 'info';

  const iosInnerStyle = {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  } as const;

  return (
    <View style={Platform.select({
      ios: {
        width: '92%',
        marginTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        width: '92%',
        marginTop: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surface,
        elevation: 6,
      },
      default: { width: '92%', marginTop: 8 }
    })}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={80} tint="light" style={iosInnerStyle}>
          <ToastContent iconName={iconName} iconColor={iconColor} text1={text1} text2={text2} />
        </BlurView>
      ) : (
        <ToastContent iconName={iconName} iconColor={iconColor} text1={text1} text2={text2} />
      )}
    </View>
  );
};

const toastConfig = {
  success: (props: any) => <ThemedToast {...props} type="success" />,
  error: (props: any) => <ThemedToast {...props} type="error" />,
  info: (props: any) => <ThemedToast {...props} type="info" />,
};

export default function RootLayout() {
  const { setSession, initialize, currentBusiness, currentBranch, user } = useAuthStore();
  const [appInitialized, setAppInitialized] = useState(false);
  const [fontsLoaded, fontError] = useFonts(STERADIAN_FONT_ASSETS);
  const [showSplash, setShowSplash] = useState(true);
  const isAppReady = appInitialized && (fontsLoaded || fontError);

  useOfflineSync(Boolean(user));

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

  useEffect(() => {
    if (isExpoGo) return;

    let active = true;
    let subscription: any = null;

    const setupListener = async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (!active) return;
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          const type = data?.type as string | undefined;
          const route = data?.actionRoute as string | undefined;

          if (typeof route === 'string' && route) {
            if (route.includes('_inventory')) useTabStore.getState().setActiveTab('inventory');
            else if (route.includes('_debts')) useTabStore.getState().setActiveTab('debts');
            else if (route.includes('_sales')) useTabStore.getState().setActiveTab('sales');
            else if (route.includes('_dashboard')) useTabStore.getState().setActiveTab('dashboard');
            router.push(route as any);
          } else if (type === 'sync_mismatch' || type === 'mismatch' || type === 'low_stock') {
            useTabStore.getState().setActiveTab('inventory');
            router.push('/(app)/(tabs)/_inventory');
          } else if (type === 'debt_reminder' || type === 'debt') {
            useTabStore.getState().setActiveTab('debts');
            router.push('/(app)/(tabs)/_debts');
          } else if (type === 'daily_summary' || type === 'close_day') {
            router.push('/(app)/close-day');
          }
        });
      } catch (err) {
        console.log('[notifications] listener setup failed:', err);
      }
    };

    setupListener();

    return () => {
      active = false;
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);



  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 150 }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <GlobalDialog />
        <Toast config={toastConfig} />
        {showSplash && (
          <AnimatedSplashScreen
            isAppReady={!!isAppReady}
            onAnimationComplete={() => setShowSplash(false)}
          />
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
