import React from 'react';
import { View } from 'react-native';
import { InputField, SelectField, Toggle } from '@/components/forms';
import { Card, RoleGate, SectionHeader } from '@/components/ui';
import { CategoryPicker } from '@/components/inventory/CategoryPicker';
import { CURRENCY_SYMBOL, PRODUCT_UNITS } from '@/constants';
import { Category } from '@/types';

const CUSTOM_UNIT_VALUE = '__custom_unit__';
const UNIT_OPTIONS = [
  ...PRODUCT_UNITS,
  { value: CUSTOM_UNIT_VALUE, label: 'Custom unit' },
];

type ProductFormFieldsProps = {
  productName: string;
  onProductNameChange: (value: string) => void;
  productUnit: string;
  onProductUnitChange: (value: string) => void;
  categoryId?: string | null;
  onCategoryIdChange?: (value: string | null, category?: Category) => void;
  costPrice: string;
  onCostPriceChange: (value: string) => void;
  costPriceExtra?: React.ReactNode;
  costPriceLabel?: string;
  sellingPrice: string;
  onSellingPriceChange: (value: string) => void;
  sellingPriceExtra?: React.ReactNode;
  reorderLevel: string;
  onReorderLevelChange: (value: string) => void;
  stockQuantity: string;
  onStockQuantityChange: (value: string) => void;
  stockQuantityLabel: string;
  stockQuantityHint: string;
  stockQuantityExtra?: React.ReactNode;
  stockQuantityFirst?: boolean;
  isService: boolean;
  onIsServiceChange: (value: boolean) => void;
};

export function ProductFormFields({
  productName,
  onProductNameChange,
  productUnit,
  onProductUnitChange,
  categoryId,
  onCategoryIdChange,
  costPrice,
  onCostPriceChange,
  costPriceExtra,
  costPriceLabel,
  sellingPrice,
  onSellingPriceChange,
  sellingPriceExtra,
  reorderLevel,
  onReorderLevelChange,
  stockQuantity,
  onStockQuantityChange,
  stockQuantityLabel,
  stockQuantityHint,
  stockQuantityExtra,
  stockQuantityFirst = false,
  isService,
  onIsServiceChange,
}: ProductFormFieldsProps) {
  const hasPresetUnit = PRODUCT_UNITS.some((unit) => unit.value === productUnit);
  const selectedUnit = hasPresetUnit ? productUnit : CUSTOM_UNIT_VALUE;
  const cleanUnit = productUnit.trim() || 'unit';
  const effectiveCostPriceLabel = costPriceLabel ?? `Cost Price per ${cleanUnit}`;

  const stockFields = !isService ? (
    <View style={{ gap: 14 }}>
      <SectionHeader title={stockQuantityFirst ? 'Restock Quantity' : 'Stock Levels'} />
      <Card style={{ gap: 14 }}>
        <InputField
          label={stockQuantityLabel}
          value={stockQuantity}
          onChangeText={onStockQuantityChange}
          placeholder="0"
          keyboardType="numeric"
          hint={stockQuantityHint}
          containerStyle={{ marginBottom: 0 }}
        />
        {stockQuantityExtra}
        {!stockQuantityFirst ? (
          <InputField
            label="Reorder Alert Level"
            value={reorderLevel}
            onChangeText={onReorderLevelChange}
            placeholder="5"
            keyboardType="numeric"
            hint="You'll receive a low-stock alert when quantity reaches this number."
            containerStyle={{ marginBottom: 0 }}
          />
        ) : null}
      </Card>
    </View>
  ) : null;

  return (
    <View style={{ gap: 20, marginBottom: 20 }}>
      {stockQuantityFirst ? stockFields : null}

      <View style={{ gap: 14 }}>
        <SectionHeader title="Basic Details" />
        <Card style={{ gap: 14 }}>
          <InputField
            label="Product or Service Name"
            value={productName}
            onChangeText={onProductNameChange}
            placeholder="e.g. Indomie Noodles, Haircut"
            required
            containerStyle={{ marginBottom: 0 }}
          />
          <SelectField
            label="Unit of Measurement"
            value={selectedUnit}
            options={UNIT_OPTIONS}
            onChange={(value) => {
              onProductUnitChange(value === CUSTOM_UNIT_VALUE ? '' : value);
            }}
            required
            containerStyle={{ marginBottom: 0 }}
          />
          {selectedUnit === CUSTOM_UNIT_VALUE ? (
            <InputField
              label="Custom Unit Name"
              value={productUnit}
              onChangeText={onProductUnitChange}
              placeholder="e.g. crate, bundle, plate"
              hint="This unit will be saved with the product."
              required
              containerStyle={{ marginBottom: 0 }}
            />
          ) : null}

          <CategoryPicker
            categoryId={categoryId}
            onSelectCategory={onCategoryIdChange}
            containerStyle={{ marginBottom: 0 }}
          />

          <Toggle
            label="This is a service"
            description="Services are listed in sales but do not require inventory tracking."
            value={isService}
            onChange={onIsServiceChange}
          />
        </Card>
      </View>

      <View style={{ gap: 14 }}>
        <SectionHeader title="Pricing" />
        <Card style={{ gap: 14 }}>
          <RoleGate allowedRoles={['owner', 'manager']}>
            <InputField
              label={effectiveCostPriceLabel}
              value={costPrice}
              onChangeText={onCostPriceChange}
              placeholder="0"
              keyboardType="numeric"
              prefix={CURRENCY_SYMBOL}
              isAmount={true}
              containerStyle={{ marginBottom: 0 }}
            />
            {costPriceExtra}
          </RoleGate>
          <InputField
            label={`Selling Price per ${cleanUnit}`}
            value={sellingPrice}
            onChangeText={onSellingPriceChange}
            placeholder="0"
            keyboardType="numeric"
            prefix={CURRENCY_SYMBOL}
            isAmount={true}
            required
            containerStyle={{ marginBottom: 0 }}
          />
          {sellingPriceExtra}
        </Card>
      </View>

      {!stockQuantityFirst ? stockFields : null}
    </View>
  );
}
