// ============================================================
// RECORD AM - Stock additions record their purchase
// Adding or restocking goods also records the purchase behind it, in the same
// save, so stock history and purchase history never drift apart. Owners and
// managers can name the supplier and say whether it is paid; a staff restock
// is priced on the server from the saved cost (staff never see costs).
// ============================================================

import { format } from 'date-fns';
import { getAppSettings } from '@/lib/appSettings';
import { enqueueMutations, createLocalId } from '@/lib/offlineStore';
import { canManagePurchases } from '@/lib/permissions';
import { useAuthStore } from '@/store/authStore';
import {
  calculatePurchaseSubtotal,
  createPurchaseCartItemFromProduct,
  newPurchaseLink,
  roundAmount,
  usePurchaseStore,
} from '@/store/purchaseStore';
import { Product } from '@/types';

export interface PurchaseLinkChoice {
  /** Record a purchase for this stock addition (on by default). */
  record: boolean;
  supplierName: string;
  supplierId?: string;
  paidInFull: boolean;
}

export const defaultPurchaseLink = (): PurchaseLinkChoice => ({
  record: true,
  supplierName: '',
  paidInFull: true,
});

export interface StockPurchaseItem {
  product: Product;
  quantity: number;
  /** Cost per unit; defaults to the product's cost price. */
  unitCost?: number;
}

export interface StockPurchaseLink {
  purchaseId: string;
  purchaseNumber: string;
}

/** A problem with the choice that should stop the save, or null. */
export const purchaseLinkProblem = (choice: PurchaseLinkChoice | undefined): string | null => {
  if (!choice?.record) return null;
  if (!canManagePurchases(useAuthStore.getState().userRole)) return null;
  if (!choice.paidInFull && !choice.supplierName.trim()) {
    return 'Add the supplier you owe, or mark the goods as paid in full.';
  }
  return null;
};

/**
 * Records the purchase behind a stock addition and returns its id and number,
 * to be stored on the stock movement. Returns null when nothing is recorded
 * (linking switched off, nothing physical added, or the user opted out).
 * Call it before saving the stock so the purchase is queued first.
 */
export async function recordPurchaseForStock(params: {
  businessId: string;
  branchId: string;
  userId?: string;
  items: StockPurchaseItem[];
  choice?: PurchaseLinkChoice;
  notes?: string;
  purchaseDate?: string;
  /** Use an id and number made earlier (see planPurchaseForStock). */
  link?: StockPurchaseLink;
}): Promise<StockPurchaseLink | null> {
  const choice = params.choice ?? defaultPurchaseLink();
  if (!choice.record) return null;
  if (!(await getAppSettings()).inventoryPurchaseSyncEnabled) return null;

  const items = params.items.filter((item) => !item.product.is_service && roundAmount(item.quantity) > 0);
  if (items.length === 0) return null;

  const problem = purchaseLinkProblem(choice);
  if (problem) throw new Error(problem);

  const link = params.link ?? newPurchaseLink();
  const purchaseDate = params.purchaseDate ?? format(new Date(), 'yyyy-MM-dd');

  if (canManagePurchases(useAuthStore.getState().userRole)) {
    const cart = items.map((item) =>
      createPurchaseCartItemFromProduct(item.product, {
        quantity: roundAmount(item.quantity),
        unit_cost: roundAmount(Math.max(0, item.unitCost ?? Number(item.product.cost_price ?? 0))),
      }),
    );
    const total = calculatePurchaseSubtotal(cart);
    const purchase = await usePurchaseStore.getState().recordPurchase({
      businessId: params.businessId,
      branchId: params.branchId,
      userId: params.userId ?? useAuthStore.getState().user?.id ?? '',
      supplierId: choice.supplierId,
      supplierName: choice.supplierName,
      items: cart,
      amountPaid: choice.paidInFull ? total : 0,
      discountAmount: 0,
      notes: params.notes,
      purchaseDate,
      newPurchaseId: link.purchaseId,
      purchaseNumber: link.purchaseNumber,
      // The stock screen saves the stock and the cost itself.
      stock: 'skip',
      updateCost: false,
    });
    if (!purchase) {
      throw new Error(usePurchaseStore.getState().error ?? 'Could not record the purchase for this stock.');
    }
    return link;
  }

  // Staff: the server records it at the saved cost price.
  await enqueueMutations([
    {
      operation: 'rpc',
      rpc: 'record_staff_restock_purchase',
      payload: {
        p_purchase_id: link.purchaseId,
        p_business_id: params.businessId,
        p_branch_id: params.branchId,
        p_purchase_number: link.purchaseNumber,
        p_items: items.map((item) => ({
          id: createLocalId(),
          product_id: item.product.id,
          quantity: roundAmount(item.quantity),
        })),
        p_purchase_date: purchaseDate,
        p_notes: params.notes ?? null,
      },
      description: `Purchase for restock ${link.purchaseNumber}`,
    },
  ]);
  return link;
}

/**
 * For batches (spreadsheet import): an id and number to put on each stock
 * movement now, recorded as one purchase at the end. Null when no purchase
 * will be recorded.
 */
export async function planPurchaseForStock(choice?: PurchaseLinkChoice): Promise<StockPurchaseLink | null> {
  if (!(choice ?? defaultPurchaseLink()).record) return null;
  if (!(await getAppSettings()).inventoryPurchaseSyncEnabled) return null;
  return newPurchaseLink();
}

/** Fields to put on the stock movement so it points at its purchase. */
export const linkFields = (link: StockPurchaseLink | null) =>
  link ? { purchase_id: link.purchaseId, reference: link.purchaseNumber } : {};
