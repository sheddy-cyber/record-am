// ============================================================
// RECORD AM - Voice Command Action Executor
// ============================================================

import {
  CartItem,
  PaymentMethod,
  PaymentStatus,
  Product,
} from '@/types';
import {
  VoiceAction,
  VoiceDamageAction,
  VoiceDebtAction,
  VoiceExpenseAction,
  VoicePaymentAction,
  VoicePurchaseAction,
  VoiceSaleAction,
  VoiceStockAction,
  VoiceUpdateProductAction,
} from '@/types/voice';
import {
  recordDebtOffline,
  recordExpenseOffline,
  recordInventorySnapshotOffline,
  recordSaleOffline,
} from '@/lib/offlineRecords';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useCustomerStore } from '@/store/customerStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDebtStore } from '@/store/debtStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { speakVoiceFeedback } from './audioService';
import { CURRENCY_SYMBOL } from '@/constants';
import { getSaleUnitOption } from '@/lib/records';

const roundAmount = (val: number) => Number(val.toFixed(2));

export interface ExecutionResult {
  success: boolean;
  message: string;
  spokenSummary: string;
}

const fmtCurrency = (val: number) =>
  `${CURRENCY_SYMBOL}${Number(val || 0).toLocaleString('en-NG', {
    maximumFractionDigits: 0,
  })}`;

/**
 * Executes a confirmed voice command against Record Am offline-first stores.
 */
export async function executeVoiceAction(
  action: VoiceAction,
  enableTts = true,
): Promise<ExecutionResult> {
  const { currentBusiness, currentBranch, user, profile } = useAuthStore.getState();

  if (!currentBusiness || !currentBranch) {
    throw new Error('No active business or branch selected.');
  }

  const businessId = currentBusiness.id;
  const branchId = currentBranch.id;
  const userId = user?.id || 'offline-user';
  const soldByName = profile?.full_name || user?.user_metadata?.full_name || 'Staff';

  switch (action.type) {
    case 'RECORD_SALE': {
      return executeSaleAction(action, {
        businessId,
        branchId,
        userId,
        soldByName,
        enableTts,
      });
    }

    case 'UPDATE_PRODUCT': {
      return executeUpdateProductAction(action, {
        businessId,
        branchId,
        enableTts,
      });
    }

    case 'RECORD_DAMAGE': {
      return executeDamageAction(action, {
        businessId,
        branchId,
        userId,
        enableTts,
      });
    }

    case 'RECORD_PURCHASE': {
      return executePurchaseAction(action, {
        businessId,
        branchId,
        userId,
        enableTts,
      });
    }

    case 'RECORD_PAYMENT': {
      return executePaymentAction(action, {
        businessId,
        branchId,
        userId,
        enableTts,
      });
    }

    case 'RECORD_EXPENSE': {
      return executeExpenseAction(action, {
        businessId,
        branchId,
        userId,
        enableTts,
      });
    }

    case 'RECORD_DEBT': {
      return executeDebtAction(action, {
        businessId,
        branchId,
        enableTts,
      });
    }

    case 'RECORD_STOCK': {
      return executeStockAction(action, {
        businessId,
        branchId,
        enableTts,
      });
    }

    default:
      throw new Error('Unsupported command type.');
  }
}

/**
 * 1. Executes RECORD_SALE (with Discount, Custom Unit Prices, Customer & Partial/Debt Support)
 */
