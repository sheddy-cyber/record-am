import { Product } from '@/types';

export const DEBT_SETTLEMENT_NOTE_PREFIX = '[record-am-debt-settlement]';
export const ALT_UNIT_NOTE_PREFIX = '[record-am-unit]';

export function createDebtSettlementNote(debtId: string, notes?: string) {
  return `${DEBT_SETTLEMENT_NOTE_PREFIX}:${debtId}${notes ? ` ${notes}` : ''}`.trim();
}

export function isDebtSettlementSale(notes?: string | null) {
  return notes?.startsWith(DEBT_SETTLEMENT_NOTE_PREFIX) ?? false;
}

export function createAltUnitNote(unitLabel: string) {
  return `${ALT_UNIT_NOTE_PREFIX}:${unitLabel}`;
}

export function readAltUnitNote(notes?: string | null, fallbackUnit?: string) {
  if (!notes?.startsWith(ALT_UNIT_NOTE_PREFIX)) {
    return fallbackUnit ?? '';
  }

  const [, value] = notes.split(':');
  return value?.trim() || fallbackUnit || '';
}

type SaleUnitOption = {
  label: string;
  value: string;
  stockFactor: number;
};

const BUNDLED_UNIT_CONFIG: Record<string, { label: string; childLabel: string; childValue: string; bundleSize?: number }> = {
  dozen: { label: 'Dozen', childLabel: 'Piece', childValue: 'piece', bundleSize: 12 },
  kg: { label: 'Kilogram', childLabel: 'Gram', childValue: 'g', bundleSize: 1000 },
  litre: { label: 'Litre', childLabel: 'Millilitre', childValue: 'ml', bundleSize: 1000 },
  pack: { label: 'Pack', childLabel: 'Unit', childValue: 'piece' },
  carton: { label: 'Carton', childLabel: 'Unit', childValue: 'piece' },
  bag: { label: 'Bag', childLabel: 'Unit', childValue: 'piece' },
};

export function getDefaultBundleSize(product: Product) {
  return BUNDLED_UNIT_CONFIG[product.unit]?.bundleSize;
}

export function usesCustomBundleSize(product: Product) {
  return Boolean(BUNDLED_UNIT_CONFIG[product.unit] && !BUNDLED_UNIT_CONFIG[product.unit].bundleSize);
}

export function getSaleUnitOptions(product: Product, bundleSize?: number) {
  const unitConfig = BUNDLED_UNIT_CONFIG[product.unit];
  const baseOption: SaleUnitOption = {
    label: unitConfig?.label ?? product.unit.charAt(0).toUpperCase() + product.unit.slice(1),
    value: product.unit,
    stockFactor: 1,
  };

  if (!unitConfig) {
    return [baseOption];
  }

  const resolvedBundleSize = unitConfig.bundleSize ?? Math.max(bundleSize ?? 1, 1);

  return [
    baseOption,
    {
      label: unitConfig.childLabel,
      value: unitConfig.childValue,
      stockFactor: 1 / resolvedBundleSize,
    },
  ];
}

export function getSaleUnitOption(product: Product, unit: string, bundleSize?: number) {
  const options = getSaleUnitOptions(product, bundleSize);
  return options.find((option) => option.value === unit) ?? options[0];
}
