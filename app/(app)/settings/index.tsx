import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { Button, Card, SectionHeader } from '@/components/ui';
import { InputField, SelectField, Toggle } from '@/components/forms';
import { BrandMark, BrandWordmark, HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { APP_FOOTER_TEXT, BUSINESS_TYPES, COLORS, FONT, RADIUS, SP, TYPE } from '@/constants';
import { BusinessType } from '@/types';
import { cancelAllNotifications, scheduleDailySummaryNotification } from '@/lib/notifications';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const { currentBusiness, currentBranch, setCurrentBusiness } = useAuthStore();
  const { updateBusiness } = useBusinessStore();

  const [bizName, setBizName] = useState(currentBusiness?.name ?? '');
  const [bizType, setBizType] = useState<BusinessType>((currentBusiness?.type as BusinessType) ?? 'provisions');
  const [bizPhone, setBizPhone] = useState(currentBusiness?.phone ?? '');
  const [bizAddress, setBizAddress] = useState(currentBusiness?.address ?? '');
  const [taxRate, setTaxRate] = useState(String(currentBusiness?.tax_rate ?? '0'));
  const [saving, setSaving] = useState(false);

  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [summaryHour, setSummaryHour] = useState('20');

  const handleSaveBusiness = async () => {
    if (!currentBusiness) return;
    if (!bizName.trim()) {
      Alert.alert('Error', 'Business name is required');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        name: bizName.trim(),
        type: bizType,
        phone: bizPhone.trim() || undefined,
        address: bizAddress.trim() || undefined,
        tax_rate: parseFloat(taxRate) || 0,
      };

      await updateBusiness(currentBusiness.id, updates);
      setCurrentBusiness({ ...currentBusiness, ...updates });
      Toast.show({ type: 'success', text1: 'Business settings saved' });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      if (dailySummaryEnabled) {
        const hour = parseInt(summaryHour, 10) || 20;
        await scheduleDailySummaryNotification(Math.min(23, Math.max(0, hour)), 0);
        Toast.show({
          type: 'success',
          text1: 'Notifications updated',
          text2: `Daily summary scheduled for ${hour}:00`,
        });
      } else {
        await cancelAllNotifications();
        Toast.show({ type: 'success', text1: 'Notifications disabled' });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Business Settings"
          subtitle={[currentBusiness?.name, currentBranch?.name].filter(Boolean).join(' \u2022 ')}
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={() => router.back()} />}
        />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
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
                value: `${currentBusiness?.currency ?? 'NGN'} (${currentBusiness?.currency_symbol ?? '\u20A6'})`,
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
                <Text style={{ fontSize: 13, color: COLORS.text.secondary }}>{item.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, flex: 1, textAlign: 'right' }}>
                  {item.value}
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: 10 }}>Multi-branch management is not available yet.</Text>
          </Card>

          <Card>
            <SectionHeader title="Notifications" />
            <Toggle
              label="Daily Summary Reminder"
              description="Get notified every evening to close your books."
              value={dailySummaryEnabled}
              onChange={setDailySummaryEnabled}
            />
            {dailySummaryEnabled ? (
              <InputField
                label="Reminder Time (24-hour)"
                value={summaryHour}
                onChangeText={setSummaryHour}
                placeholder="20"
                keyboardType="numeric"
                hint="Example: 20 means 8:00 PM."
              />
            ) : null}
            <Button title="Save Notification Settings" onPress={handleSaveNotifications} variant="secondary" size="md" />
          </Card>

          <Card style={{ backgroundColor: '#F9FAFB' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <BrandMark size={52} />
              <View style={{ flex: 1 }}>
                <BrandWordmark size={22} />
                <Text style={{ fontSize: 13, color: COLORS.text.muted, marginTop: 6 }}>{APP_FOOTER_TEXT}</Text>
              </View>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