async function executeSaleAction(
  action: VoiceSaleAction,
  ctx: {
    businessId: string;
    branchId: string;
    userId: string;
    soldByName: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const cart: CartItem[] = action.items.map((it) => {
    const product = it.matchedProduct;

    if (!product) {
      throw new Error(`Product "${it.queryName}" is not in your inventory.`);
    }

    const unitOption = getSaleUnitOption(product, it.unit || product.unit);
    const stockToDeduct = it.stockToDeduct ?? roundAmount(it.quantity * (unitOption.stockFactor || 1));

    return {
      product,
      quantity: it.quantity,
      stock_quantity: stockToDeduct,
      sale_unit: it.unit || product.unit || 'piece',
      unit_price: it.unitPrice,
      discount_amount: it.discountAmount || 0,
      total_price: Math.max(0, it.unitPrice * it.quantity - (it.discountAmount || 0)),
    };
  });

  const total = action.total;
  const isCredit = Boolean(action.isCredit);
  const amountPaid = action.amountPaid;
  const amountOwed = action.amountOwed;
  const paymentStatus: PaymentStatus = amountOwed > 0 ? (amountPaid > 0 ? 'partial' : 'credit') : 'paid';

  // Calculate profit
  const totalCost = action.items.reduce(
    (sum, it) => sum + (it.costPrice || 0) * it.quantity,
    0,
  );
  const profit = Math.max(0, total - totalCost);

  // Optimistic dashboard increment
  if (amountPaid > 0 || amountOwed > 0) {
    useDashboardStore
      .getState()
      .incrementTodaySales(amountPaid, amountOwed, profit > 0 ? profit : 0);
  }

  await recordSaleOffline({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    soldByName: ctx.soldByName,
    cart,
    customerName: action.customerName || '',
    customerPhone: action.customerPhone || '',
    paymentMethod: action.paymentMethod,
    cashAmount:
      action.paymentMethod === 'mixed'
        ? (action.cashAmount ?? 0)
        : action.paymentMethod === 'cash'
        ? amountPaid
        : 0,
    transferAmount:
      action.paymentMethod === 'mixed'
        ? (action.transferAmount ?? 0)
        : action.paymentMethod === 'transfer'
        ? amountPaid
        : 0,
    notes: action.notes,
    subtotal: action.subtotal,
    discountAmount: action.discountAmount,
    totalAmount: total,
    amountPaid,
    amountOwed,
    paymentStatus,
  });

  // Refresh dashboard store to reflect sales and profit
  await useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId);

  const itemCount = action.items.reduce((acc, i) => acc + i.quantity, 0);
  const discNote = action.discountAmount > 0 ? ` with ${fmtCurrency(action.discountAmount)} discount` : '';
  const splitNote =
    action.paymentMethod === 'mixed' && (action.cashAmount !== undefined || action.transferAmount !== undefined)
      ? ` (${fmtCurrency(action.cashAmount ?? 0)} cash, ${fmtCurrency(action.transferAmount ?? 0)} transfer)`
      : '';
  const spoken = `Recorded sale of ${itemCount} items for ${fmtCurrency(total)}${discNote}${splitNote}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Sale of ${fmtCurrency(total)}${discNote} recorded successfully!`,
    spokenSummary: spoken,
  };
}

/**
 * 2. Executes UPDATE_PRODUCT (Selling price, Cost price, Restock, Physical count correction)
 */
async function executeUpdateProductAction(
  action: VoiceUpdateProductAction,
  ctx: {
    businessId: string;
    branchId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const businessStore = useBusinessStore.getState();
  const product =
    action.matchedProduct || businessStore.products.find((p) => p.id === action.productId);

  if (!product) {
    throw new Error(`Product "${action.productName}" not found in inventory.`);
  }

  const productPatch: Partial<Product> = {};
  if (action.newSellingPrice !== undefined && action.newSellingPrice > 0) {
    productPatch.selling_price = roundAmount(action.newSellingPrice);
  }

  let effectiveCost =
    action.newCostPrice !== undefined && action.newCostPrice > 0
      ? roundAmount(action.newCostPrice)
      : undefined;

  const currentStock =
    product.inventory?.find((inv) => inv.branch_id === ctx.branchId)?.quantity ?? 0;

  if (
    effectiveCost !== undefined &&
    action.quantityChange &&
    action.quantityChange > 0 &&
    action.costingMethod === 'average'
  ) {
    const { calculateWeightedAverageCost } = await import('@/lib/costing');
    effectiveCost = calculateWeightedAverageCost({
      currentStock,
      currentCostPrice: Number(product.cost_price ?? 0),
      addedQuantity: action.quantityChange,
      newUnitCost: effectiveCost,
    });
  }

  if (effectiveCost !== undefined) {
    productPatch.cost_price = effectiveCost;
  }

  let nextQuantity: number | undefined;
  let movement: any;

  if (action.targetQuantity !== undefined) {
    nextQuantity = Math.max(0, roundAmount(action.targetQuantity));
    const delta = nextQuantity - currentStock;
    movement = {
      type: 'reconciliation',
      quantity: Math.abs(delta),
      unit_cost: productPatch.cost_price ?? product.cost_price,
      total_cost: Math.abs(delta) * Number(productPatch.cost_price ?? product.cost_price ?? 0),
      notes: action.notes || `Stock count adjusted from ${currentStock} to ${nextQuantity} via voice`,
    };
  } else if (action.quantityChange) {
    nextQuantity = Math.max(0, roundAmount(currentStock + action.quantityChange));
    const mType =
      action.reconciliationMethod === 'damage'
        ? 'damage'
        : action.reconciliationMethod === 'internal_use'
        ? 'internal_use'
        : action.reconciliationMethod === 'return'
        ? 'return'
        : action.quantityChange > 0
        ? 'stock_in'
        : 'stock_out';

    movement = {
      type: mType,
      quantity: Math.abs(action.quantityChange),
      unit_cost: productPatch.cost_price ?? product.cost_price,
      total_cost:
        Math.abs(action.quantityChange) *
        Number(productPatch.cost_price ?? product.cost_price ?? 0),
      notes: action.notes || `Stock updated via voice (${action.reconciliationMethod})`,
    };
  }

  const { updateProductAndInventoryOffline } = await import('@/lib/offlineRecords');
  await updateProductAndInventoryOffline({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    product,
    productPatch,
    nextQuantity,
    movement,
  });

  await Promise.all([
    businessStore.fetchProducts(ctx.businessId),
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useAnalyticsStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
  ]);

  const changes: string[] = [];
  if (productPatch.selling_price !== undefined) {
    changes.push(`selling price to ${fmtCurrency(productPatch.selling_price)}`);
  }
  if (productPatch.cost_price !== undefined) {
    changes.push(`cost price to ${fmtCurrency(productPatch.cost_price)}`);
  }
  if (nextQuantity !== undefined) {
    changes.push(`stock to ${nextQuantity} ${product.unit}`);
  }

  const spoken = `Updated ${product.name}: ${changes.join(', ')}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `${product.name} updated: ${changes.join(', ')}!`,
    spokenSummary: spoken,
  };
}

/**
 * 3. Executes RECORD_DAMAGE (Damaged goods with profit write-off)
 */
async function executeDamageAction(
  action: VoiceDamageAction,
  ctx: {
    businessId: string;
    branchId: string;
    userId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const businessStore = useBusinessStore.getState();
  const product =
    action.matchedProduct || businessStore.products.find((p) => p.id === action.productId);

  if (!product) {
    throw new Error(`Product "${action.productName}" not found in inventory.`);
  }

  const { recordDamagedStockOffline } = await import('@/lib/offlineRecords');
  await recordDamagedStockOffline({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    product,
    quantity: action.quantity,
    unitCost: action.unitCost,
    reason: action.reason,
    deductFromProfit: action.deductFromProfit,
    notes: action.notes,
  });

  await Promise.all([
    businessStore.fetchProducts(ctx.businessId),
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useAnalyticsStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
  ]);

  const spoken = `Recorded ${action.quantity} damaged ${action.unit} of ${product.name}. ${
    action.deductFromProfit ? `Loss of ${fmtCurrency(action.totalLoss)} written off.` : ''
  }`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Recorded ${action.quantity} damaged ${action.unit} for ${product.name} (${fmtCurrency(
      action.totalLoss,
    )} loss)!`,
    spokenSummary: spoken,
  };
}

