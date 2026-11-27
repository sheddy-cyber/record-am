import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { TouchableOpacity } from '@/components/ui/touchables';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button, Card, PermissionDenied, SectionHeader } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';
import { InputField, KeyboardAwareScrollView, SelectField, Toggle } from '@/components/forms';
import { BusinessAvatar, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { BUSINESS_TYPES, COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { BusinessType } from '@/types';
import { pickAndUploadBusinessLogo, removeBusinessLogo } from '@/lib/businessLogo';
import { getAppSettings, getTimeParts, isValidTimeInput, saveAppSettings } from '@/lib/appSettings';
import {
  cancelDailySummaryNotification,
  scheduleDailySummaryNotification,
  ensureNotificationPermissions,
  sendImmediateNotification,
} from '@/lib/notifications';
import { getPendingMutationCount, flushOfflineQueue } from '@/lib/offlineStore';
import { useOfflineStore } from '@/store/offlineStore';
import { usePaymentAccountStore } from '@/store/paymentAccountStore';
import { PaymentAccountsSection } from '@/components/settings/PaymentAccountsSection';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const { currentBusiness, currentBranch, setCurrentBusiness, userRole } = useAuthStore();
  const canManageSettings = hasPermission(userRole, 'business-settings.manage');
  const { updateBusiness } = useBusinessStore();
  const { isOnline, pendingCount: pendingMutations, isSyncing: syncing } = useOfflineStore();
  const [refreshing, setRefreshing] = useState(false);

  const [bizName, setBizName] = useState(currentBusiness?.name ?? '');
  const [bizType, setBizType] = useState<BusinessType>((currentBusiness?.type as BusinessType) ?? 'provisions');
  const [bizPhone, setBizPhone] = useState(currentBusiness?.phone ?? '');
  const [bizAddress, setBizAddress] = useState(currentBusiness?.address ?? '');
  const [taxRate, setTaxRate] = useState(String(currentBusiness?.tax_rate ?? '0'));
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dailyCloseSaving, setDailyCloseSaving] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);

  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('20:00');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseTime, setAutoCloseTime] = useState('21:00');
  const [inventoryPurchaseSyncEnabled, setInventoryPurchaseSyncEnabled] = useState(true);

  // Voice Assistant Settings
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useState(true);
  const [voiceTtsEnabled, setVoiceTtsEnabled] = useState(true);
  const [voiceAutoConfirmSeconds, setVoiceAutoConfirmSeconds] = useState('0');
  const [voiceSaving, setVoiceSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const settings = await getAppSettings();
      setDailySummaryEnabled(settings.dailySummaryEnabled);
      setDailySummaryTime(settings.dailySummaryTime);
      setAutoCloseEnabled(settings.autoCloseEnabled);
      setAutoCloseTime(settings.autoCloseTime);
      setInventoryPurchaseSyncEnabled(settings.inventoryPurchaseSyncEnabled);
      setVoiceAssistantEnabled(settings.voiceAssistantEnabled ?? true);
      setVoiceTtsEnabled(settings.voiceTtsEnabled ?? true);
      setVoiceAutoConfirmSeconds(String(settings.voiceAutoConfirmSeconds ?? 0));
      if (currentBusiness) {
        await usePaymentAccountStore.getState().fetchAccounts(currentBusiness.id);
      }
      await useOfflineStore.getState().updatePendingCount();
      await useAuthStore.getState().initialize();
    } catch (_) {}
    setRefreshing(false);
  }, [currentBusiness]);

  useEffect(() => {
    let active = true;

    if (currentBusiness) {
      void usePaymentAccountStore.getState().fetchAccounts(currentBusiness.id);
    }

    const loadSettings = async () => {
      const settings = await getAppSettings();
      if (!active) return;

      setDailySummaryEnabled(settings.dailySummaryEnabled);
      setDailySummaryTime(settings.dailySummaryTime);
      setAutoCloseEnabled(settings.autoCloseEnabled);
      setAutoCloseTime(settings.autoCloseTime);
      setInventoryPurchaseSyncEnabled(settings.inventoryPurchaseSyncEnabled);
      setVoiceAssistantEnabled(settings.voiceAssistantEnabled ?? true);
      setVoiceTtsEnabled(settings.voiceTtsEnabled ?? true);
      setVoiceAutoConfirmSeconds(String(settings.voiceAutoConfirmSeconds ?? 0));
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
        await ensureNotificationPermissions();
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

  const handleTestNotification = async () => {
    try {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        Alert.alert('Permission Needed', 'Please allow notifications for Record Am in your device settings to receive reminders.');
        return;
      }
      await sendImmediateNotification(
        'Daily Summary Ready',
        "Time to close your books. Tap to review today's balance.",
        { type: 'daily_summary', actionRoute: '/(app)/close-day' },
        '/(app)/close-day'
      );
      Toast.show({
        type: 'success',
        text1: 'Test reminder sent',
        text2: 'Check your notification shade and in-app notifications.',
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send test reminder');
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
        text2: inventoryPurchaseSyncEnabled ? 'Stock and purchases stay in step' : 'Stock and purchases are kept separate',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setInventorySaving(false);
    }
  };

  const handleSaveVoiceSettings = async () => {
    setVoiceSaving(true);
    try {
      await saveAppSettings({
        voiceAssistantEnabled,
        voiceTtsEnabled,
        // 0 means "always tap Save"; an empty or invalid entry counts as 0 too.
        voiceAutoConfirmSeconds: Math.max(0, parseInt(voiceAutoConfirmSeconds, 10) || 0),
      });

      Toast.show({
        type: 'success',
        text1: 'Voice settings saved',
        text2: 'Voice control preferences have been updated.',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setVoiceSaving(false);
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

  if (!canManageSettings) {
    return (
      <ScreenShell backgroundColor={COLORS.surface}>
        <ScreenHeader
          title="Business Settings"
         
          left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
        />
        <PermissionDenied
          title="Business settings are restricted"
          description="Only owners and managers can change business setup, team access, and payment accounts."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface}>
      <ScreenHeader
        title="Business Settings"
        subtitle={[currentBusiness?.name, currentBranch?.name].filter(Boolean).join(" \u00B7 ")}
       
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
          <Card>
            <SectionHeader title="Business Logo" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <BusinessAvatar
                name={currentBusiness?.name ?? 'B'}
                logoUrl={currentBusiness?.logo_url}
                size={60}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.semiBold, fontSize: 14, color: COLORS.text.primary }}>
                  {currentBusiness?.logo_url ? 'Custom Logo Active' : 'No Logo Uploaded'}
                </Text>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                  Displayed on your dashboard, business profile, and printed customer receipts.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={currentBusiness?.logo_url ? 'Change Logo' : 'Upload Logo'}
                  variant="primary"
                  size="sm"
                  loading={uploadingLogo}
                  onPress={async () => {
                    if (!currentBusiness) return;
                    setUploadingLogo(true);
                    try {
                      const uploaded = await pickAndUploadBusinessLogo(currentBusiness.id);
                      if (uploaded) {
                        Toast.show({ type: 'success', text1: 'Business logo updated' });
                      }
                    } catch (err: any) {
                      Alert.alert('Upload Failed', err?.message || 'Unable to upload business logo.');
                    } finally {
                      setUploadingLogo(false);
                    }
                  }}
                />
              </View>
              {currentBusiness?.logo_url ? (
                <Button
                  title="Remove"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingLogo}
                  onPress={() => {
                    if (!currentBusiness) return;
                    Alert.alert('Remove Logo', 'Remove your business logo and revert to initials?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          setUploadingLogo(true);
                          try {
                            await removeBusinessLogo(currentBusiness.id);
                            Toast.show({ type: 'success', text1: 'Business logo removed' });
                          } catch (err: any) {
                            Alert.alert('Error', err?.message || 'Failed to remove logo.');
                          } finally {
                            setUploadingLogo(false);
                          }
                        },
                      },
                    ]);
                  }}
                />
              ) : null}
            </View>
          </Card>

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
            <Button title="Save Business Info" onPress={handleSaveBusiness} loading={saving} size="md" variant="accent" />
          </Card>

          <Card style={{ backgroundColor: '#F5F3EE' }}>
            <SectionHeader title="Branches & Locations" />
            {[
              { label: 'Active Branch', value: currentBranch?.name ?? '-' },
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
            {userRole === 'owner' ? (
              <View style={{ marginTop: 12 }}>
                <Button
                  title="Manage All Branches & Locations"
                  variant="primary"
                  size="sm"
                  onPress={() => router.push('/(app)/branches' as any)}
                />
              </View>
            ) : (
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 10 }}>
                Your assigned location is managed by your business owner.
              </Text>
            )}
          </Card>

          {currentBusiness ? (
            <PaymentAccountsSection businessId={currentBusiness.id} />
          ) : null}

          <Card>
            <SectionHeader title="Daily Close Automation" />
            <Toggle
              label="Daily Summary Reminder"
              description="Get notified every evening to close your books."
              value={dailySummaryEnabled}
              onChange={setDailySummaryEnabled}
            />
            {dailySummaryEnabled ? (
              <>
                <InputField
                  label="Reminder Time"
                  value={dailySummaryTime}
                  onChangeText={setDailySummaryTime}
                  placeholder="20:00"
                  hint="Use 24-hour time, for example 20:00."
                />
                <View style={{ marginTop: -8, marginBottom: 24, flexDirection: 'row', justifyContent: 'flex-start' }}>
                  <TouchableOpacity
                    onPress={handleTestNotification}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: RADIUS.sm,
                      backgroundColor: COLORS.accentLight,
                    }}
                  >
                    <Icon name="bell" size={13} color={COLORS.accentDark} />
                    <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.accentDark }}>
                      Send Test Reminder
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
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
              variant="accent"
              size="md"
            />
          </Card>

          <Card>
            <SectionHeader title="Inventory & Purchase Settings" />
            <Toggle
              label="Keep stock and purchases in step"
              description="Adding stock also records it as a purchase, and recording, editing or deleting a purchase changes stock to match. Turn this off to keep them separate."
              value={inventoryPurchaseSyncEnabled}
              onChange={setInventoryPurchaseSyncEnabled}
            />
            <Button
              title="Save Inventory Settings"
              onPress={handleSaveInventorySettings}
              loading={inventorySaving}
              variant="accent"
              size="md"
            />
          </Card>

          <Card>
            <SectionHeader title="Voice Control" />
            <Toggle
              label="Enable Voice Assistant"
              description="Show voice control button to record sales, stock, debt, and expenses by voice."
              value={voiceAssistantEnabled}
              onChange={setVoiceAssistantEnabled}
            />
            <Toggle
              label="Spoken Voice Confirmation"
              description="Hear voice confirmation spoken out loud when an action is executed."
              value={voiceTtsEnabled}
              onChange={setVoiceTtsEnabled}
            />
            <InputField
              label="Auto-Save Countdown (seconds)"
              value={voiceAutoConfirmSeconds}
              onChangeText={setVoiceAutoConfirmSeconds}
              placeholder="0"
              keyboardType="numeric"
              hint="Seconds to wait before automatically saving a parsed voice command (0 for manual only)."
            />
            <Button
              title="Save Voice Settings"
              onPress={handleSaveVoiceSettings}
              loading={voiceSaving}
              variant="accent"
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
                <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? COLORS.success : COLORS.danger} />
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
                <Icon
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
        </KeyboardAwareScrollView>
      </ScreenShell>
  );
}
