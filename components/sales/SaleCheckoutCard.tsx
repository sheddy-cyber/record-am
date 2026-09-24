import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Divider, SectionHeader } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { COLORS, CURRENCY_SYMBOL, FONT, PAYMENT_METHODS, RADIUS } from '@/constants';
import { PaymentAccount, PaymentMethod } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

interface SaleCheckoutCardProps {
  subtotal: number;
  totalDiscount: number;
  cartTotal: number;
  amountPaid: string;
  amountOwed: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  paymentAccountId?: string;
  paymentAccounts?: PaymentAccount[];
  cashAmount: string;
  transferAmount: string;
  saleNotes: string;
  isEditing: boolean;
  savingSale: boolean;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAmountPaidChange: (value: string) => void;
  onAmountPaidBlur?: () => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onPaymentAccountChange?: (accountId: string, accountName: string) => void;
  onAddNewPaymentAccount?: () => void;
  onCashAmountChange: (value: string) => void;
  onTransferAmountChange: (value: string) => void;
  onSaleNotesChange: (value: string) => void;
  onSubmitSale: () => void;
}

export const SaleCheckoutCard: React.FC<SaleCheckoutCardProps> = ({
  subtotal,
  totalDiscount,
  cartTotal,
  amountPaid,
  amountOwed,
  customerName,
  customerPhone,
  paymentMethod,
  paymentAccountId,
  paymentAccounts = [],
  cashAmount,
  transferAmount,
  saleNotes,
  isEditing,
  savingSale,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAmountPaidChange,
  onAmountPaidBlur,
  onPaymentMethodChange,
  onPaymentAccountChange,
  onAddNewPaymentAccount,
  onCashAmountChange,
  onTransferAmountChange,
  onSaleNotesChange,
  onSubmitSale,
}) => {
  const effectivePaid = amountPaid === '' ? cartTotal : (parseFloat(amountPaid) || 0);
  const parsedCash = parseFloat(cashAmount) || 0;
  const parsedTransfer = parseFloat(transferAmount) || 0;
  const splitSum = Number((parsedCash + parsedTransfer).toFixed(2));
  const isSplitMismatch = Math.abs(splitSum - Number(effectivePaid.toFixed(2))) > 0.01;

  const isTransfer = paymentMethod === 'transfer';
  const isPos = paymentMethod === 'pos';

  const relevantAccounts = isPos
    ? paymentAccounts.filter((a) => a.channel === 'pos' || a.channel === 'both')
    : paymentAccounts.filter((a) => a.channel === 'transfer' || a.channel === 'both');

  const accountLabel = isPos ? 'POS Terminal / Bank' : 'Bank Paid To';

  return (
    <View>
      <SectionHeader title="Checkout" />
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>Subtotal</Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.primary }}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>Discount</Text>
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.primary }}>- {formatCurrency(totalDiscount)}</Text>
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>Total</Text>
            <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: COLORS.accent }}>{formatCurrency(cartTotal)}</Text>
          </View>
        </View>

        <InputField
          label="Customer Name"
          value={customerName}
          onChangeText={onCustomerNameChange}
          placeholder="Leave blank for walk-in"
          containerStyle={{ marginBottom: 0 }}
        />
        <InputField
          label="Customer Phone"
          value={customerPhone}
          onChangeText={onCustomerPhoneChange}
          placeholder="08012345678"
          keyboardType="phone-pad"
          containerStyle={{ marginBottom: 0 }}
        />
        <InputField
          label="Amount Paid"
          value={amountPaid}
          onChangeText={onAmountPaidChange}
          onBlur={onAmountPaidBlur}
          placeholder="0"
          keyboardType="numeric"
          prefix={CURRENCY_SYMBOL}
          isAmount={true}
          containerStyle={{ marginBottom: 0 }}
        />
        {amountOwed > 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderRadius: RADIUS.md,
              borderColor: COLORS.warning,
              backgroundColor: COLORS.warningLight,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.warning }}>
              Outstanding balance: {formatCurrency(amountOwed)}. You can also add a discount to reconcile this difference.
            </Text>
          </View>
        ) : null}
        <SelectField
          label="Payment Method"
          value={paymentMethod}
          options={PAYMENT_METHODS}
          onChange={(value) => onPaymentMethodChange(value as PaymentMethod)}
          containerStyle={{ marginBottom: 0 }}
        />

        {(isTransfer || isPos) ? (
          relevantAccounts.length > 0 ? (
            <View style={{ gap: 4 }}>
              <SelectField
                label={accountLabel}
                value={paymentAccountId || ''}
                options={[
                  { value: '', label: `-- Select ${accountLabel} --` },
                  ...relevantAccounts.map((a) => ({
                    value: a.id,
                    label: a.account_number ? `${a.name} (${a.account_number})` : a.name,
                  })),
                ]}
                onChange={(val) => {
                  const found = relevantAccounts.find((a) => a.id === val);
                  onPaymentAccountChange?.(val, found?.name || '');
                }}
                containerStyle={{ marginBottom: 0 }}
              />
              {onAddNewPaymentAccount && (
                <TouchableOpacity
                  onPress={onAddNewPaymentAccount}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.accent }}>
                    + Add new {isPos ? 'POS terminal' : 'bank account'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : onAddNewPaymentAccount ? (
            <TouchableOpacity
              onPress={onAddNewPaymentAccount}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                backgroundColor: '#EBF3FB',
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: '#B8CFDF',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Feather name={isPos ? 'credit-card' : 'send'} size={15} color={COLORS.navy} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.navy }}>
                    No {isPos ? 'POS terminals' : 'bank accounts'} saved yet.
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                    Tap to add so you can track payments by {isPos ? 'terminal' : 'bank'}.
                  </Text>
                </View>
              </View>
              <Feather name="plus-circle" size={18} color={COLORS.accent} />
            </TouchableOpacity>
          ) : null
        ) : null}

        {paymentMethod === 'mixed' ? (
          <View
            style={{
              padding: 14,
              backgroundColor: '#F5F0E4',
              borderRadius: RADIUS.md,
              borderWidth: 1,
              borderColor: '#D8CEB7',
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                Mixed Payment Split
              </Text>
              <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                Total: {formatCurrency(effectivePaid)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Cash Portion"
                  value={cashAmount}
                  onChangeText={onCashAmountChange}
                  placeholder="0"
                  keyboardType="numeric"
                  prefix={CURRENCY_SYMBOL}
                  isAmount={true}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Transfer Portion"
                  value={transferAmount}
                  onChangeText={onTransferAmountChange}
                  placeholder="0"
                  keyboardType="numeric"
                  prefix={CURRENCY_SYMBOL}
                  isAmount={true}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
            </View>

            {relevantAccounts.length > 0 ? (
              <SelectField
                label="Bank Paid To (Transfer portion)"
                value={paymentAccountId || ''}
                options={[
                  { value: '', label: '-- Select Bank Paid To --' },
                  ...relevantAccounts.map((a) => ({
                    value: a.id,
                    label: a.account_number ? `${a.name} (${a.account_number})` : a.name,
                  })),
                ]}
                onChange={(val) => {
                  const found = relevantAccounts.find((a) => a.id === val);
                  onPaymentAccountChange?.(val, found?.name || '');
                }}
                containerStyle={{ marginBottom: 0 }}
              />
            ) : onAddNewPaymentAccount ? (
              <TouchableOpacity
                onPress={onAddNewPaymentAccount}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 10,
                  backgroundColor: '#FFFDF8',
                  borderRadius: RADIUS.sm,
                  borderWidth: 1,
                  borderColor: '#D8CEB7',
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.navy }}>
                  + Add bank for transfer portion
                </Text>
                <Feather name="plus" size={14} color={COLORS.accent} />
              </TouchableOpacity>
            ) : null}

            {isSplitMismatch ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.danger }}>
                  Split ({formatCurrency(splitSum)}) does not match amount paid ({formatCurrency(effectivePaid)})
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                Cash: {formatCurrency(parsedCash)} · Transfer: {formatCurrency(parsedTransfer)}
              </Text>
            )}
          </View>
        ) : null}
        <InputField
          label="Notes"
          value={saleNotes}
          onChangeText={onSaleNotesChange}
          placeholder="Optional note for this sale"
          multiline
          numberOfLines={3}
          containerStyle={{ marginBottom: 0 }}
        />
        <Button
          title={
            savingSale
              ? (isEditing ? 'Updating...' : 'Recording...')
              : `${isEditing ? 'Update Sale' : 'Confirm Sale'} \u00B7 ${formatCurrency(cartTotal)}`
          }
          onPress={onSubmitSale}
          loading={savingSale}
          size="lg"
        />
      </Card>
    </View>
  );
};