/**
 * 4. Executes RECORD_PURCHASE (Restock from supplier with debt tracking)
 */
async function executePurchaseAction(
  action: VoicePurchaseAction,
  ctx: {
    businessId: string;
    branchId: string;
    userId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const { usePurchaseStore } = await import('@/store/purchaseStore');

  await usePurchaseStore.getState().recordPurchase({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    supplierName: action.supplierName || 'Direct Supplier',
    items: action.items.map((it) => ({
      key: `purchase-item-${it.productId || it.name}`,
      product: it.matchedProduct,
      productDraft: !it.matchedProduct
        ? {
            name: it.name,
            unit: it.unit || 'piece',
            selling_price: roundAmount(it.unitCost * 1.25),
          }
        : undefined,
      quantity: it.quantity,
      unit_cost: it.unitCost,
      total_cost: it.totalCost,
    })),
    amountPaid: action.amountPaid,
    discountAmount: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: action.notes,
  });

  await Promise.all([
    useBusinessStore.getState().fetchProducts(ctx.businessId),
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useAnalyticsStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
  ]);

  const spoken = `Recorded purchase from ${action.supplierName || 'supplier'} for ${fmtCurrency(
    action.totalAmount,
  )}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Purchase from ${action.supplierName || 'supplier'} (${fmtCurrency(
      action.totalAmount,
    )}) recorded!`,
    spokenSummary: spoken,
  };
}

/**
 * 5. Executes RECORD_PAYMENT (Customer debt repayment)
 */
async function executePaymentAction(
  action: VoicePaymentAction,
  ctx: {
    businessId: string;
    branchId: string;
    userId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const debtStore = useDebtStore.getState();
  const openDebts = debtStore.debts.filter((d) => d.status !== 'settled');

  const customerDebt = openDebts.find(
    (d) =>
      (action.matchedCustomer && d.customer_id === action.matchedCustomer.id) ||
      d.customer_name.toLowerCase().includes(action.customerName.toLowerCase()) ||
      action.customerName.toLowerCase().includes(d.customer_name.toLowerCase()),
  );

  if (customerDebt) {
    const { recordRepaymentOffline } = await import('@/lib/offlineRecords');
    await recordRepaymentOffline({
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      userId: ctx.userId,
      debt: customerDebt,
      amount: action.amount,
      paymentMethod: action.paymentMethod,
      notes: action.notes || 'Recorded via Voice Assistant',
    });
  } else {
    useDashboardStore.getState().applyRepaymentToTodaySales(action.amount);
  }

  await Promise.all([
    useDebtStore.getState().hydrateCache(ctx.businessId, ctx.branchId),
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useAnalyticsStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
  ]);

  const spoken = `Recorded payment of ${fmtCurrency(action.amount)} from ${action.customerName}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Payment of ${fmtCurrency(action.amount)} from ${action.customerName} recorded!`,
    spokenSummary: spoken,
  };
}

