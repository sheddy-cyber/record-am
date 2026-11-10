import React, { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { format } from 'date-fns';
import { getPaymentBreakdown, isDebtForgiven } from '@/lib/records';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { Sale } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

interface ReceiptPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  previewSale: Sale | null;
  businessId?: string;
  branchId?: string;
  businessName?: string;
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
        Alert.alert(
          'Permission required',
          'Gallery write permission is needed to save the receipt to your device.',
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      const imageUri = await receiptCaptureRef.current?.capture?.();
      if (!imageUri) throw new Error('Could not capture receipt image');

      await MediaLibrary.createAssetAsync(imageUri);
      Alert.alert('Saved to Gallery', 'Receipt image has been saved to your gallery.');
    } catch (err) {
      Alert.alert('Download failed', 'The receipt could not be saved to your device.');
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
      Alert.alert('Unable to share image', 'Please try again.');
      console.error(err);
    } finally {
      setIsSharingImage(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 36,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: RADIUS['2xl'],
            width: '100%',
            maxWidth: 366,
            maxHeight: '92%',
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: COLORS.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 15,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: COLORS.border,
              backgroundColor: COLORS.card,
            }}
          >
            <View>
              <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary, letterSpacing: -0.2 }}>
                Receipt Preview
              </Text>
              {previewSale ? (
                <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 }}>
                  {previewSale.sale_number}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: COLORS.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              activeOpacity={0.7}
            >
              <Feather name="x" size={16} color={COLORS.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Receipt Area */}
          <ScrollView
            contentContainerStyle={{
              alignItems: 'center',
              paddingVertical: 18,
              paddingHorizontal: 12,
              backgroundColor: '#F1F5F9',
            }}
            showsVerticalScrollIndicator={false}
          >
            {previewSale && (
              <ViewShot
                ref={receiptCaptureRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
              >
                <View collapsable={false}>
                  <ReceiptShareCard
                    sale={previewSale}
                    businessName={businessName}
                    businessAddress={businessAddress}
                    businessPhone={businessPhone}
                    branchName={branchName}
                  />
                </View>
              </ViewShot>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View
            style={{
              padding: 16,
              gap: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: COLORS.border,
              backgroundColor: COLORS.card,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleShareImage}
                disabled={isSharingImage}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: COLORS.ink,
                  paddingVertical: 13,
                  borderRadius: RADIUS.lg,
                  opacity: isSharingImage ? 0.7 : 1,
                }}
                activeOpacity={0.8}
              >
                {isSharingImage ? (
                  <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: '#FFFFFF' }}>Preparing...</Text>
                ) : (
                  <>
                    <Feather name="share-2" size={15} color="#FFFFFF" />
                    <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: '#FFFFFF' }}>Share Image</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDownloadReceipt}
                disabled={isDownloading}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: COLORS.surface2,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: COLORS.border,
                  paddingVertical: 13,
                  borderRadius: RADIUS.lg,
                  opacity: isDownloading ? 0.7 : 1,
                }}
                activeOpacity={0.8}
              >
                {isDownloading ? (
                  <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>Saving...</Text>
                ) : (
                  <>
                    <Feather name="download" size={15} color={COLORS.text.primary} />
                    <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>Save Image</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export function ReceiptShareCard({
  sale,
  businessName,
  businessAddress,
  businessPhone,
  branchName,
}: {
  sale: Sale;
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  branchName: string;
}) {
  const isRepayment = Boolean((sale as any).isRepayment);
  const hasHigherPayment = !isRepayment && sale.amount_paid > sale.total_amount;
  const effectiveTotal = hasHigherPayment ? sale.amount_paid : sale.total_amount;
  const effectiveAmountPaid = (sale as any).accumulatedAmountPaid ?? (hasHigherPayment ? sale.amount_paid : (sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount));

  const isForgiven = !isRepayment && isDebtForgiven(sale.payment_status, sale.notes);

  const statusLabel =
    isRepayment
      ? 'SETTLEMENT'
      : isForgiven
        ? 'DEBT FORGIVEN'
        : (sale.payment_status === 'paid' || hasHigherPayment)
          ? 'PAID IN FULL'
          : sale.payment_status === 'partial'
            ? 'PARTIALLY PAID'
            : 'CREDIT / UNPAID';

  const statusBgColor =
    isRepayment
      ? COLORS.ink
      : isForgiven
        ? COLORS.ink
        : (sale.payment_status === 'paid' || hasHigherPayment)
          ? '#059669'
          : sale.payment_status === 'partial'
            ? '#D97706'
            : '#DC2626';

  const items = sale.items ?? [];
  const totalBaseAmount = items.reduce((sum: number, it: any) => sum + (Number(it.total_price) || 0), 0) || sale.total_amount || 1;
  let remainingCalculatedTotal = hasHigherPayment ? effectiveTotal : 0;

  return (
    <View
      style={{
        width: 340,
        backgroundColor: '#FFFFFF',
        borderRadius: RADIUS.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
      }}
      collapsable={false}
    >
      {/* ── Business Branding Header (Steel Azure) ── */}
      <View
        style={{
          backgroundColor: COLORS.ink,
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: 20,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <Feather name="shopping-bag" size={18} color="#FFFFFF" />
        </View>
        <Text
          style={{
            fontSize: 18,
            fontFamily: FONT.bold,
            color: '#FFFFFF',
            textAlign: 'center',
            letterSpacing: -0.2,
          }}
        >
          {businessName}
        </Text>
        <Text
          style={{
            fontSize: 11.5,
            fontFamily: FONT.regular,
            color: 'rgba(255, 255, 255, 0.8)',
            textAlign: 'center',
            marginTop: 4,
            lineHeight: 16,
          }}
        >
          {[branchName, businessAddress, businessPhone].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* ── Receipt Reference & Status Ribbon ── */}
      <View
        style={{
          backgroundColor: '#F8FAFC',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#E2E8F0',
          paddingHorizontal: 18,
          paddingVertical: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 0.6 }}>
            RECEIPT
          </Text>
          <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 1 }}>
            {sale.sale_number}
          </Text>
          <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
            {format(new Date(sale.created_at), 'MMM d, yyyy · h:mm a')}
          </Text>
        </View>

        {/* Deep solid pill with white text (Clean & Smart philosophy) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: statusBgColor,
            paddingHorizontal: 10,
            paddingVertical: 4.5,
            borderRadius: RADIUS.full,
          }}
        >
          <Text style={{ fontSize: 10.5, fontFamily: FONT.bold, color: '#FFFFFF', letterSpacing: 0.4 }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* ── Customer Info ── */}
      {(sale.customer as any)?.name || sale.amount_owed > 0 ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 2 }}>
          <View
            style={{
              backgroundColor: '#F8FAFC',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: '#E2E8F0',
              borderRadius: RADIUS.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: COLORS.navyLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="user" size={15} color={COLORS.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 0.6 }}>
                BILLED TO
              </Text>
              <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 1 }} numberOfLines={1}>
                {(sale.customer as any)?.name ?? 'Walk-in Customer'}
              </Text>
              {(sale.customer as any)?.phone ? (
                <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 1 }}>
                  {(sale.customer as any).phone}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* ── Items Breakdown ── */}
      {items.length > 0 ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingBottom: 6,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: '#E2E8F0',
            }}
          >
            <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 0.8 }}>
              ITEM
            </Text>
            <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 0.8 }}>
              AMOUNT
            </Text>
          </View>

          <View style={{ marginTop: 2 }}>
            {items.map((item: any, index: number) => {
              let itemTotalPrice = item.total_price;
              let itemUnitPrice = item.unit_price;

              if (hasHigherPayment) {
                if (items.length === 1) {
                  itemTotalPrice = effectiveTotal;
                } else if (index === items.length - 1) {
                  itemTotalPrice = remainingCalculatedTotal;
                } else {
                  itemTotalPrice = Number(((Number(item.total_price) / totalBaseAmount) * effectiveTotal).toFixed(2));
                  remainingCalculatedTotal = Number((remainingCalculatedTotal - itemTotalPrice).toFixed(2));
                }
                const qty = Number(item.quantity) || 1;
                itemUnitPrice = Number((itemTotalPrice / qty).toFixed(2));
              }

              return (
                <View
                  key={item.id ?? `${item.product_id}-${index}`}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    paddingVertical: 9,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: '#F1F5F9',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                      {(item.product as any)?.name ?? item.product_name ?? 'Item'}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
                      {item.quantity} × {formatCurrency(itemUnitPrice)} each
                      {item.discount_amount > 0 && !hasHigherPayment ? ` (-${formatCurrency(item.discount_amount)})` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 1 }}>
                    {formatCurrency(itemTotalPrice)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : isRepayment ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: RADIUS.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 0.6 }}>
              PAYMENT PURPOSE
            </Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 2 }}>
              Customer Debt Settlement
            </Text>
            <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>
              Instalment payment recorded against outstanding balance
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Perforated Tear Line ── */}
      <View style={{ marginHorizontal: 18, marginVertical: 12, borderStyle: 'dashed', borderWidth: 0.8, borderColor: '#CBD5E1' }} />

      {/* ── Financial Summary ── */}
      <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 8 }}>
        {!(sale as any).isRepayment && sale.discount_amount > 0 && !hasHigherPayment ? (
          <SummaryRow label="Subtotal" value={formatCurrency(sale.subtotal)} />
        ) : null}
        {!(sale as any).isRepayment && sale.discount_amount > 0 && !hasHigherPayment ? (
          <SummaryRow
            label="Discount"
            value={`- ${formatCurrency(sale.discount_amount)}`}
            valueStyle={{ color: COLORS.danger }}
          />
        ) : null}
        {!(sale as any).isRepayment && sale.tax_amount > 0 ? (
          <SummaryRow label="Tax" value={formatCurrency(sale.tax_amount)} />
        ) : null}

        {isRepayment ? (
          <>
            {items.length > 0 ? (
              <SummaryRow label="Total Purchase" value={formatCurrency(sale.total_amount)} />
            ) : null}
            <View
              style={{
                backgroundColor: '#ECFDF5',
                borderRadius: RADIUS.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: '#A7F3D0',
                marginVertical: 4,
              }}
            >
              <SummaryRow
                label="This Payment"
                value={formatCurrency(sale.amount_paid)}
                labelStyle={{ color: '#047857', fontFamily: FONT.bold }}
                valueStyle={{ color: '#047857', fontFamily: FONT.bold, fontSize: 16 }}
              />
            </View>
            <SummaryRow
              label="Total Paid (All-time)"
              value={formatCurrency((sale as any).accumulatedAmountPaid ?? sale.amount_paid)}
              labelStyle={{ color: COLORS.text.muted }}
              valueStyle={{ color: COLORS.text.secondary }}
            />
            <SummaryRow
              label={sale.amount_owed > 0 && !isForgiven ? 'Remaining Balance' : 'Payment Status'}
              value={sale.amount_owed > 0 && !isForgiven ? formatCurrency(sale.amount_owed) : isForgiven ? 'DEBT FORGIVEN' : 'FULLY SETTLED'}
              labelStyle={{ color: sale.amount_owed > 0 && !isForgiven ? COLORS.danger : COLORS.success, fontFamily: FONT.medium }}
              valueStyle={{ color: sale.amount_owed > 0 && !isForgiven ? COLORS.danger : COLORS.success, fontFamily: FONT.bold }}
            />
          </>
        ) : (
          <>
            <View
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: RADIUS.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: '#E2E8F0',
                marginVertical: 2,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                  Total
                </Text>
                <Text style={{ fontSize: 19, fontFamily: FONT.bold, color: COLORS.ink }}>
                  {formatCurrency(effectiveTotal)}
                </Text>
              </View>
            </View>

            <SummaryRow
              label="Amount Paid"
              value={formatCurrency(effectiveAmountPaid)}
              labelStyle={{ color: COLORS.text.secondary, fontFamily: FONT.medium }}
              valueStyle={{ color: COLORS.success, fontFamily: FONT.bold }}
            />

            {!hasHigherPayment && !isForgiven && sale.amount_owed > 0 ? (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  borderRadius: RADIUS.md,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: '#FECACA',
                }}
              >
                <SummaryRow
                  label="Balance Owed"
                  value={formatCurrency(sale.amount_owed)}
                  labelStyle={{ color: COLORS.danger, fontFamily: FONT.bold }}
                  valueStyle={{ color: COLORS.danger, fontFamily: FONT.bold }}
                />
              </View>
            ) : isForgiven ? (
              <View
                style={{
                  backgroundColor: '#F0F9FF',
                  borderRadius: RADIUS.md,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: '#BAE6FD',
                }}
              >
                <SummaryRow
                  label="Debt Status"
                  value="FORGIVEN (₦0 DUE)"
                  labelStyle={{ color: COLORS.navy, fontFamily: FONT.bold }}
                  valueStyle={{ color: COLORS.navy, fontFamily: FONT.bold }}
                />
              </View>
            ) : null}
          </>
        )}

        <View style={{ height: 4 }} />

        {/* Payment Method Badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: '#F1F5F9',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="credit-card" size={13} color={COLORS.text.muted} />
            <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text.muted }}>
              Payment Method
            </Text>
          </View>
          <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: COLORS.text.primary }}>
            {sale.bank_name
              ? `${sale.payment_method.replace('_', ' ').toUpperCase()} (${sale.bank_name})`
              : sale.payment_method.replace('_', ' ').toUpperCase()}
          </Text>
        </View>

        {sale.payment_method === 'mixed' ? (
          <View style={{ gap: 4, paddingLeft: 18 }}>
            <SummaryRow
              label="• Cash"
              value={formatCurrency(getPaymentBreakdown(sale).cash)}
              labelStyle={{ fontSize: 11, color: COLORS.text.muted }}
              valueStyle={{ fontSize: 11, color: COLORS.text.secondary }}
            />
            <SummaryRow
              label={`• Transfer${sale.bank_name ? ` (${sale.bank_name})` : ''}`}
              value={formatCurrency(getPaymentBreakdown(sale).transfer)}
              labelStyle={{ fontSize: 11, color: COLORS.text.muted }}
              valueStyle={{ fontSize: 11, color: COLORS.text.secondary }}
            />
          </View>
        ) : null}
      </View>

      {/* ── Footer & Stylized Barcode ── */}
      <View
        style={{
          backgroundColor: '#F8FAFC',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#E2E8F0',
          paddingHorizontal: 20,
          paddingVertical: 18,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.text.primary }}>
          Thank you for your business!
        </Text>
        {sale.notes ? (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: '#E2E8F0',
              borderRadius: RADIUS.sm,
              paddingHorizontal: 12,
              paddingVertical: 6,
              marginTop: 8,
              maxWidth: '90%',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: FONT.regular,
                color: COLORS.text.secondary,
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              "{sale.notes}"
            </Text>
          </View>
        ) : null}

        {/* Clean Stylized Barcode Graphic */}
        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 24, gap: 2 }}>
            {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2].map((w, idx) => (
              <View
                key={idx}
                style={{
                  width: w,
                  height: 24,
                  backgroundColor: idx % 2 === 0 ? COLORS.text.primary : 'transparent',
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 9.5, fontFamily: FONT.medium, color: COLORS.text.muted, letterSpacing: 2, marginTop: 4 }}>
            {sale.sale_number}
          </Text>
        </View>

        <Text style={{ fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.text.muted, letterSpacing: 1, marginTop: 12 }}>
          POWERED BY RECORD AM
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  labelStyle?: object;
  valueStyle?: object;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={[{ fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.secondary }, labelStyle]}>
        {label}
      </Text>
      <Text style={[{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'right' }, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}
