import React from 'react';
import { InputField, SelectField, Toggle } from '@/components/forms';
import { CURRENCY_SYMBOL, PRODUCT_UNITS } from '@/constants';

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
        value={productUnit}
        options={PRODUCT_UNITS}
        onChange={onProductUnitChange}
        required
      />
      <InputField
        label="Cost Price"
        value={costPrice}
        onChangeText={onCostPriceChange}
        placeholder="0"
        keyboardType="numeric"
        prefix={CURRENCY_SYMBOL}
      />
      <InputField
        label="Selling Price"
        value={sellingPrice}
        onChangeText={onSellingPriceChange}
        placeholder="0"
        keyboardType="numeric"
        prefix={CURRENCY_SYMBOL}
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
