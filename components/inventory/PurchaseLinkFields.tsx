// ============================================================
// RECORD AM - Purchase details on stock screens
// Shown when stock goes up: the addition is also recorded as a purchase, so
// stock history and purchase history stay in step without a second form.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InputField, Toggle } from '@/components/forms';
import { Pill } from '@/components/ui';
import { COLORS, FONT, TYPE } from '@/constants';
import { getAppSettings } from '@/lib/appSettings';
import { canManagePurchases } from '@/lib/permissions';
import { PurchaseLinkChoice } from '@/lib/stockPurchaseLink';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';

export function PurchaseLinkFields({
  value,
  onChange,
  quantity,
}: {
  value: PurchaseLinkChoice;
  onChange: (next: PurchaseLinkChoice) => void;
  /** Stock being added; nothing is shown until it is above zero. */
  quantity: number;
}) {
  const role = useAuthStore((s) => s.userRole);
  const canManage = canManagePurchases(role);
  const suppliers = useSupplierStore((s) => s.suppliers);
  const [linkingOn, setLinkingOn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getAppSettings()
      .then((settings) => active && setLinkingOn(settings.inventoryPurchaseSyncEnabled))
      .catch(() => active && setLinkingOn(true));
    return () => {
      active = false;
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = value.supplierName.trim().toLowerCase();
    const matches = suppliers.filter((s) => !q || s.name.toLowerCase().includes(q));
    // Hide the list once the typed name is an exact supplier.
    if (q && matches.some((s) => s.name.toLowerCase() === q)) return [];
    return matches.slice(0, 4);
  }, [suppliers, value.supplierName]);

  if (!linkingOn || !(quantity > 0)) return null;

  if (!canManage) {
    return (
      <Text style={styles.note}>
        This restock is also added to the purchase records at the saved cost price.
      </Text>
    );
  }

  return (
    <View style={styles.box}>
      <Toggle
        label="Record as a purchase"
        description="Adds it to purchase history, so stock and purchases always match."
        value={value.record}
        onChange={(record) => onChange({ ...value, record })}
      />
      {value.record ? (
        <>
          <InputField
            label="Supplier (optional)"
            value={value.supplierName}
            onChangeText={(supplierName) => {
              const match = suppliers.find((s) => s.name.trim().toLowerCase() === supplierName.trim().toLowerCase());
              onChange({ ...value, supplierName, supplierId: match?.id });
            }}
            placeholder="Who did you buy it from?"
            autoCapitalize="words"
            containerStyle={{ marginBottom: suggestions.length ? 8 : 4 }}
          />
          {suggestions.length > 0 ? (
            <View style={styles.pills}>
              {suggestions.map((s) => (
                <Pill key={s.id} label={s.name} onPress={() => onChange({ ...value, supplierName: s.name, supplierId: s.id })} />
              ))}
            </View>
          ) : null}
          <Toggle
            label="Paid in full"
            description={value.paidInFull ? 'Recorded as paid.' : 'Recorded as owed to the supplier.'}
            value={value.paidInFull}
            onChange={(paidInFull) => onChange({ ...value, paidInFull })}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  note: { ...TYPE.footnote, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4, lineHeight: 17 },
});
