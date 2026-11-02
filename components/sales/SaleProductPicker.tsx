import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { InputField } from '@/components/forms';
import { Badge, SectionHeader, SmartChip } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW } from '@/constants';
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
        placeholder="Search products by name..."
        leftIcon={<Feather name="search" size={16} color={COLORS.text.muted} />}
        containerStyle={{ marginBottom: 14 }}
      />

      <SectionHeader
        title="Products"
        rightAction={
          products.length > 0 ? (
            <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.text.muted }}>
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </Text>
          ) : undefined
        }
      />

      <View style={{ gap: 10, marginBottom: 20 }}>
        {products.length === 0 ? (
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
              ...SHADOW.sm,
            }}
          >
            <Feather name="search" size={24} color={COLORS.text.muted} />
            <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.text.secondary }}>
              No products found
            </Text>
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
              Try searching with another keyword or barcode.
            </Text>

            {search.trim() ? (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(app)/market-list',
                    params: { addItem: '1', itemName: search.trim() },
                  })
                }
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  backgroundColor: 'rgba(0, 78, 137, 0.08)',
                  borderRadius: RADIUS.md,
                }}
              >
                <Feather name="shopping-cart" size={13} color={COLORS.navy} />
                <Text style={{ fontSize: 12, fontFamily: FONT.semiBold, color: COLORS.navy }}>
                  Customer asked for this? Note in Market List
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          products.map((product) => {
            const stock = getProductStock(product);
            const isOutOfStock = !product.is_service && stock <= 0;
            const isLowStock = !product.is_service && stock > 0 && stock <= (product.reorder_level || 5);
            const cartItem = cart.find((item) => item.product.id === product.id);
            const alreadyAdded = Boolean(cartItem);
            const isPinned = pinnedProductIdSet.has(product.id);

            return (
              <TouchableOpacity
                key={product.id}
                onPress={() => onToggleProductInCart(product)}
                activeOpacity={0.7}
                disabled={isOutOfStock}
                style={{
                  borderRadius: RADIUS.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: alreadyAdded ? COLORS.accent : COLORS.border,
                  backgroundColor: alreadyAdded ? '#fff9f5' : COLORS.card,
                  padding: 14,
                  opacity: isOutOfStock ? 0.5 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: FONT.semiBold,
                          color: COLORS.text.primary,
                        }}
                      >
                        {product.name}
                      </Text>
                      {alreadyAdded && (
                        <SmartChip
                          label={`${cartItem?.quantity} in cart`}
                          variant="accent"
                          size="xs"
                        />
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      <Text style={{ fontSize: 14.5, fontFamily: FONT.bold, color: COLORS.navy }}>
                        {formatCurrency(product.selling_price)}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                        /{product.unit}
                      </Text>

                      {product.is_service ? (
                        <SmartChip label="Service" icon="tool" variant="primary" size="xs" />
                      ) : isOutOfStock ? (
                        <SmartChip label="Out of stock" deep variant="danger" size="xs" />
                      ) : isLowStock ? (
                        <SmartChip label={`Low: ${formatCount(stock)} left`} deep variant="warning" size="xs" />
                      ) : (
                        <SmartChip label={`${formatCount(stock)} left`} deep variant="success" size="xs" />
                      )}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation();
                        onTogglePinnedProduct(product.id);
                      }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        borderWidth: 1,
                        borderColor: isPinned ? COLORS.accent : COLORS.border,
                        backgroundColor: isPinned ? COLORS.accentLight : COLORS.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name="star"
                        size={14}
                        color={isPinned ? COLORS.accent : COLORS.text.muted}
                      />
                    </TouchableOpacity>

                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        backgroundColor: alreadyAdded ? COLORS.accent : COLORS.surface2,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name={alreadyAdded ? 'check' : 'plus'}
                        size={16}
                        color={alreadyAdded ? '#000000' : COLORS.text.primary}
                      />
                    </View>
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
