import React from 'react';
import { InputField, SelectField, Toggle } from '@/components/forms';
import { RoleGate } from '@/components/ui';
import { CURRENCY_SYMBOL, PRODUCT_UNITS } from '@/constants';

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
  costPrice: string;
  onCostPriceChange: (value: string) => void;
  sellingPrice: string;
  onSellingPriceChange: (value: string) => void;
  reorderLevel: string;
  onReorderLevelChange: (value: string) => void;
  stockQuantity: string;
  onStockQuantityChange: (value: string) => void;
  stockQuantityLabel: string;
  stockQuantityHint: string;
  isService: boolean;
  onIsServiceChange: (value: boolean) => void;
};

export function ProductFormFields({
  productName,
  onProductNameChange,
  productUnit,
  onProductUnitChange,
  costPrice,
  onCostPriceChange,
  sellingPrice,
  onSellingPriceChange,
  reorderLevel,
  onReorderLevelChange,
  stockQuantity,
  onStockQuantityChange,
  stockQuantityLabel,
  stockQuantityHint,
  isService,
  onIsServiceChange,
}: ProductFormFieldsProps) {
  const hasPresetUnit = PRODUCT_UNITS.some((unit) => unit.value === productUnit);
  const selectedUnit = hasPresetUnit ? productUnit : CUSTOM_UNIT_VALUE;

  return (
    <>
      <InputField
        label="Product or Service Name"
        value={productName}
        onChangeText={onProductNameChange}
        placeholder="e.g. Indomie Noodles, Haircut"
        required
      />
      <SelectField
        label="Unit of Measurement"
        value={selectedUnit}
        options={UNIT_OPTIONS}
        onChange={(value) => {
          onProductUnitChange(value === CUSTOM_UNIT_VALUE ? '' : value);
        }}
        required
      />
      {selectedUnit === CUSTOM_UNIT_VALUE ? (
        <InputField
          label="Custom Unit"
          value={productUnit}
          onChangeText={onProductUnitChange}
          placeholder="e.g. crate, bundle, plate"
          hint="This unit will be saved with the product."
          required
        />
      ) : null}
      <RoleGate allowedRoles={['owner', 'manager']}>
        <InputField
          label="Cost Price"
          value={costPrice}
          onChangeText={onCostPriceChange}
          placeholder="0"
          keyboardType="numeric"
          prefix={CURRENCY_SYMBOL}
          isAmount={true}
        />
      </RoleGate>
      <InputField
        label="Selling Price"
        value={sellingPrice}
        onChangeText={onSellingPriceChange}
        placeholder="0"
        keyboardType="numeric"
        prefix={CURRENCY_SYMBOL}
        isAmount={true}
        required
      />
      {!isService ? (
        <>
          <InputField
            label="Reorder Level"
            value={reorderLevel}
            onChangeText={onReorderLevelChange}
            placeholder="5"
            keyboardType="numeric"
            hint="You will get low-stock warnings below this level."
          />
          <InputField
            label={stockQuantityLabel}
            value={stockQuantity}
            onChangeText={onStockQuantityChange}
            placeholder="0"
            keyboardType="numeric"
            hint={stockQuantityHint}
          />
        </>
      ) : null}
      <Toggle
        label="This is a service"
        description="Services are listed in sales but do not affect stock quantity."
        value={isService}
        onChange={onIsServiceChange}
      />
    </>
  );
}
