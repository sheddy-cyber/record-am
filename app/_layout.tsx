import { useEffect, useState } from 'react';
import { AppState, Text, TextInput, View, Platform } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useAlertStore } from '@/store/alertStore';
import { useTabStore } from '@/store/tabStore';
import { useAuthStore } from '@/store/authStore';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { COLORS, FONT, FONT_ASSETS } from '@/constants';
import { GlobalDialog } from '@/components/ui';
import { Icon } from '@/components/icons';
import { VoiceControlModal } from '@/components/voice';
import '@/lib/alertBridge';
import '@/lib/devTools';

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
        -webkit-text-fill-color: #1A1917 !important;
        transition: background-color 5000000s ease-in-out 0s !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Global default font ────────────────────────────────────────────────────
// Public Sans is the default face for every Text and TextInput.
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

// ─── Toasts ─────────────────────────────────────────────────────────────────
// A single quiet card that drops in from the top: tinted glyph, one line of
// title, an optional line of detail.

const TOAST_TONE = {
  success: { icon: 'check' as const, color: COLORS.success, tint: COLORS.successLight },
  error: { icon: 'alert-circle' as const, color: COLORS.danger, tint: COLORS.dangerLight },
  info: { icon: 'info' as const, color: COLORS.text.secondary, tint: COLORS.surface2 },
};

