import React, { useRef, useState } from 'react';
import { Alert, Image, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import { Button } from '@/components/ui';
import { Icon } from '@/components/icons';
import ViewShot from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { getPaymentBreakdown, isDebtForgiven } from '@/lib/records';
import { COLORS, CURRENCY_SYMBOL, FONT } from '@/constants';
import { Sale } from '@/types';

interface ReceiptPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  previewSale: Sale | null;
  businessId?: string;
  branchId?: string;
  businessName?: string;
  businessLogoUrl?: string | null;
  branchName?: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  downloadReceipt?: () => Promise<void>;
  isDownloading?: boolean;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  visible,
  onClose,
  previewSale,
  businessId,
  branchId,
  businessName = 'Record Am Merchant',
  businessLogoUrl,
  branchName = 'Main Branch',
  businessAddress,
  businessPhone,
  downloadReceipt,
  isDownloading: externalIsDownloading,
}) => {
  const receiptCaptureRef = useRef<any>(null);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [internalDownloading, setInternalDownloading] = useState(false);
  const isDownloading = externalIsDownloading ?? internalDownloading;

  const handleDownloadReceipt = async () => {
    if (downloadReceipt) {
      return downloadReceipt();
    }
    if (!previewSale || !businessId || !branchId) return;
    setInternalDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photos access needed', 'Allow Record Am to save to your photos, then try again.');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      const imageUri = await receiptCaptureRef.current?.capture?.();
      if (!imageUri) throw new Error('Could not capture receipt image');

      await MediaLibrary.createAssetAsync(imageUri);
      Toast.show({ type: 'success', text1: 'Saved to your photos' });
    } catch (err) {
      Alert.alert('Could not save', 'The receipt could not be saved. Please try again.');
      console.error(err);
    } finally {
      setInternalDownloading(false);
    }
  };

  const handleShareImage = async () => {
    if (!previewSale || !businessId || !branchId) return;
    setIsSharingImage(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const imageUri = await receiptCaptureRef.current?.capture?.();
      if (!imageUri) throw new Error('Could not capture receipt image');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, {
          dialogTitle: `Receipt ${previewSale.sale_number}`,
          mimeType: 'image/png',
          UTI: 'public.png',
        });
      } else {
        await Share.share({
          url: imageUri,
          title: `Receipt ${previewSale.sale_number}`,
        });
      }
    } catch (err) {
      Alert.alert('Could not share', 'Please try again.');
      console.error(err);
    } finally {
      setIsSharingImage(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* Measures this window's own status and navigation bars, so the buttons never sit under them. */}
      <SafeAreaView style={styles.backdrop} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Receipt</Text>
              {previewSale ? <Text style={styles.headerSub}>{previewSale.sale_number}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} accessibilityLabel="Close">
              <Icon name="x" size={15} color={COLORS.text.secondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView style={styles.paperScroll} contentContainerStyle={styles.paperArea} showsVerticalScrollIndicator={false}>
            {previewSale ? (
              <ViewShot ref={receiptCaptureRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                <View collapsable={false}>
                  <ReceiptShareCard
                    sale={previewSale}
                    businessName={businessName}
                    businessLogoUrl={businessLogoUrl}
                    businessAddress={businessAddress}
                    businessPhone={businessPhone}
                    branchName={branchName}
                  />
                </View>
              </ViewShot>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              title="Save"
              icon="download"
              variant="secondary"
              onPress={handleDownloadReceipt}
              loading={isDownloading}
              style={{ flex: 1 }}
            />
            <Button title="Share" icon="share" onPress={handleShareImage} loading={isSharingImage} style={{ flex: 1 }} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const money = (value: number) =>
  `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const METHOD: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  pos: 'POS',
  mobile_money: 'Mobile money',
  mixed: 'Split payment',
  other: 'Other',
};

/** The receipt itself. Rendered on screen and captured as the shared image. */
export function ReceiptShareCard({
  sale,
  businessName,
  businessLogoUrl,
  businessAddress,
  businessPhone,
  branchName,
}: {
  sale: Sale;
  businessName: string;
  businessLogoUrl?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  branchName: string;
}) {
  const isRepayment = Boolean((sale as any).isRepayment);
  const hasHigherPayment = !isRepayment && sale.amount_paid > sale.total_amount;
  const effectiveTotal = hasHigherPayment ? sale.amount_paid : sale.total_amount;
  const effectiveAmountPaid =
    (sale as any).accumulatedAmountPaid ??
    (hasHigherPayment ? sale.amount_paid : sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount);
  const isForgiven = !isRepayment && isDebtForgiven(sale.payment_status, sale.notes);

  const status = isRepayment
    ? { label: 'Debt payment', color: COLORS.text.secondary }
    : isForgiven
    ? { label: 'Debt forgiven', color: COLORS.text.secondary }
    : sale.payment_status === 'paid' || hasHigherPayment
    ? { label: 'Paid in full', color: COLORS.success }
    : sale.payment_status === 'partial'
    ? { label: 'Part paid', color: COLORS.warning }
    : { label: 'On credit', color: COLORS.danger };

  const items = sale.items ?? [];
  const totalBaseAmount = items.reduce((sum: number, it: any) => sum + (Number(it.total_price) || 0), 0) || sale.total_amount || 1;
  let remaining = hasHigherPayment ? effectiveTotal : 0;

  const customer = sale.customer as any;
  const initials = (businessName || 'B')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  const method = METHOD[sale.payment_method] ?? sale.payment_method.replace('_', ' ');

  return (
    <View style={styles.paper} collapsable={false}>
      {/* ── Business ─────────────────────────────────────────── */}
      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 26 }}>
        {businessLogoUrl ? (
          <Image source={{ uri: businessLogoUrl }} style={styles.logo} resizeMode="cover" />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoText}>{initials}</Text>
          </View>
        )}
        <Text style={styles.business}>{businessName}</Text>
        <Text style={styles.businessMeta}>{[branchName, businessAddress, businessPhone].filter(Boolean).join(' · ')}</Text>
      </View>

      {/* ── Reference ────────────────────────────────────────── */}
      <View style={styles.refRow}>
        <View>
          <Text style={styles.refLabel}>Receipt {sale.sale_number}</Text>
          <Text style={styles.refDate}>{format(new Date(sale.created_at), 'd MMM yyyy, h:mm a')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusText, { color: status.color === COLORS.text.secondary ? COLORS.text.secondary : status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      {customer?.name ? (
        <View style={[styles.line, { paddingHorizontal: 22, paddingTop: 2 }]}>
          <Text style={styles.lineLabel}>Customer</Text>
          <Text style={styles.lineValue} numberOfLines={1}>
            {customer.name}
            {customer.phone ? ` · ${customer.phone}` : ''}
          </Text>
        </View>
      ) : null}

      {/* ── Items ────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 22, marginTop: 10 }}>
        {items.length > 0 ? (
          items.map((item: any, index: number) => {
            let lineTotal = item.total_price;
            let unit = item.unit_price;
            if (hasHigherPayment) {
              if (items.length === 1) lineTotal = effectiveTotal;
              else if (index === items.length - 1) lineTotal = remaining;
              else {
                lineTotal = Number(((Number(item.total_price) / totalBaseAmount) * effectiveTotal).toFixed(2));
                remaining = Number((remaining - lineTotal).toFixed(2));
              }
              unit = Number((lineTotal / (Number(item.quantity) || 1)).toFixed(2));
            }
            return (
              <View key={item.id ?? `${item.product_id}-${index}`} style={[styles.item, index < items.length - 1 && styles.itemDivider]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.itemName}>{(item.product as any)?.name ?? item.product_name ?? 'Item'}</Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity} × {money(unit)}
                    {item.discount_amount > 0 && !hasHigherPayment ? `, less ${money(item.discount_amount)}` : ''}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>{money(lineTotal)}</Text>
              </View>
            );
          })
        ) : isRepayment ? (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>Payment towards an outstanding balance</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.tear} />

      {/* ── Totals ───────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 22, gap: 6 }}>
        {!isRepayment && sale.discount_amount > 0 && !hasHigherPayment ? (
          <>
            <Row label="Subtotal" value={money(sale.subtotal)} />
            <Row label="Discount" value={`−${money(sale.discount_amount)}`} />
          </>
        ) : null}
        {!isRepayment && sale.tax_amount > 0 ? <Row label="Tax" value={money(sale.tax_amount)} /> : null}

        {isRepayment ? (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Paid now</Text>
              <Text style={styles.total}>{money(sale.amount_paid)}</Text>
            </View>
            {items.length > 0 ? <Row label="Original purchase" value={money(sale.total_amount)} /> : null}
            <Row label="Paid so far" value={money((sale as any).accumulatedAmountPaid ?? sale.amount_paid)} />
            <Row
              label={sale.amount_owed > 0 && !isForgiven ? 'Still owed' : 'Balance'}
              value={sale.amount_owed > 0 && !isForgiven ? money(sale.amount_owed) : isForgiven ? 'Forgiven' : 'Settled'}
              strong
              color={sale.amount_owed > 0 && !isForgiven ? COLORS.dangerText : COLORS.successText}
            />
          </>
        ) : (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>{money(effectiveTotal)}</Text>
            </View>
            <Row label="Paid" value={money(effectiveAmountPaid)} />
            {!hasHigherPayment && !isForgiven && sale.amount_owed > 0 ? (
              <Row label="Balance owed" value={money(sale.amount_owed)} strong color={COLORS.dangerText} />
            ) : isForgiven ? (
              <Row label="Balance" value="Forgiven" strong />
            ) : null}
          </>
        )}

        <View style={[styles.line, { marginTop: 8 }]}>
          <Text style={styles.lineLabel}>Payment</Text>
          <Text style={styles.lineValue}>{sale.bank_name ? `${method} · ${sale.bank_name}` : method}</Text>
        </View>
        {sale.payment_method === 'mixed' ? (
          <>
            <Row label="Cash" value={money(getPaymentBreakdown(sale).cash)} small />
            <Row label="Transfer" value={money(getPaymentBreakdown(sale).transfer)} small />
          </>
        ) : null}
      </View>

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={styles.footer}>
        {sale.notes ? <Text style={styles.note}>{sale.notes}</Text> : null}
        <Text style={styles.thanks}>Thank you for your business</Text>
        <Text style={styles.madeWith}>Recorded with Record Am</Text>
      </View>
    </View>
  );
}

function Row({ label, value, strong, small, color }: { label: string; value: string; strong?: boolean; small?: boolean; color?: string }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, small && { fontSize: 12 }, strong && { color: color ?? COLORS.text.primary, fontFamily: FONT.semiBold }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.lineValue,
          small && { fontSize: 12, color: COLORS.text.secondary },
          strong && { fontFamily: FONT.semiBold },
          color ? { color } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    borderCurve: 'continuous',
    width: '100%',
    maxWidth: 380,
    // Shrink to the space between the system bars. (A percentage maxHeight is
    // measured against the full window on Android and pushed the buttons off screen.)
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  // Shrinks to fit so the Save and Share buttons below always stay in view.
  paperScroll: { flexGrow: 0, flexShrink: 1 },
  // Android squeezes every child of a too-tall column, buttons included, unless told not to.
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, flexShrink: 0 },
  headerTitle: { fontSize: 19, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.35 },
  headerSub: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  paperArea: { alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, flexShrink: 0 },

  paper: { width: 340, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, overflow: 'hidden' },
  logo: { width: 48, height: 48, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  logoFallback: { backgroundColor: COLORS.accentLight, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 19, fontFamily: FONT.display, color: COLORS.accentDark },
  business: { fontSize: 21, fontFamily: FONT.display, color: COLORS.text.primary, textAlign: 'center', letterSpacing: -0.3 },
  businessMeta: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  refRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginHorizontal: 22,
    marginTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  refLabel: { fontSize: 13.5, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  refDate: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12.5, fontFamily: FONT.medium },
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSubtle },
  itemName: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.primary },
  itemMeta: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  itemAmount: { fontSize: 14, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  tear: { marginHorizontal: 22, marginVertical: 12, borderTopWidth: 1, borderStyle: 'dashed', borderColor: COLORS.borderDark },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  totalLabel: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  total: { fontSize: 28, fontFamily: FONT.display, color: COLORS.text.primary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lineLabel: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary },
  lineValue: { flexShrink: 1, fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  footer: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22, marginTop: 16, backgroundColor: COLORS.surface },
  note: { fontSize: 12.5, fontFamily: FONT.displayRegular, color: COLORS.text.secondary, textAlign: 'center', marginBottom: 10, lineHeight: 18 },
  thanks: { fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.primary },
  madeWith: { fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.faint, marginTop: 4 },
});
