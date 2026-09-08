import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { InputField } from '@/components/forms';
import { FlatSection } from '@/components/layout';
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
            {item.product.name}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
            {formatCurrency(item.unit_price)} per {item.sale_unit}
          </Text>
        </View>
        <TouchableOpacity onPress={onRemove} activeOpacity={0.8}>
          <Feather name="x" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.secondary }}>
          Sell As
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {unitOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => onSaleUnitChange(option.value)}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderRadius: RADIUS.sm,
                borderColor: item.sale_unit === option.value ? COLORS.ink : COLORS.border,
                backgroundColor: item.sale_unit === option.value ? COLORS.surface2 : COLORS.card,
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <InputField
            label="Quantity"
            value={quantityInput}
            onChangeText={onQuantityChange}
            onBlur={onQuantityBlur}
            keyboardType="numeric"
            placeholder="0"
            rightElement={
              <View
                style={{
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 38,
                  marginRight: -6,
                }}
              >
                <TouchableOpacity
                  onPress={() => onStepQuantity(1)}
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 2, left: 12, right: 12 }}
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="chevron-up" size={16} color={COLORS.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onStepQuantity(-1)}
                  activeOpacity={0.6}
                  disabled={isMin}
                  hitSlop={{ top: 2, bottom: 8, left: 12, right: 12 }}
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isMin ? 0.3 : 1,
                  }}
                >
                  <Feather name="chevron-down" size={16} color={COLORS.text.primary} />
                </TouchableOpacity>
              </View>
            }
            containerStyle={{ marginBottom: 0 }}
          />
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
              <FlatSection style={{ padding: 12, minHeight: 82, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                  Stock conversion
                </Text>
                <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary, marginTop: 4 }}>
                  {formatCount(item.bundle_size ?? getDefaultBundleSize(item.product) ?? 1)} {item.sale_unit} per {item.product.unit}
                </Text>
              </FlatSection>
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

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
          Uses {formatCount(item.stock_quantity)} {item.product.unit} from stock
        </Text>
        <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
          {formatCurrency(item.total_price)}
        </Text>
      </View>
    </Card>
  );
};
