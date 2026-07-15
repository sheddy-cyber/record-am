import React, { useEffect, useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button, Card, SectionHeader } from '@/components/ui';
import { InputField, KeyboardAwareScrollView, SelectField, Toggle } from '@/components/forms';
import { BrandMark, BrandWordmark, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { APP_FOOTER_TEXT, BUSINESS_TYPES, COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { BusinessType } from '@/types';
import { getAppSettings, getTimeParts, isValidTimeInput, saveAppSettings } from '@/lib/appSettings';
import { cancelDailySummaryNotification, scheduleDailySummaryNotification } from '@/lib/notifications';
import { getPendingMutationCount, flushOfflineQueue } from '@/lib/offlineStore';
import { useOfflineStore } from '@/store/offlineStore';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const { currentBusiness, currentBranch, setCurrentBusiness } = useAuthStore();
  const { updateBusiness } = useBusinessStore();
  const { isOnline, pendingCount: pendingMutations, isSyncing: syncing } = useOfflineStore();

  const [bizName, setBizName] = useState(currentBusiness?.name ?? '');
  const [bizType, setBizType] = useState<BusinessType>((currentBusiness?.type as BusinessType) ?? 'provisions');
  const [bizPhone, setBizPhone] = useState(currentBusiness?.phone ?? '');
  const [bizAddress, setBizAddress] = useState(currentBusiness?.address ?? '');
  const [taxRate, setTaxRate] = useState(String(currentBusiness?.tax_rate ?? '0'));
  const [saving, setSaving] = useState(false);
  const [dailyCloseSaving, setDailyCloseSaving] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);

  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('20:00');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseTime, setAutoCloseTime] = useState('21:00');
  const [inventoryPurchaseSyncEnabled, setInventoryPurchaseSyncEnabled] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const settings = await getAppSettings();
      if (!active) return;

      setDailySummaryEnabled(settings.dailySummaryEnabled);
      setDailySummaryTime(settings.dailySummaryTime);
      setAutoCloseEnabled(settings.autoCloseEnabled);
      setAutoCloseTime(settings.autoCloseTime);
      setInventoryPurchaseSyncEnabled(settings.inventoryPurchaseSyncEnabled);
    };

    loadSettings();
    void useOfflineStore.getState().updatePendingCount();

    return () => {
      active = false;
    };
  }, []);

  const handleSaveBusiness = async () => {
    if (!currentBusiness) return;
    if (!bizName.trim()) {
      Alert.alert('Error', 'Business name is required');
      return;
    }

    setSaving(true);
    setSaving(true);
    const updates = {
      name: bizName.trim(),
      type: bizType,
      phone: bizPhone.trim() || undefined,
      address: bizAddress.trim() || undefined,
      tax_rate: parseFloat(taxRate) || 0,
    };
    
    Toast.show({ type: 'success', text1: 'Business settings saved' });
    setCurrentBusiness({ ...currentBusiness, ...updates });
    
    void updateBusiness(currentBusiness.id, updates).catch((err: any) => {
      Toast.show({ type: 'error', text1: 'Failed to save', text2: err.message });
    }).finally(() => {
      setSaving(false);
    });
  };

  const handleSaveDailyCloseSettings = async () => {
    if (dailySummaryEnabled && !isValidTimeInput(dailySummaryTime)) {
      Alert.alert('Invalid time', 'Enter the reminder time as HH:MM in 24-hour format.');
      return;
    }

    if (autoCloseEnabled && !isValidTimeInput(autoCloseTime)) {
      Alert.alert('Invalid time', 'Enter the auto-close time as HH:MM in 24-hour format.');
      return;
    }

    setDailyCloseSaving(true);
    try {
      const reminder = getTimeParts(dailySummaryTime, '20:00');
      const autoClose = getTimeParts(autoCloseTime, '21:00');

      await saveAppSettings({
        dailySummaryEnabled,
        dailySummaryTime: reminder.normalized,
        autoCloseEnabled,
        autoCloseTime: autoClose.normalized,
      });

      if (dailySummaryEnabled) {
        await scheduleDailySummaryNotification(reminder.hour, reminder.minute);
      } else {
        await cancelDailySummaryNotification();
      }

      setDailySummaryTime(reminder.normalized);
      setAutoCloseTime(autoClose.normalized);

      Toast.show({
        type: 'success',
        text1: 'Daily close settings saved',
        text2: autoCloseEnabled
          ? `Reminder ${reminder.normalized} - auto-close ${autoClose.normalized}`
          : `Reminder ${reminder.normalized}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setDailyCloseSaving(false);
    }
  };

  const handleSaveInventorySettings = async () => {
    setInventorySaving(true);
    try {
      await saveAppSettings({
        inventoryPurchaseSyncEnabled,
      });

      Toast.show({
        type: 'success',
        text1: 'Inventory settings saved',
        text2: inventoryPurchaseSyncEnabled ? 'Purchase sync enabled' : 'Purchase sync disabled',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setInventorySaving(false);
    }
  };

  const handleSyncNow = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'You are currently offline. Please connect to the internet to sync.');
      return;
    }

    try {
      await flushOfflineQueue();
      Toast.show({
        type: 'success',
        text1: 'Sync completed',
        text2: pendingMutations === 0 ? 'All changes synced' : `${pendingMutations} changes still pending`,
      });
    } catch (err: any) {
      Alert.alert('Sync Error', err.message);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Business Settings"
        subtitle={[currentBusiness?.name, currentBranch?.name].filter(Boolean).join(" \u00B7 ")}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
      />

      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 20 }}>
          <Card>
            <SectionHeader title="Business Information" />
            <InputField label="Business Name" value={bizName} onChangeText={setBizName} placeholder="Your business name" required />
            <SelectField label="Business Type" value={bizType} options={BUSINESS_TYPES} onChange={(value) => setBizType(value as BusinessType)} />
            <InputField
              label="Business Phone"
              value={bizPhone}
              onChangeText={setBizPhone}
              placeholder="08012345678"
              keyboardType="phone-pad"
            />
            <InputField
              label="Business Address"
              value={bizAddress}
              onChangeText={setBizAddress}
              placeholder="Your business address"
              multiline
              numberOfLines={2}
            />
            <InputField
              label="Tax Rate (%)"
              value={taxRate}
              onChangeText={setTaxRate}
              placeholder="0"
              keyboardType="numeric"
              suffix="%"
              hint="Enter 0 for no tax. Example: 7.5 for VAT."
            />
            <Button title="Save Business Info" onPress={handleSaveBusiness} loading={saving} size="md" />
          </Card>

          <Card style={{ backgroundColor: '#F9FAFB' }}>
            <SectionHeader title="Current Branch" />
            {[
              { label: 'Branch Name', value: currentBranch?.name ?? '-' },
              { label: 'Branch Address', value: currentBranch?.address ?? 'Not set' },
              {
                label: 'Currency',
                value: `${currentBusiness?.currency ?? 'NGN'} (${currentBusiness?.currency_symbol ?? CURRENCY_SYMBOL})`,
              },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                  gap: 16,
                }}
              >
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{item.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1, textAlign: 'right' }}>
                  {item.value}
                </Text>
              </View>
            ))}
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 10 }}>Multi-branch management is not available yet.</Text>
          </Card>

          <Card>
            <SectionHeader title="Daily Close Automation" />
            <Toggle
              label="Daily Summary Reminder"
              description="Get notified every evening to close your books."
              value={dailySummaryEnabled}
              onChange={setDailySummaryEnabled}
            />
            {dailySummaryEnabled ? (
              <InputField
                label="Reminder Time"
                value={dailySummaryTime}
                onChangeText={setDailySummaryTime}
                placeholder="20:00"
                hint="Use 24-hour time, for example 20:00."
              />
            ) : null}
            <Toggle
              label="Auto Close And Balance"
              description="Automatically close the day using expected cash if you forget. You can reopen it later to adjust."
              value={autoCloseEnabled}
              onChange={setAutoCloseEnabled}
            />
            {autoCloseEnabled ? (
              <InputField
                label="Auto Close Time"
                value={autoCloseTime}
                onChangeText={setAutoCloseTime}
                placeholder="21:00"
                hint="Runs while the app is open, and catches up the next time the app is opened."
              />
            ) : null}
            <Button
              title="Save Daily Close Settings"
              onPress={handleSaveDailyCloseSettings}
              loading={dailyCloseSaving}
              variant="secondary"
              size="md"
            />
          </Card>

          <Card>
            <SectionHeader title="Inventory & Purchase Settings" />
            <Toggle
              label="Inventory Purchase Sync"
              description="When stock is added or increased from inventory, open a prefilled supplier purchase entry. Turn this off if you do not want inventory updates to feed purchase history."
              value={inventoryPurchaseSyncEnabled}
              onChange={setInventoryPurchaseSyncEnabled}
            />
            <Button
              title="Save Inventory Settings"
              onPress={handleSaveInventorySettings}
              loading={inventorySaving}
              variant="secondary"
              size="md"
            />
          </Card>

          <Card>
            <SectionHeader title="Sync Status" />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? COLORS.success : COLORS.danger} />
                <View>
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    {isOnline ? 'Online' : 'Offline'}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                    {isOnline ? 'Connected to server' : 'Using local data'}
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather
                  name={pendingMutations === 0 ? 'check-circle' : 'cloud'}
                  size={20}
                  color={pendingMutations === 0 ? COLORS.success : COLORS.warning}
                />
                <View>
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    {pendingMutations === 0 ? 'All synced' : `${pendingMutations} pending`}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                    {pendingMutations === 0 ? 'No changes to sync' : 'Changes queued for sync'}
                  </Text>
                </View>
              </View>
            </View>
            {pendingMutations > 0 && isOnline && (
              <Button
                title="Sync Now"
                onPress={handleSyncNow}
                loading={syncing}
                variant="primary"
                size="sm"
                style={{ marginTop: 8 }}
              />
            )}
          </Card>

          <Card style={{ backgroundColor: '#F9FAFB' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <BrandMark size={52} />
              <View style={{ flex: 1 }}>
                <BrandWordmark size={22} />
                <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.muted, marginTop: 6 }}>{APP_FOOTER_TEXT}</Text>
              </View>
            </View>
          </Card>
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
