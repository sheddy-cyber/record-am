import React from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Divider, SectionHeader } from '@/components/ui';
import { InputField, SelectField } from '@/components/forms';
import { COLORS, CURRENCY_SYMBOL, FONT, PAYMENT_METHODS, RADIUS } from '@/constants';
import { PaymentMethod } from '@/types';

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
  saleNotes: string;
  isEditing: boolean;
  savingSale: boolean;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAmountPaidChange: (value: string) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
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
  saleNotes,
  isEditing,
  savingSale,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAmountPaidChange,
  onPaymentMethodChange,
  onSaleNotesChange,
  onSubmitSale,
}) => {
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
          placeholder={`${cartTotal}`}
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
