import React from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { InputField } from '@/components/forms';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { getDefaultBundleSize, getSaleUnitOptions } from '@/lib/records';
import { CartItem } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

interface SaleCartItemCardProps {
  item: CartItem;
  quantityInput: string;
  onQuantityChange: (value: string) => void;
  onQuantityBlur: () => void;
  onStepQuantity: (delta: number) => void;
  onDiscountChange: (value: string) => void;
  onSaleUnitChange: (saleUnit: string) => void;
  onBundleSizeChange: (value: string) => void;
  onUnitPriceChange: (value: string) => void;
  onRemove: () => void;
}

export const SaleCartItemCard: React.FC<SaleCartItemCardProps> = ({
  item,
  quantityInput,
  onQuantityChange,
  onQuantityBlur,
  onStepQuantity,
  onDiscountChange,
  onSaleUnitChange,
  onBundleSizeChange,
  onUnitPriceChange,
  onRemove,
}) => {
  const unitOptions = getSaleUnitOptions(item.product, item.bundle_size);
  const isUnitBreakdown = item.sale_unit !== item.product.unit;
  const isMin = item.quantity <= 1;

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary }}>
            {item.product.name}
          </Text>
          <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.navy, marginTop: 2 }}>
            {formatCurrency(item.unit_price)} <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>/{item.sale_unit}</Text>
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={{
            width: 32,
            height: 32,
            borderRadius: RADIUS.full,
            backgroundColor: COLORS.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="trash-2" size={15} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      {unitOptions.length > 1 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontFamily: FONT.semiBold, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Sell As
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {unitOptions.map((option) => {
              const active = item.sale_unit === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => onSaleUnitChange(option.value)}
                  activeOpacity={0.7}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: RADIUS.full,
                    borderColor: active ? COLORS.navy : COLORS.border,
                    backgroundColor: active ? COLORS.navy : COLORS.card,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: FONT.medium,
                      color: active ? '#ffffff' : COLORS.text.primary,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        <View style={{ flex: 1.2 }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: FONT.medium,
              color: COLORS.text.secondary,
              marginBottom: 6,
            }}
          >
            Quantity
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.surface,
              borderRadius: RADIUS.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: COLORS.border,
              height: 48,
              paddingHorizontal: 4,
            }}
          >
            <TouchableOpacity
              onPress={() => onStepQuantity(-1)}
              disabled={isMin}
              activeOpacity={0.7}
              style={{
                width: 38,
                height: 38,
                borderRadius: RADIUS.sm,
                backgroundColor: isMin ? 'transparent' : COLORS.card,
                borderWidth: isMin ? 0 : StyleSheet.hairlineWidth,
                borderColor: COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="minus" size={16} color={isMin ? COLORS.text.muted : COLORS.text.primary} />
            </TouchableOpacity>

            <TextInput
              value={quantityInput}
              onChangeText={onQuantityChange}
              onBlur={onQuantityBlur}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.text.muted}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: FONT.semiBold,
                fontSize: 16,
                color: COLORS.text.primary,
                paddingHorizontal: 4,
              }}
            />

            <TouchableOpacity
              onPress={() => onStepQuantity(1)}
              activeOpacity={0.7}
              style={{
                width: 38,
                height: 38,
                borderRadius: RADIUS.sm,
                backgroundColor: COLORS.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="plus" size={16} color={COLORS.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <InputField
            label="Discount"
            value={item.discount_amount ? `${item.discount_amount}` : ''}
            onChangeText={onDiscountChange}
            keyboardType="numeric"
            placeholder="0"
            prefix={CURRENCY_SYMBOL}
            isAmount={true}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
      </View>

      {isUnitBreakdown ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {item.uses_custom_bundle ? (
            <View style={{ flex: 1 }}>
              <InputField
                label={`Units per ${item.product.unit}`}
                value={item.bundle_size && item.bundle_size > 1 ? `${item.bundle_size}` : ''}
                onChangeText={onBundleSizeChange}
                keyboardType="numeric"
                placeholder="e.g. 12"
                hint="Needed to reduce stock correctly."
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View
                style={{
                  padding: 12,
                  minHeight: 74,
                  justifyContent: 'center',
                  backgroundColor: COLORS.surface,
                  borderRadius: RADIUS.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.text.muted }}>
                  Stock conversion
                </Text>
                <Text style={{ fontSize: 13, fontFamily: FONT.semiBold, color: COLORS.text.primary, marginTop: 4 }}>
                  {formatCount(item.bundle_size ?? getDefaultBundleSize(item.product) ?? 1)} {item.sale_unit} / {item.product.unit}
                </Text>
              </View>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <InputField
              label={`Price per ${item.sale_unit}`}
              value={item.unit_price ? `${item.unit_price}` : ''}
              onChangeText={onUnitPriceChange}
              keyboardType="numeric"
              placeholder="0"
              prefix={CURRENCY_SYMBOL}
              isAmount={true}
              containerStyle={{ marginBottom: 0 }}
            />
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: COLORS.borderSubtle,
        }}
      >
        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
          Deducts {formatCount(item.stock_quantity)} {item.product.unit} from stock
        </Text>
        <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.ink }}>
          {formatCurrency(item.total_price)}
        </Text>
      </View>
    </Card>
  );
};