const ThemedToast = ({ text1, text2, type }: { text1?: string; text2?: string; type: keyof typeof TOAST_TONE }) => {
  const tone = TOAST_TONE[type] ?? TOAST_TONE.info;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: tone.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={tone.icon} size={16} color={tone.color} strokeWidth={2.2} backgroundColor={tone.tint} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        {text1 ? (
          <Text style={{ fontSize: 14.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.15 }} numberOfLines={1}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 18 }} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View
      style={{
        width: '92%',
        maxWidth: 440,
        marginTop: 6,
        borderRadius: 20,
        backgroundColor: Platform.OS === 'ios' ? 'transparent' : COLORS.card,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={90} tint="extraLight" style={{ borderRadius: 20, overflow: 'hidden' }}>
          {body}
        </BlurView>
      ) : (
        body
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
  const pathname = usePathname();
  const [appInitialized, setAppInitialized] = useState(false);
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const isAppReady = appInitialized && (fontsLoaded || fontError);

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isAppReady]);

  useOfflineSync(Boolean(user));

  // The Android navigation bar sits under the (light) tab bar on the home
  // screen and under paper-coloured pages everywhere else.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onTabs = pathname === '/' || pathname === '/index';
    const supportsDarkButtons = (Platform.Version as number) >= 26;
    const backgroundColor = supportsDarkButtons ? (onTabs ? COLORS.card : COLORS.surface) : '#000000';
    NavigationBar.setBackgroundColorAsync(backgroundColor).catch(() => undefined);
    NavigationBar.setButtonStyleAsync(supportsDarkButtons ? 'dark' : 'light').catch(() => undefined);
  }, [pathname]);

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
          ensureNotificationPermissions,
          registerForPushNotifications,
          cancelDailySummaryNotification,
          scheduleDailySummaryNotification,
          checkAndNotifyLowStock,
          checkAndNotifyOverdueDebts,
          checkAndNotifyDailySummary,
        } = await import('@/lib/notifications');
        const { getAppSettings, getTimeParts } = await import('@/lib/appSettings');
        const settings = await getAppSettings();

        // 1. Ensure permissions and channel are configured for local notifications
        await ensureNotificationPermissions();

        // 2. Schedule or cancel the local daily summary reminder
        if (settings.dailySummaryEnabled) {
          const reminderTime = getTimeParts(settings.dailySummaryTime, '20:00');
          await scheduleDailySummaryNotification(reminderTime.hour, reminderTime.minute);
        } else {
          await cancelDailySummaryNotification();
        }

        // 3. Register remote push token if possible (non-blocking)
        registerForPushNotifications().catch(() => {});

        // 4. Background in-app checks
        await checkAndNotifyDailySummary(currentBusiness.id, currentBranch.id);
        await checkAndNotifyLowStock(currentBusiness.id, currentBranch.id);
        await checkAndNotifyOverdueDebts(currentBusiness.id);
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

    const runDailySummaryCheck = async () => {
      try {
        const { checkAndNotifyDailySummary } = await import('@/lib/notifications');
        await checkAndNotifyDailySummary(currentBusiness.id, currentBranch.id);
      } catch (err) {
        console.log('[Record Am] Daily summary check skipped:', err);
      }
    };

    const runPeriodicChecks = () => {
      runAutoCloseCheck();
      runDailySummaryCheck();
    };

    runPeriodicChecks();
    const interval = setInterval(runPeriodicChecks, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runPeriodicChecks();
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
    let responseSubscription: any = null;
    let receivedSubscription: any = null;

    const setupListeners = async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (!active) return;

        const handleNavigation = (data: any) => {
          const type = data?.type as string | undefined;
          const route = data?.actionRoute as string | undefined;

          if (typeof route === 'string' && route) {
            if (route.includes('_inventory')) useTabStore.getState().setActiveTab('inventory');
            else if (route.includes('_debts') || route.includes('debts')) router.push('/(app)/debts' as any);
            else if (route.includes('_sales')) useTabStore.getState().setActiveTab('sales');
            else if (route.includes('_dashboard')) useTabStore.getState().setActiveTab('dashboard');
            else router.push(route as any);
          } else if (type === 'sync_mismatch' || type === 'mismatch' || type === 'low_stock') {
            useTabStore.getState().setActiveTab('inventory');
            router.push('/(app)/(tabs)/_inventory');
          } else if (type === 'debt_reminder' || type === 'debt') {
            router.push('/(app)/debts' as any);
          } else if (type === 'daily_summary' || type === 'close_day') {
            router.push('/(app)/close-day');
          }
        };

        // When a notification is received while the app is running
        receivedSubscription = Notifications.addNotificationReceivedListener(async (notification) => {
          const content = notification.request.content;
          const data = (content.data || {}) as Record<string, any>;
          const type = (data.type as any) || 'system';
          const actionRoute = (data.actionRoute as string) || (type === 'daily_summary' ? '/(app)/close-day' : undefined);

          try {
            const { useNotificationStore } = await import('@/store/notificationStore');
            await useNotificationStore.getState().addNotification({
              title: content.title || 'Record Am Alert',
              body: content.body || '',
              type,
              actionRoute,
              data,
            });
          } catch (err) {
            console.log('[notifications] failed to store received notification:', err);
          }
        });

        // When the user taps a notification
        responseSubscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
          const content = response.notification.request.content;
          const data = (content.data || {}) as Record<string, any>;
          const type = (data.type as any) || 'system';
          const actionRoute = (data.actionRoute as string) || (type === 'daily_summary' ? '/(app)/close-day' : undefined);

          try {
            const { useNotificationStore } = await import('@/store/notificationStore');
            const notifStore = useNotificationStore.getState();
            await notifStore.addNotification({
              title: content.title || 'Record Am Alert',
              body: content.body || '',
              type,
              actionRoute,
              data,
              read: true,
            });
            await notifStore.markMatchingAsRead((n) => {
              if (n.title === content.title && n.body === content.body) return true;
              if (data.productId && n.data?.productId === data.productId) return true;
              if (data.mismatchId && n.data?.mismatchId === data.mismatchId) return true;
              if (data.debtId && n.data?.debtId === data.debtId) return true;
              if (type === 'daily_summary' && n.type === 'daily_summary') return true;
              return false;
            });
          } catch (_) {}

          handleNavigation(data);
        });

        // Cold launch handling if app was opened via notification response
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse && active) {
          const content = lastResponse.notification.request.content;
          const data = (content.data || {}) as Record<string, any>;
          const type = (data.type as any) || 'system';
          try {
            const { useNotificationStore } = await import('@/store/notificationStore');
            const notifStore = useNotificationStore.getState();
            await notifStore.markMatchingAsRead((n) => {
              if (n.title === content.title && n.body === content.body) return true;
              if (data.productId && n.data?.productId === data.productId) return true;
              if (data.mismatchId && n.data?.mismatchId === data.mismatchId) return true;
              if (data.debtId && n.data?.debtId === data.debtId) return true;
              if (type === 'daily_summary' && n.type === 'daily_summary') return true;
              return false;
            });
          } catch (_) {}
          handleNavigation(data);
        }
      } catch (err) {
        console.log('[notifications] listener setup failed:', err);
      }
    };

    setupListeners();

    return () => {
      active = false;
      if (responseSubscription) {
        responseSubscription.remove();
      }
      if (receivedSubscription) {
        receivedSubscription.remove();
      }
    };
  }, []);



  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 180, contentStyle: { backgroundColor: COLORS.surface } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <GlobalDialog />
        <VoiceControlModal />
        <Toast config={toastConfig} />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
