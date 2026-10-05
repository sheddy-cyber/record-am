import { router, type Href } from 'expo-router';
import { useTabStore } from '@/store/tabStore';

const DEFAULT_APP_FALLBACK: Href = '/(app)/(tabs)';

/** Pop the stack when possible; otherwise land on the main tab shell (deep links / cold opens). */
export function dismissScreen(fallback: Href = DEFAULT_APP_FALLBACK) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  useTabStore.getState().setActiveTab('dashboard');
  router.replace(fallback);
}
