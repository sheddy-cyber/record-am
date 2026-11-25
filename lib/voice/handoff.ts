// ============================================================
// RECORD AM - Voice → full form hand-off
// "Edit" on a voice preview opens the matching screen already filled in with
// what was said, so nothing dictated is lost when the user wants to adjust it.
// ============================================================

import { router } from 'expo-router';
import { VoiceAction } from '@/types/voice';
import { buildPurchasePrefillParam } from '@/lib/purchasePrefill';

export interface SalePrefill {
  items: { productId: string; quantity: number; unit?: string; unitPrice?: number; discountAmount?: number }[];
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  amountPaid?: number;
  cashAmount?: number;
  transferAmount?: number;
  notes?: string;
}

export const parseJsonParam = <T,>(raw: string | string[] | undefined): T | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export function openVoiceActionInForm(action: VoiceAction) {
  switch (action.type) {
    case 'RECORD_SALE': {
      const prefill: SalePrefill = {
        items: action.items
          .filter((it) => it.matchedProduct)
          .map((it) => ({
            productId: it.matchedProduct!.id,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            discountAmount: it.discountAmount,
          })),
        customerName: action.customerName,
        customerPhone: action.customerPhone,
        paymentMethod: action.isCredit ? 'cash' : action.paymentMethod,
        amountPaid: action.amountPaid,
        cashAmount: action.cashAmount,
        transferAmount: action.transferAmount,
        notes: action.notes,
      };
      router.push({ pathname: '/(app)/record-sale', params: { voicePrefill: JSON.stringify(prefill) } } as any);
      return;
    }
    case 'RECORD_PURCHASE':
      router.push({
        pathname: '/(app)/record-purchase',
        params: {
          prefill: buildPurchasePrefillParam({
            supplierName: action.supplierName,
            notes: action.notes,
            amountPaid: action.amountPaid,
            items: action.items.map((it) => ({
              productId: it.productId,
              productName: it.name,
              unit: it.unit,
              quantity: it.quantity,
              unitCost: it.unitCost,
            })),
          }),
        },
      } as any);
      return;
    case 'RECORD_STOCK': {
      const first = action.items[0];
      if (first?.matchedProduct) {
        router.push({
          pathname: '/(app)/update-stock',
          params: { productId: first.matchedProduct.id, restock: '1', purchasedQty: String(first.quantity) },
        } as any);
      } else {
        router.push({
          pathname: '/(app)/add-stock',
          params: { prefillName: first?.queryName ?? '', prefillQuantity: String(first?.quantity ?? '') },
        } as any);
      }
      return;
    }
    case 'UPDATE_PRODUCT':
      if (action.productId) {
        router.push({ pathname: '/(app)/update-stock', params: { productId: action.productId } } as any);
      } else {
        router.push('/(app)/(tabs)' as any);
      }
      return;
    case 'RECORD_DAMAGE':
      router.push({
        pathname: '/(app)/record-damage',
        params: { productId: action.productId ?? '', quantity: String(action.quantity), reason: action.reason },
      } as any);
      return;
    case 'RECORD_EXPENSE':
      router.push({
        pathname: '/(app)/record-expense',
        params: { amount: String(action.amount), category: action.category, description: action.description },
      } as any);
      return;
    case 'RECORD_DEBT':
      router.push({
        pathname: '/(app)/record-debt',
        params: {
          customerName: action.customerName,
          customerPhone: action.customerPhone ?? '',
          amount: String(action.amount),
          notes: action.notes ?? '',
          dueDate: action.dueDate ?? '',
        },
      } as any);
      return;
    case 'RECORD_PAYMENT':
      router.push('/(app)/debts' as any);
      return;
    default:
      return;
  }
}
