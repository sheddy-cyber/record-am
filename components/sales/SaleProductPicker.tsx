import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { InputField } from '@/components/forms';
import { FlatSection } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { CartItem, Product } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatCount = (value: number) => {
  if (Number.isInteger(value)) return `${value}`;
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

interface SaleProductPickerProps {
  search: string;
  onSearchChange: (value: string) => void;
  products: Product[];
  cart: CartItem[];
  pinnedProductIdSet: Set<string>;
  getProductStock: (product: Product) => number;
  onToggleProductInCart: (product: Product) => void;
  onTogglePinnedProduct: (productId: string) => void;
}

export const SaleProductPicker: React.FC<SaleProductPickerProps> = ({
  search,
  onSearchChange,
  products,
  cart,
  pinnedProductIdSet,
  getProductStock,
  onToggleProductInCart,
  onTogglePinnedProduct,
}) => {
  return (
    <View>
      <InputField
        label="Find Product"
        value={search}
        onChangeText={onSearchChange}
        placeholder="Search by product name"
        leftIcon={<Feather name="search" size={16} color={COLORS.text.muted} />}
      />

      <SectionHeader title="Products" />
      <View style={{ gap: 10, marginBottom: 20 }}>
        <FlatSection style={{ padding: 14 }}>
          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
            Tap any product to add it to cart.
          </Text>
        </FlatSection>

        {products.length === 0 ? (
          <FlatSection style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.muted }}>
              No products match that search.
            </Text>
          </FlatSection>
        ) : (
          products.map((product) => {
            const stock = getProductStock(product);
            const isDisabled = !product.is_service && stock <= 0;
            const alreadyAdded = cart.some((item) => item.product.id === product.id);
            const isPinned = pinnedProductIdSet.has(product.id);

            return (
              <TouchableOpacity
                key={product.id}
                onPress={() => onToggleProductInCart(product)}
                activeOpacity={0.8}
                style={{
                  borderRadius: RADIUS.lg,
                  borderWidth: 1,
                  borderColor: alreadyAdded ? COLORS.ink : COLORS.border,
                  backgroundColor: alreadyAdded ? COLORS.surface2 : COLORS.card,
                  padding: 14,
                  opacity: isDisabled ? 0.55 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                      {product.name}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 4 }}>
                      {formatCurrency(product.selling_price)} per {product.unit}
                    </Text>
                    {!product.is_service ? (
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 4 }}>
                        {formatCount(stock)} {product.unit} available
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation();
                        onTogglePinnedProduct(product.id);
                      }}
                      activeOpacity={0.8}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        borderWidth: 1,
                        borderColor: isPinned ? COLORS.accent : COLORS.border,
                        backgroundColor: isPinned ? COLORS.accentLight : COLORS.card,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="star" size={15} color={isPinned ? COLORS.accent : COLORS.text.muted} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.accent }}>
                      {isPinned ? 'Tap to unpin' : 'Tap to pin'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};
