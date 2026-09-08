import React from 'react';
import { Text, View } from 'react-native';
import { FlatSection } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { COLORS, FONT } from '@/constants';
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
    <View>
      <SectionHeader title={`Cart (${cart.length})`} />
      {cart.length === 0 ? (
        <FlatSection style={{ padding: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
            Products you add to the cart will appear here.
          </Text>
        </FlatSection>
      ) : (
        <View style={{ gap: 10, marginBottom: 20 }}>
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
