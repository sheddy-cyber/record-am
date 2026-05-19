import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_SETTINGS_STORAGE_KEY = 'record-am:app-settings:v1';

export interface AppSettings {
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  autoCloseEnabled: boolean;
  autoCloseTime: string;
  inventoryPurchaseSyncEnabled: boolean;
  autoCloseLastRunByBranch: Record<string, string>;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  dailySummaryEnabled: true,
  dailySummaryTime: '20:00',
  autoCloseEnabled: false,
  autoCloseTime: '21:00',
  inventoryPurchaseSyncEnabled: true,
  autoCloseLastRunByBranch: {},
};

export function normalizeTimeInput(value: string, fallback = '20:00'): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isValidTimeInput(value: string): boolean {
  return normalizeTimeInput(value, '__invalid__') !== '__invalid__';
}

export function getTimeParts(value: string, fallback = '20:00') {
  const normalized = normalizeTimeInput(value, fallback);
  const [hour, minute] = normalized.split(':').map(Number);
  return { hour, minute, normalized };
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      dailySummaryEnabled: parsed.dailySummaryEnabled ?? DEFAULT_APP_SETTINGS.dailySummaryEnabled,
      dailySummaryTime: normalizeTimeInput(parsed.dailySummaryTime ?? DEFAULT_APP_SETTINGS.dailySummaryTime, DEFAULT_APP_SETTINGS.dailySummaryTime),
      autoCloseEnabled: parsed.autoCloseEnabled ?? DEFAULT_APP_SETTINGS.autoCloseEnabled,
      autoCloseTime: normalizeTimeInput(parsed.autoCloseTime ?? DEFAULT_APP_SETTINGS.autoCloseTime, DEFAULT_APP_SETTINGS.autoCloseTime),
      inventoryPurchaseSyncEnabled: parsed.inventoryPurchaseSyncEnabled ?? DEFAULT_APP_SETTINGS.inventoryPurchaseSyncEnabled,
      autoCloseLastRunByBranch: parsed.autoCloseLastRunByBranch ?? {},
    };
  } catch (err) {
    console.log('[appSettings] load failed:', err);
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = {
    ...current,
    ...updates,
    dailySummaryTime: normalizeTimeInput(updates.dailySummaryTime ?? current.dailySummaryTime, DEFAULT_APP_SETTINGS.dailySummaryTime),
    autoCloseTime: normalizeTimeInput(updates.autoCloseTime ?? current.autoCloseTime, DEFAULT_APP_SETTINGS.autoCloseTime),
    autoCloseLastRunByBranch: updates.autoCloseLastRunByBranch ?? current.autoCloseLastRunByBranch,
  };

  await AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function markAutoCloseProcessed(branchId: string, summaryDate: string): Promise<AppSettings> {
  const current = await getAppSettings();
  return saveAppSettings({
    autoCloseLastRunByBranch: {
      ...current.autoCloseLastRunByBranch,
      [branchId]: summaryDate,
    },
  });
}
