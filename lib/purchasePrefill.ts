export interface PurchasePrefillItem {
  productId?: string;
  productName?: string;
  unit?: string;
  quantity?: number;
  unitCost?: number;
}

export interface PurchasePrefillPayload {
  supplierId?: string;
  supplierName?: string;
  purchaseDate?: string;
  notes?: string;
  discountAmount?: number;
  amountPaid?: number;
  items?: PurchasePrefillItem[];
}

export const buildPurchasePrefillParam = (payload: PurchasePrefillPayload) =>
  JSON.stringify(payload);

export const parsePurchasePrefillPayload = (rawValue: string | string[] | undefined) => {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (!value) return null;

  try {
    return JSON.parse(value) as PurchasePrefillPayload;
  } catch {
    return null;
  }
};
