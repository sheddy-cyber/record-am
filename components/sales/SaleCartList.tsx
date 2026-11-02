import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui';
import { COLORS, FONT, RADIUS, SHADOW } from '@/constants';
import { CartItem } from '@/types';
import { SaleCartItemCard } from './SaleCartItemCard';

interface SaleCartListProps {
  cart: CartItem[];
  quantityInputs: Record<string, string>;
  onQuantityChange: (productId: string, value: string) => void;
  onQuantityBlur: (productId: string) => void;
  onStepQuantity: (productId: string, delta: number) => void;
  onDiscountChange: (productId: string, value: string) => void;
  onSaleUnitChange: (productId: string, saleUnit: string) => void;
  onBundleSizeChange: (productId: string, value: string) => void;
  onUnitPriceChange: (productId: string, value: string) => void;
  onRemoveItem: (productId: string) => void;
}

export const SaleCartList: React.FC<SaleCartListProps> = ({
  cart,
  quantityInputs,
  onQuantityChange,
  onQuantityBlur,
  onStepQuantity,
  onDiscountChange,
  onSaleUnitChange,
  onBundleSizeChange,
  onUnitPriceChange,
  onRemoveItem,
}) => {
  return (
    <View style={{ marginTop: 4 }}>
      <SectionHeader
        title="Items in Cart"
        rightAction={
          cart.length > 0 ? (
            <View
              style={{
                backgroundColor: COLORS.navyLight,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: RADIUS.full,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: FONT.semiBold, color: COLORS.navy }}>
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
          ) : undefined
        }
      />
      {cart.length === 0 ? (
        <View
          style={{
            padding: 24,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 20,
            ...SHADOW.sm,
          }}
        >
          <Feather name="shopping-bag" size={24} color={COLORS.text.muted} />
          <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
            Tap products above to build customer order
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12, marginBottom: 20 }}>
          {cart.map((item) => (
            <SaleCartItemCard
              key={item.product.id}
              item={item}
              quantityInput={quantityInputs[item.product.id] ?? `${item.quantity}`}
              onQuantityChange={(val) => onQuantityChange(item.product.id, val)}
              onQuantityBlur={() => onQuantityBlur(item.product.id)}
              onStepQuantity={(delta) => onStepQuantity(item.product.id, delta)}
              onDiscountChange={(val) => onDiscountChange(item.product.id, val)}
              onSaleUnitChange={(unit) => onSaleUnitChange(item.product.id, unit)}
              onBundleSizeChange={(size) => onBundleSizeChange(item.product.id, size)}
              onUnitPriceChange={(price) => onUnitPriceChange(item.product.id, price)}
              onRemove={() => onRemoveItem(item.product.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
};