/**
 * 6. Executes RECORD_EXPENSE
 */
async function executeExpenseAction(
  action: VoiceExpenseAction,
  ctx: {
    businessId: string;
    branchId: string;
    userId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  await recordExpenseOffline({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    category: action.category,
    description: action.description,
    amount: action.amount,
    paymentMethod: action.paymentMethod,
    expenseDate: action.expenseDate || new Date().toISOString().split('T')[0],
  });

  await Promise.all([
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useAnalyticsStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
  ]);

  const spoken = `Recorded expense of ${fmtCurrency(action.amount)} for ${action.description}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Expense of ${fmtCurrency(action.amount)} recorded!`,
    spokenSummary: spoken,
  };
}

/**
 * 7. Executes RECORD_DEBT
 */
async function executeDebtAction(
  action: VoiceDebtAction,
  ctx: {
    businessId: string;
    branchId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  if (action.amount > 0) {
    useDashboardStore.getState().incrementTodaySales(0, action.amount);
  }

  await recordDebtOffline({
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    customerName: action.customerName,
    customerPhone: action.customerPhone,
    amount: action.amount,
    dueDate: action.dueDate,
    notes: action.notes,
  });

  await Promise.all([
    useDashboardStore.getState().refreshFromCache(ctx.businessId, ctx.branchId),
    useDebtStore.getState().hydrateCache(ctx.businessId, ctx.branchId),
  ]);

  void useDebtStore.getState().fetchDebts(ctx.businessId, ctx.branchId);
  void useCustomerStore.getState().fetchCustomers(ctx.businessId);

  const spoken = `Recorded debt of ${fmtCurrency(action.amount)} for ${action.customerName}.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Debt for ${action.customerName} (${fmtCurrency(action.amount)}) recorded!`,
    spokenSummary: spoken,
  };
}

/**
 * 8. Executes RECORD_STOCK
 */
async function executeStockAction(
  action: VoiceStockAction,
  ctx: {
    businessId: string;
    branchId: string;
    enableTts: boolean;
  },
): Promise<ExecutionResult> {
  const businessStore = useBusinessStore.getState();

  for (const item of action.items) {
    let product: Product | undefined = item.matchedProduct;

    if (!product) {
      const cleanName = item.queryName.replace(/^of\s+/i, '').trim();
      const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

      const created = await businessStore.createProduct({
        business_id: ctx.businessId,
        name: capitalized,
        unit: item.unit || 'piece',
        cost_price: item.costPrice || 0,
        selling_price: item.sellingPrice || (item.costPrice ? item.costPrice * 1.2 : 0),
        reorder_level: 5,
        is_service: false,
      });

      if (!created) continue;
      product = created;

      await recordInventorySnapshotOffline({
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        productId: product.id,
        quantity: item.quantity,
        movement: {
          type: 'stock_in',
          quantity: item.quantity,
          unit_cost: item.costPrice,
          total_cost: item.costPrice ? item.costPrice * item.quantity : undefined,
          notes: action.notes || 'Initial stock via voice',
        },
      });
    } else {
      if (
        (item.costPrice !== undefined && item.costPrice !== product.cost_price) ||
        (item.sellingPrice !== undefined && item.sellingPrice !== product.selling_price)
      ) {
        await businessStore.updateProduct(product.id, {
          cost_price: item.costPrice ?? product.cost_price,
          selling_price: item.sellingPrice ?? product.selling_price,
        });
      }

      const currentQty =
        product.inventory?.find((inv) => inv.branch_id === ctx.branchId)?.quantity ?? 0;
      const nextQty = currentQty + item.quantity;

      await recordInventorySnapshotOffline({
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        productId: product.id,
        quantity: nextQty,
        movement: {
          type: 'stock_in',
          quantity: item.quantity,
          unit_cost: item.costPrice || product.cost_price,
          total_cost: (item.costPrice || product.cost_price) * item.quantity,
          notes: action.notes || 'Restocked via voice',
        },
      });
    }
  }

  await businessStore.fetchProducts(ctx.businessId);

  const totalQty = action.items.reduce((s, it) => s + it.quantity, 0);
  const spoken = `Added stock: ${totalQty} items updated.`;
  await speakVoiceFeedback(spoken, ctx.enableTts);

  return {
    success: true,
    message: `Stock updated successfully (${totalQty} items added)!`,
    spokenSummary: spoken,
  };
}
