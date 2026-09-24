import { Product } from '@/types';

export const DEBT_SETTLEMENT_NOTE_PREFIX = '[record-am-debt-settlement]';
export const ALT_UNIT_NOTE_PREFIX = '[record-am-unit]';
export const MIXED_PAYMENT_NOTE_PREFIX = '[record-am-mixed]';

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

export const BANK_NAME_NOTE_PREFIX = '[record-am-bank]';

export function formatMixedPaymentNote(cashAmount: number, transferAmount: number, notes?: string) {
  const meta = `${MIXED_PAYMENT_NOTE_PREFIX}:cash=${cashAmount},transfer=${transferAmount}`;
  const cleanOriginal = cleanSaleNotes(notes);
  return cleanOriginal ? `${meta} ${cleanOriginal}` : meta;
}

export function readMixedPaymentNote(notes?: string | null): {
  cashAmount?: number;
  transferAmount?: number;
  cleanNotes?: string;
} {
  if (!notes) return {};
  const match = notes.match(/\[record-am-mixed\]:cash=([0-9.]+),transfer=([0-9.]+)/);
  if (!match) return { cleanNotes: cleanSaleNotes(notes) };

  const cashAmount = parseFloat(match[1]);
  const transferAmount = parseFloat(match[2]);
  const cleanNotes = cleanSaleNotes(notes);

  return {
    cashAmount: Number.isFinite(cashAmount) ? cashAmount : undefined,
    transferAmount: Number.isFinite(transferAmount) ? transferAmount : undefined,
    cleanNotes,
  };
}

export function formatBankPaymentNote(bankName?: string, paymentAccountId?: string, notes?: string) {
  if (!bankName?.trim()) return notes ? cleanSaleNotes(notes) : undefined;
  const meta = `${BANK_NAME_NOTE_PREFIX}:name=${encodeURIComponent(bankName.trim())}${paymentAccountId ? `,id=${paymentAccountId}` : ''}`;
  const cleanOriginal = cleanSaleNotes(notes);
  return cleanOriginal ? `${meta} ${cleanOriginal}` : meta;
}

export function readBankPaymentNote(notes?: string | null): {
  bankName?: string;
  paymentAccountId?: string;
  cleanNotes?: string;
} {
  if (!notes) return {};
  const match = notes.match(/\[record-am-bank\]:name=([^,\s]+)(?:,id=([^\s]+))?/);
  if (!match) return { cleanNotes: cleanSaleNotes(notes) };

  let bankName: string | undefined = undefined;
  try {
    bankName = decodeURIComponent(match[1]);
  } catch {
    bankName = match[1];
  }

  return {
    bankName,
    paymentAccountId: match[2],
    cleanNotes: cleanSaleNotes(notes),
  };
}

export function cleanSaleNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes
    .replace(/\[record-am-mixed\]:cash=[0-9.]+,transfer=[0-9.]+\s*/g, '')
    .replace(/\[record-am-bank\]:[^\s]+\s*/g, '')
    .replace(/\[record-am-debt-settlement\]:[^\s]+\s*/g, '')
    .replace(/\[record-am-unit\]:[^\s]+\s*/g, '')
    .trim();
}

export function getPaymentBreakdown(item: {
  payment_method?: string | null;
  amount_paid?: number | null;
  amount?: number | null;
  cash_amount?: number | null;
  transfer_amount?: number | null;
  notes?: string | null;
}): { cash: number; transfer: number; other: number } {
  const method = item.payment_method ?? 'cash';
  const total = Number(item.amount_paid ?? item.amount ?? 0);

  if (method === 'cash') {
    return { cash: total, transfer: 0, other: 0 };
  }
  if (method === 'transfer') {
    return { cash: 0, transfer: total, other: 0 };
  }
  if (method === 'mixed') {
    let cash = item.cash_amount != null ? Number(item.cash_amount) : undefined;
    let transfer = item.transfer_amount != null ? Number(item.transfer_amount) : undefined;

    if (cash === undefined || transfer === undefined) {
      const fromNote = readMixedPaymentNote(item.notes);
      if (cash === undefined && fromNote.cashAmount !== undefined) {
        cash = fromNote.cashAmount;
      }
      if (transfer === undefined && fromNote.transferAmount !== undefined) {
        transfer = fromNote.transferAmount;
      }
    }

    const resolvedCash = cash ?? (transfer != null ? Math.max(0, total - transfer) : total);
    const resolvedTransfer = transfer ?? Math.max(0, total - resolvedCash);

    return {
      cash: resolvedCash,
      transfer: resolvedTransfer,
      other: 0,
    };
  }

  // pos, mobile_money, etc.
  return { cash: 0, transfer: 0, other: total };
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
