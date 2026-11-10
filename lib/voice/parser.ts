// ============================================================
// RECORD AM - Voice Command NLU Parser
// ============================================================

import { Customer, PaymentMethod, Product } from '@/types';
import {
  ReconciliationMethod,
  VoiceAction,
  VoiceDamageAction,
  VoiceDebtAction,
  VoiceExpenseAction,
  VoicePaymentAction,
  VoicePurchaseAction,
  VoicePurchaseItem,
  VoiceSaleAction,
  VoiceSaleItem,
  VoiceStockAction,
  VoiceUnknownAction,
  VoiceUpdateProductAction,
} from '@/types/voice';
import {
  matchCustomer,
  matchExpenseCategory,
  matchProduct,
  normalizeUnit,
} from './fuzzyMatcher';
import { getSaleUnitOption } from '@/lib/records';

/**
 * Normalizes number phrases like "2k" -> 2000, "two" -> 2, "15,000" -> 15000
 */
export function parseSpokenNumber(input: string | number): number {
  if (typeof input === 'number') return input;
  if (!input) return 0;

  let text = input.trim().toLowerCase().replace(/,/g, '');

  // Handle "k" suffix (e.g. 5k, 12.5k)
  if (text.endsWith('k')) {
    const val = parseFloat(text.slice(0, -1));
    return isNaN(val) ? 0 : val * 1000;
  }

  // Handle "m" / "million" suffix
  if (text.endsWith('m')) {
    const val = parseFloat(text.slice(0, -1));
    return isNaN(val) ? 0 : val * 1000000;
  }

  const wordMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    dozen: 12,
    hundred: 100,
    thousand: 1000,
  };

  if (wordMap[text] !== undefined) {
    return wordMap[text];
  }

  const num = parseFloat(text);
  return isNaN(num) ? 0 : num;
}

/**
 * Detects payment method in text (cash, transfer, pos, credit, mixed)
 */
function extractPaymentMethod(text: string, totalAmount: number = 0): {
  method: PaymentMethod;
  isCredit: boolean;
  cashAmount?: number;
  transferAmount?: number;
} {
  const lower = text.toLowerCase();
  if (lower.includes('credit') || lower.includes('debt') || lower.includes('owe') || lower.includes('owing')) {
    return { method: 'other', isCredit: true };
  }

  // Mixed payment check: mentions cash AND (transfer/bank/alert), or contains 'mixed'
  const hasCash = /\bcash\b/i.test(lower);
  const hasTransfer = /\b(transfer|bank|alert)\b/i.test(lower);
  const hasMixedWord = /\bmixed\b/i.test(lower);

  if ((hasCash && hasTransfer) || hasMixedWord) {
    let cashAmount = 0;
    let transferAmount = 0;

    const cashMatch =
      lower.match(/(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)\s*cash\b/i) ||
      lower.match(/\bcash\s*(?:of\s*)?(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    if (cashMatch) {
      cashAmount = parseSpokenNumber(cashMatch[1]);
    }

    const transferMatch =
      lower.match(/(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)\s*(?:transfer|bank|alert)\b/i) ||
      lower.match(/\b(?:transfer|bank|alert)\s*(?:of\s*)?(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    if (transferMatch) {
      transferAmount = parseSpokenNumber(transferMatch[1]);
    }

    if (totalAmount > 0) {
      if (
        cashAmount > 0 &&
        transferAmount === 0 &&
        (lower.includes('balance transfer') || lower.includes('transfer balance') || hasTransfer)
      ) {
        transferAmount = Math.max(0, totalAmount - cashAmount);
      } else if (
        transferAmount > 0 &&
        cashAmount === 0 &&
        (lower.includes('balance cash') || lower.includes('cash balance') || hasCash)
      ) {
        cashAmount = Math.max(0, totalAmount - transferAmount);
      }
    }

    return {
      method: 'mixed',
      isCredit: false,
      cashAmount,
      transferAmount,
    };
  }

  if (hasTransfer) {
    return { method: 'transfer', isCredit: false };
  }
  if (lower.includes('pos') || lower.includes('card')) {
    return { method: 'pos', isCredit: false };
  }
  return { method: 'cash', isCredit: false };
}

/**
 * Local offline rule-based parser
 */
export function parseLocalVoiceCommand(
  rawText: string,
  catalogProducts: Product[],
  catalogCustomers: Customer[],
  options?: { branchId?: string },
): VoiceAction {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. DAMAGE DETECTION
  // E.g.: "Record 3 broken eggs as damage", "2 cartons expired, write off from profit"
  if (
    lower.startsWith('damage') ||
    lower.includes(' damaged') ||
    lower.includes(' broken ') ||
    lower.includes(' expired') ||
    lower.includes(' spoilt ') ||
    lower.includes(' spilled')
  ) {
    const qtyMatch = lower.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(?:of\s+)?(.+?)(?:\s+(?:as|due to|because)\s+(.+))?$/i);
    let quantity = 1;
    let queryName = text;
    let reason = 'Damaged stock';

    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1]) || 1;
      queryName = (qtyMatch[3] || '').trim();
      reason = (qtyMatch[4] || '').trim() || (lower.includes('expired') ? 'Expired' : lower.includes('broken') ? 'Broken' : 'Damaged');
    }

    // Clean damage keywords
    queryName = queryName.replace(/^(record\s+)?(damage|damaged|broken|expired|spoilt)\s*/i, '').trim();

    const productMatch = matchProduct(queryName, catalogProducts);
    if (productMatch && productMatch.confidence >= 0.4) {
      const product = productMatch.item;
      const unitCost = Number(product.cost_price ?? 0);
      const totalLoss = Math.round(quantity * unitCost * 100) / 100;

      const action: VoiceDamageAction = {
        type: 'RECORD_DAMAGE',
        productName: product.name,
        matchedProduct: product,
        productId: product.id,
        quantity,
        unit: product.unit || 'piece',
        unitCost,
        totalLoss,
        reason,
        deductFromProfit: true,
        notes: text,
      };
      return action;
    }
  }

  // 2. PRODUCT PRICE / COST UPDATE / PHYSICAL COUNT RECONCILIATION
  // E.g.: "Increase price of Coke to 350", "Change flash drive selling price to 16000", "Update indomie cost price to 8500", "Counted 45 malt in shop"
  if (
    lower.includes('price of') ||
    lower.includes('cost of') ||
    lower.includes('cost price') ||
    lower.includes('selling price') ||
    lower.includes('price to') ||
    lower.includes('cost to') ||
    lower.includes('increase price') ||
    lower.includes('change price') ||
    lower.includes('physical count') ||
    lower.includes('counted ') ||
    lower.includes('adjust stock')
  ) {
    let queryName = '';
    let newSellingPrice: number | undefined;
    let newCostPrice: number | undefined;
    let targetQuantity: number | undefined;
    let reconciliationMethod: ReconciliationMethod = 'restock';

    // 1. Cost price:
    let costMatch = lower.match(/cost(?:\s+price)?\s+of\s+(.+?)\s+(?:to|is)\s+(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    if (!costMatch) {
      costMatch = lower.match(/(?:change|update|increase|set)?\s*(.+?)\s+cost(?:\s+price)?\s+(?:to|is)\s+(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    }
    if (costMatch) {
      queryName = (costMatch[1] || '').trim();
      newCostPrice = parseSpokenNumber(costMatch[2]);
    }

    // 2. Selling price:
    let sellingMatch = lower.match(/(?:selling\s+)?price\s+of\s+(.+?)\s+(?:to|is)\s+(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    if (!sellingMatch) {
      sellingMatch = lower.match(/(?:change|update|increase|set)?\s*(.+?)\s+(?:selling\s+price|price)\s+(?:to|is)\s+(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)/i);
    }
    if (sellingMatch) {
      if (!queryName) queryName = (sellingMatch[1] || '').trim();
      if (!sellingMatch[0].includes('cost')) {
        newSellingPrice = parseSpokenNumber(sellingMatch[2]);
      }
    }

    // 3. Physical count / adjust stock pattern: "counted [num] [product] in shop" or "adjust stock of [product] to [num]"
    const countMatch = lower.match(/(?:counted|adjust\s+stock\s+of|physical\s+count\s+for)\s+(?:(\d+)\s+([a-zA-Z]+)?\s+(?:of\s+)?(.+)|(.+?)\s+(?:to|is)\s+(\d+))/i);
    if (countMatch) {
      if (countMatch[1]) {
        targetQuantity = parseFloat(countMatch[1]);
        if (!queryName) queryName = (countMatch[3] || countMatch[2] || '').trim();
      } else if (countMatch[4]) {
        if (!queryName) queryName = countMatch[4].trim();
        targetQuantity = parseFloat(countMatch[5]);
      }
      reconciliationMethod = 'correction';
    }

    queryName = queryName
      .replace(/^(change|update|increase|set|stock\s+of)\s+/i, '')
      .replace(/\s+(in\s+shop|during\s+audit|audit)$/i, '')
      .trim();

    if (queryName) {
      const productMatch = matchProduct(queryName, catalogProducts);
      if (productMatch && productMatch.confidence >= 0.4) {
        const product = productMatch.item;
        const currentStock = options?.branchId
          ? (product.inventory?.find((inv) => inv.branch_id === options.branchId)?.quantity ?? 0)
          : (product.inventory?.[0]?.quantity ?? 0);

        const action: VoiceUpdateProductAction = {
          type: 'UPDATE_PRODUCT',
          productName: product.name,
          matchedProduct: product,
          productId: product.id,
          newSellingPrice,
          oldSellingPrice: product.selling_price,
          newCostPrice,
          oldCostPrice: product.cost_price,
          costingMethod: 'average',
          targetQuantity,
          currentStock,
          reconciliationMethod,
          notes: text,
        };
        return action;
      }
    }
  }

  // 3. DEBT REPAYMENT (RECORD_PAYMENT)
  // E.g.: "Emeka paid 5000 from his debt via transfer", "Customer John paid 10000 debt"
  if (
    lower.includes('paid from debt') ||
    lower.includes('debt payment') ||
    lower.includes('paid his debt') ||
    lower.includes('paid her debt') ||
    lower.includes('settled debt') ||
    lower.includes('repay')
  ) {
    const amountMatch = lower.match(/(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?|\b\d+\b)(?:\s*(?:naira|ngn))?/i);
    let amount = 0;
    if (amountMatch) {
      amount = parseSpokenNumber(amountMatch[1]);
    }

    let candidateName = text
      .replace(/(?:₦|ngn|naira)\s*\d+k?/gi, '')
      .replace(/\b\d+k?\s*(?:naira|ngn)?\b/gi, '')
      .replace(/\b(paid|from|debt|his|her|via|cash|transfer|pos|card|payment|settled|customer|repay|repayment)\b/gi, ' ')
      .trim();

    const customerMatch = matchCustomer(candidateName, catalogCustomers);
    const { method: paymentMethod } = extractPaymentMethod(lower);

    const action: VoicePaymentAction = {
      type: 'RECORD_PAYMENT',
      customerName: customerMatch ? customerMatch.item.name : candidateName,
      matchedCustomer: customerMatch ? customerMatch.item : undefined,
      amount,
      paymentMethod,
      notes: text,
    };
    return action;
  }

  // 4. EXPENSE DETECTION
  // E.g.: "Expense 2500 for fuel", "Spent 3k transport", "Bought diesel 5000 cash"
  if (
    lower.startsWith('expense') ||
    lower.startsWith('spent') ||
    lower.startsWith('spend') ||
    lower.includes('bought fuel') ||
    lower.includes('buy fuel') ||
    lower.includes('paid for') ||
    lower.includes('pay for')
  ) {
    const amountMatch = lower.match(/(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?|\b\d+\b)(?:\s*(?:naira|ngn))?/i);
    let amount = 0;
    if (amountMatch) {
      amount = parseSpokenNumber(amountMatch[1]);
    }

    const categoryInfo = matchExpenseCategory(lower);
    const { method: paymentMethod } = extractPaymentMethod(lower);

    let description = text
      .replace(/^(expense|spent|spend|paid for|pay for)\s*/i, '')
      .replace(/(?:₦|ngn|naira)\s*\d+k?/gi, '')
      .replace(/\b\d+k?\s*(?:naira|ngn)?\b/gi, '')
      .replace(/\b(cash|transfer|pos|card)\b/gi, '')
      .trim();

    if (!description) {
      description = categoryInfo.label;
    }

    const action: VoiceExpenseAction = {
      type: 'RECORD_EXPENSE',
      category: categoryInfo.value,
      categoryLabel: categoryInfo.label,
      amount,
      description,
      paymentMethod,
      expenseDate: new Date().toISOString().split('T')[0],
    };
    return action;
  }

  // 5. NEW DEBT CREATION
  // E.g.: "Debt 5000 John for 2 crates egg", "Musa owes 10000", "Emeka debt 3k"
  if (
    lower.startsWith('debt') ||
    lower.includes('owes') ||
    lower.includes('owing') ||
    lower.includes('borrowed')
  ) {
    const amountMatch = lower.match(/(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?|\b\d+\b)(?:\s*(?:naira|ngn))?/i);
    let amount = 0;
    if (amountMatch) {
      amount = parseSpokenNumber(amountMatch[1]);
    }

    let clean = text
      .replace(/^(record\s+)?(debt|credit)\s*(of\s*)?/i, '')
      .replace(/(?:₦|ngn|naira)\s*\d+k?/gi, '')
      .replace(/\b\d+k?\s*(?:naira|ngn)?\b/gi, '')
      .replace(/\b(owes|owing|borrowed|to|for|from)\b/gi, ' ')
      .trim();

    const words = clean.split(/\s+/).filter(Boolean);
    const candidateName = words[0] || 'Customer';
    const notes = words.slice(1).join(' ') || 'Credit purchase';

    const customerMatch = matchCustomer(candidateName, catalogCustomers);

    const action: VoiceDebtAction = {
      type: 'RECORD_DEBT',
      customerName: customerMatch ? customerMatch.item.name : candidateName,
      matchedCustomer: customerMatch ? customerMatch.item : undefined,
      customerPhone: customerMatch ? customerMatch.item.phone : undefined,
      amount,
      notes,
    };
    return action;
  }

  // 6. STOCK / RESTOCK DETECTION
  // E.g.: "Add stock of 20 flash drives, cost price 10,000 naira and selling price 15,000", "Restock 5 bags of rice"
  if (
    lower.startsWith('add stock') ||
    lower.startsWith('restock') ||
    lower.startsWith('stock') ||
    lower.startsWith('purchase') ||
    lower.includes('new stock') ||
    (lower.startsWith('add ') && (lower.includes('cost') || lower.includes('selling') || lower.includes('price') || lower.includes('carton') || lower.includes('bag') || lower.includes('crate') || lower.includes('pack')))
  ) {
    let clean = text
      .replace(/^(add\s+stock(\s+of)?|restock(\s+of)?|stock(\s+of)?|purchase(\s+of)?|new\s+stock(\s+of)?|add(\s+of)?)\s*/i, '')
      .replace(/^of\s+/i, '')
      .trim();

    // 1. Extract cost price: "cost price 10,000 naira", "cost 10k", "at 10000 each", "costing 10000"
    let costPrice: number | undefined;
    const costMatch = clean.match(/(?:cost(?:\s+price)?|costing|at|buy(?:\s+at|\s+for)?)\s*(?:is|to|of)?\s*(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)(?:\s*(?:naira|ngn))?/i);
    if (costMatch) {
      costPrice = parseSpokenNumber(costMatch[1]);
      clean = clean.replace(costMatch[0], ' ');
    }

    // 2. Extract selling price: "selling price 15,000", "sell for 15k", "price 15000", "selling at 15000"
    let sellingPrice: number | undefined;
    const sellingMatch = clean.match(/(?:selling(?:\s+price|\s+at)?|sell\s+for|price)\s*(?:is|to|of)?\s*(?:(?:₦|ngn|naira)\s*)?(\d+(?:[.,]\d+)?k?)(?:\s*(?:naira|ngn))?/i);
    if (sellingMatch) {
      sellingPrice = parseSpokenNumber(sellingMatch[1]);
      clean = clean.replace(sellingMatch[0], ' ');
    }

    // 3. Clean conjunctions, currencies, and commas
    clean = clean.replace(/\b(and|with|naira|ngn|each)\b/gi, ' ').replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();

    // 4. Extract quantity, unit, and queryName
    let quantity = 1;
    let unit = 'piece';
    let queryName = clean;

    const knownUnits = ['piece', 'pcs', 'carton', 'cartons', 'pack', 'packs', 'bag', 'bags', 'crate', 'crates', 'tin', 'tins', 'bottle', 'bottles', 'dozen', 'roll', 'rolls', 'kg'];

    const matchStart = clean.match(/^(\d+(?:\.\d+)?)\s*(?:([a-zA-Z]+)\s+)?(?:of\s+)?(.+)?$/i);
    if (matchStart) {
      quantity = parseFloat(matchStart[1]) || 1;
      const potentialUnit = (matchStart[2] || '').toLowerCase();
      const remainder = (matchStart[3] || '').trim();

      if (knownUnits.includes(potentialUnit)) {
        unit = normalizeUnit(potentialUnit);
        queryName = remainder || potentialUnit;
      } else if (matchStart[2]) {
        queryName = remainder ? `${matchStart[2]} ${remainder}` : matchStart[2];
      } else if (remainder) {
        queryName = remainder;
      }
    } else {
      const matchEnd = clean.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/i);
      if (matchEnd) {
        queryName = matchEnd[1].trim();
        quantity = parseFloat(matchEnd[2]) || 1;
        const potentialUnit = (matchEnd[3] || '').toLowerCase();
        if (knownUnits.includes(potentialUnit)) {
          unit = normalizeUnit(potentialUnit);
        }
      }
    }

    queryName = queryName.replace(/^of\s+/i, '').replace(/^(and\s+|,)/i, '').trim();

    const productMatch = matchProduct(queryName, catalogProducts);

    const action: VoiceStockAction = {
      type: 'RECORD_STOCK',
      items: [
        {
          queryName: productMatch ? productMatch.item.name : queryName,
          matchedProduct: productMatch ? productMatch.item : undefined,
          quantity,
          unit: productMatch ? productMatch.item.unit : unit,
          costPrice: costPrice ?? (productMatch ? productMatch.item.cost_price : undefined),
          sellingPrice: sellingPrice ?? (productMatch ? productMatch.item.selling_price : undefined),
          isNewProduct: !productMatch,
        },
      ],
      notes: 'Added via Voice Assistant',
    };
    return action;
  }

  // 7. SALE DETECTION (With Discount, Custom Selling Price, Customer & Debt)
  // E.g.: "Sold 2 indomie 1000 cash with 100 discount to Emeka", "Sold 3 coke at 400 each"
  let cleanSale = text
    .replace(/^(record\s+)?(sale(\s+of)?|sold)\s*/i, '')
    .trim();

  // Extract discount if spoken
  let discountAmount = 0;
  let discountPercentage: number | undefined;
  const discountMatch = cleanSale.match(/(?:with|give|less|-)\s*(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?|\d+%)\s*discount/i) ||
    cleanSale.match(/discount\s*(?:of\s*)?(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?|\d+%)/i);

  if (discountMatch) {
    const rawDisc = discountMatch[1].trim();
    if (rawDisc.endsWith('%')) {
      discountPercentage = parseFloat(rawDisc.slice(0, -1)) || 0;
    } else {
      discountAmount = parseSpokenNumber(rawDisc);
    }
    cleanSale = cleanSale.replace(discountMatch[0], '').trim();
  }

  // Extract customer assignment if spoken
  let candidateCustomerName: string | undefined;
  const toCustomerMatch = cleanSale.match(/\b(?:to|for)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i);
  if (toCustomerMatch) {
    const word = toCustomerMatch[1].toLowerCase();
    if (!['cash', 'transfer', 'pos', 'credit'].includes(word)) {
      candidateCustomerName = toCustomerMatch[1].trim();
      cleanSale = cleanSale.replace(toCustomerMatch[0], '').trim();
    }
  }

  const paymentBreakdown = extractPaymentMethod(cleanSale);
  const paymentMethod = paymentBreakdown.method;
  const isCredit = paymentBreakdown.isCredit;
  let cashAmount = paymentBreakdown.cashAmount;
  let transferAmount = paymentBreakdown.transferAmount;

  if (paymentMethod === 'mixed') {
    cleanSale = cleanSale
      .replace(/(?:(?:₦|ngn|naira)\s*)?\d+(?:[.,]\d+)?k?\s*cash\b/gi, ' ')
      .replace(/\bcash\s*(?:of\s*)?(?:(?:₦|ngn|naira)\s*)?\d+(?:[.,]\d+)?k?/gi, ' ')
      .replace(/(?:(?:₦|ngn|naira)\s*)?\d+(?:[.,]\d+)?k?\s*(?:transfer|bank|alert)\b/gi, ' ')
      .replace(/\b(?:transfer|bank|alert)\s*(?:of\s*)?(?:(?:₦|ngn|naira)\s*)?\d+(?:[.,]\d+)?k?/gi, ' ')
      .replace(/\b(mixed(\s+payment)?|balance\s+transfer|balance\s+cash)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const saleMatch = cleanSale.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(?:of\s+)?(.+)/i);
  let quantity = 1;
  let unit = 'piece';
  let queryName = cleanSale;
  let explicitPrice: number | undefined;

  if (saleMatch) {
    quantity = parseFloat(saleMatch[1]) || 1;
    const potentialUnit = saleMatch[2];
    const remainder = saleMatch[3];

    if (potentialUnit && ['carton', 'cartons', 'pack', 'packs', 'bag', 'bags', 'crate', 'crates', 'tin', 'tins', 'bottle', 'bottles', 'dozen', 'roll', 'rolls', 'pcs', 'piece'].includes(potentialUnit.toLowerCase())) {
      unit = normalizeUnit(potentialUnit);
      queryName = remainder;
    } else {
      queryName = `${potentialUnit || ''} ${remainder}`.trim();
    }
  }

  const priceMatch = queryName.match(/(?:for|at|each)?\s*(?:(?:₦|ngn|naira)\s*)?(\d+(?:\.\d+)?k?)(?:\s*(?:naira|ngn))?\s*(?:each|cash|transfer|pos|card)?$/i);
  if (priceMatch) {
    explicitPrice = parseSpokenNumber(priceMatch[1]);
    queryName = queryName.replace(priceMatch[0], '').trim();
  }

  queryName = queryName.replace(/\b(cash|transfer|pos|card|credit|and)\b/gi, '').trim();

  if (!queryName) {
    const unknown: VoiceUnknownAction = {
      type: 'UNKNOWN',
      rawText: text,
      suggestion: 'Try saying: "Sold 2 indomie for 1000 cash with 100 discount" or "Increase price of Coke to 350"',
    };
    return unknown;
  }

  const productMatch = matchProduct(queryName, catalogProducts);

  if (!productMatch || productMatch.confidence < 0.45) {
    return {
      type: 'UNKNOWN',
      rawText: text,
      suggestion: `Could not find "${queryName}" in your inventory. You can only record sales for products currently in stock.`,
    };
  }

  const product = productMatch.item;
  const resolvedUnit = normalizeUnit(unit || product.unit || 'piece');
  const unitOption = getSaleUnitOption(product, resolvedUnit);
  const stockToDeduct = quantity * (unitOption.stockFactor || 1);

  const branchId = options?.branchId;
  const availableStock = branchId
    ? (product.inventory?.find((inv) => inv.branch_id === branchId)?.quantity ?? 0)
    : (product.inventory?.[0]?.quantity ?? 0);

  if (!product.is_service && branchId) {
    if (availableStock <= 0) {
      return {
        type: 'UNKNOWN',
        rawText: text,
        suggestion: `"${product.name}" is currently out of stock (0 available). Cannot record sale.`,
      };
    }
    if (stockToDeduct > availableStock) {
      return {
        type: 'UNKNOWN',
        rawText: text,
        suggestion: `Only ${availableStock} ${product.unit} of "${product.name}" available in stock. Cannot record sale of ${quantity} ${resolvedUnit}.`,
      };
    }
  }

  let unitPrice = product.selling_price || 0;
  if (explicitPrice !== undefined) {
    if (quantity > 1 && Math.abs(explicitPrice / quantity - unitPrice) < 0.01) {
      unitPrice = explicitPrice / quantity;
    } else {
      unitPrice = explicitPrice;
    }
  }

  const subtotal = Math.round(unitPrice * quantity * 100) / 100;

  if (discountPercentage && discountPercentage > 0) {
    discountAmount = Math.round((subtotal * (discountPercentage / 100)) * 100) / 100;
  }

  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  let amountPaid = isCredit ? 0 : total;
  let amountOwed = isCredit ? total : 0;

  if (paymentMethod === 'mixed') {
    if (cashAmount !== undefined && transferAmount !== undefined) {
      if (cashAmount > 0 && transferAmount === 0) {
        transferAmount = Math.max(0, total - cashAmount);
      } else if (transferAmount > 0 && cashAmount === 0) {
        cashAmount = Math.max(0, total - transferAmount);
      }
      amountPaid = cashAmount + transferAmount;
      amountOwed = Math.max(0, total - amountPaid);
    }
  }

  const matchedCustomer = candidateCustomerName
    ? matchCustomer(candidateCustomerName, catalogCustomers)?.item
    : undefined;

  const action: VoiceSaleAction = {
    type: 'RECORD_SALE',
    items: [
      {
        queryName: product.name,
        matchedProduct: product,
        quantity,
        unitPrice,
        catalogSellingPrice: product.selling_price,
        costPrice: product.cost_price,
        unit: resolvedUnit,
        confidence: productMatch.confidence,
        availableStock,
        stockToDeduct,
      },
    ],
    customerName: matchedCustomer ? matchedCustomer.name : candidateCustomerName,
    matchedCustomer,
    customerPhone: matchedCustomer?.phone,
    paymentMethod,
    isCredit,
    amountPaid,
    amountOwed,
    cashAmount,
    transferAmount,
    discountAmount,
    discountPercentage,
    subtotal,
    total,
  };
  return action;
}

/**
 * AI NLU Parser with JSON Schema (Groq / Gemini / OpenAI)
 */
export async function parseWithAI(
  transcription: string,
  apiKey: string,
  apiProvider: 'gemini' | 'groq' | 'openai' = 'groq',
  catalogProductNames?: string[],
): Promise<any> {
  const productListPrompt =
    catalogProductNames && catalogProductNames.length > 0
      ? `\nAvailable Products in Store Catalog:\n[${catalogProductNames.join(', ')}]\nIMPORTANT: Match product names strictly or closely to one of the catalog products above.`
      : '';

  const systemPrompt = `You are the AI assistant for Record Am, a retail store inventory, sales, and bookkeeping mobile app.
Your task is to parse spoken merchant voice commands into ONE structured JSON object matching this schema:
{
  "action": "RECORD_SALE" | "UPDATE_PRODUCT" | "RECORD_STOCK" | "RECORD_DAMAGE" | "RECORD_PURCHASE" | "RECORD_PAYMENT" | "RECORD_DEBT" | "RECORD_EXPENSE" | "UNKNOWN",
  "sale": {
    "items": [{"name": string, "quantity": number, "unit": string, "unitPrice": number}],
    "customer": string,
    "paymentMethod": "cash" | "transfer" | "pos" | "credit" | "mixed",
    "cashAmount": number,
    "transferAmount": number,
    "amountPaid": number,
    "discountAmount": number,
    "discountPercentage": number,
    "notes": string
  },
  "stock": {
    "product": string,
    "quantity": number,
    "unit": string,
    "costPrice": number,
    "sellingPrice": number,
    "supplier": string,
    "items": [{"name": string, "quantity": number, "unit": string, "cost": number, "sellingPrice": number}]
  },
  "updateProduct": {
    "product": string,
    "newSellingPrice": number,
    "newCostPrice": number,
    "costingMethod": "average" | "replace" | "keep",
    "quantityChange": number,
    "targetQuantity": number,
    "reconciliationMethod": "restock" | "correction" | "damage" | "return" | "internal_use",
    "notes": string
  },
  "damage": {
    "product": string,
    "quantity": number,
    "unit": string,
    "reason": string,
    "deductFromProfit": boolean
  },
  "purchase": {
    "supplier": string,
    "items": [{"name": string, "quantity": number, "unit": string, "unitCost": number}],
    "amountPaid": number,
    "paymentMethod": "cash" | "transfer" | "pos",
    "notes": string
  },
  "payment": {
    "customer": string,
    "amount": number,
    "paymentMethod": "cash" | "transfer" | "pos",
    "notes": string
  },
  "debt": {
    "customer": string,
    "amount": number,
    "notes": string,
    "dueDate": string
  },
  "expense": {
    "category": "rent"|"electricity"|"transport"|"salary"|"supplies"|"maintenance"|"marketing"|"internet"|"water"|"security"|"damage"|"other",
    "amount": number,
    "description": string,
    "paymentMethod": "cash"|"transfer"|"pos"
  }
}
${productListPrompt}

Rules:
1. For sales with discounts (e.g. "with 500 discount" or "10% discount"), populate discountAmount or discountPercentage.
2. If customer paid partially or on credit, specify amountPaid and customer. If on credit, paymentMethod="credit" and amountPaid=0.
3. If changing selling price or cost price of an existing product in store catalog, use action="UPDATE_PRODUCT".
4. If adding new stock, restocking quantity, or adding a new product with stock/cost/selling price (e.g. "Add stock of 20 flash drives, cost price 10000 and selling price 15000"), use action="RECORD_STOCK". Populate product, quantity, costPrice, sellingPrice.
5. If physical count or inventory audit (e.g. "counted 45 in shop"), set targetQuantity and reconciliationMethod="correction".
6. If restocking with new cost or quantity for existing catalog product, populate quantityChange and newCostPrice.
7. If reporting broken/spoiled/expired items, use action="RECORD_DAMAGE".
8. If customer is paying from previous debt, use action="RECORD_PAYMENT".
9. If customer paid partially in cash and partially by transfer or bank alert, set paymentMethod="mixed", and populate cashAmount and transferAmount.
10. Only populate the key corresponding to the chosen action. Return valid JSON only.`;

  if (apiProvider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: `Parse this merchant voice command: "${transcription}"` },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(textContent);
  }

  // OpenAI or Groq
  const endpoint =
    apiProvider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

  const model = apiProvider === 'groq' ? 'openai/gpt-oss-20b' : 'gpt-4o-mini';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcription },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`${apiProvider} API error: ${response.statusText}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content;
  return JSON.parse(textContent);
}

/**
 * High-level parse function combining AI (when available) with Offline Fallback
 */
export async function parseVoiceCommand(
  transcription: string,
  catalogProducts: Product[],
  catalogCustomers: Customer[],
  options?: {
    apiKey?: string;
    apiProvider?: 'gemini' | 'groq' | 'openai';
    branchId?: string;
  },
): Promise<VoiceAction> {
  const trimmed = transcription.trim();
  if (!trimmed) {
    return {
      type: 'UNKNOWN',
      rawText: '',
      suggestion: 'Please say a command like "Sold 2 coke 1000 cash with 100 discount"',
    };
  }

  // If AI API key is configured and online, attempt AI parsing
  if (options?.apiKey) {
    try {
      const aiResult = await parseWithAI(
        trimmed,
        options.apiKey,
        options.apiProvider || 'groq',
        catalogProducts.map((p) => p.name).slice(0, 100),
      );

      // 1. RECORD_SALE
      if (aiResult.action === 'RECORD_SALE' && aiResult.sale?.items?.length) {
        const items: VoiceSaleItem[] = [];

        for (const it of aiResult.sale.items) {
          const match = matchProduct(it.name, catalogProducts);

          if (!match || match.confidence < 0.45) {
            return {
              type: 'UNKNOWN',
              rawText: trimmed,
              suggestion: `Product "${it.name}" was not found in your inventory. You can only record sales for products currently in your catalog.`,
            };
          }

          const product = match.item;
          const resolvedUnit = normalizeUnit(it.unit || product.unit || 'piece');
          const unitOption = getSaleUnitOption(product, resolvedUnit);
          const quantity = it.quantity || 1;
          const stockToDeduct = quantity * (unitOption.stockFactor || 1);

          const branchId = options?.branchId;
          const availableStock = branchId
            ? (product.inventory?.find((inv) => inv.branch_id === branchId)?.quantity ?? 0)
            : (product.inventory?.[0]?.quantity ?? 0);

          if (!product.is_service && branchId) {
            if (availableStock <= 0) {
              return {
                type: 'UNKNOWN',
                rawText: trimmed,
                suggestion: `"${product.name}" is currently out of stock (0 available). Cannot record sale.`,
              };
            }
            if (stockToDeduct > availableStock) {
              return {
                type: 'UNKNOWN',
                rawText: trimmed,
                suggestion: `Only ${availableStock} ${product.unit} of "${product.name}" available in stock. Cannot record sale of ${quantity} ${resolvedUnit}.`,
              };
            }
          }

          const unitPrice = it.unitPrice || it.price || product.selling_price || 0;

          items.push({
            queryName: it.name,
            matchedProduct: product,
            quantity,
            unitPrice,
            catalogSellingPrice: product.selling_price,
            costPrice: product.cost_price,
            unit: resolvedUnit,
            confidence: match.confidence,
            availableStock,
            stockToDeduct,
          });
        }

        const subtotal = Math.round(
          items.reduce((acc: number, it: any) => acc + it.unitPrice * it.quantity, 0) * 100,
        ) / 100;

        let discountAmount = 0;
        let discountPercentage: number | undefined;

        if (aiResult.sale.discountPercentage && Number(aiResult.sale.discountPercentage) > 0) {
          discountPercentage = Number(aiResult.sale.discountPercentage);
          discountAmount = Math.round((subtotal * (discountPercentage / 100)) * 100) / 100;
        } else if (aiResult.sale.discountAmount && Number(aiResult.sale.discountAmount) > 0) {
          discountAmount = Math.round(Number(aiResult.sale.discountAmount) * 100) / 100;
        }

        const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

        const rawMethod = (aiResult.sale.paymentMethod || 'cash').toLowerCase();
        const isCredit = rawMethod === 'credit';
        const isMixed = rawMethod === 'mixed';
        const paymentMethod: PaymentMethod = isCredit
          ? 'other'
          : isMixed
          ? 'mixed'
          : (['cash', 'transfer', 'pos', 'mobile_money', 'mixed'].includes(rawMethod)
              ? (rawMethod as PaymentMethod)
              : 'cash');

        let amountPaid = total;
        let amountOwed = 0;
        let cashAmount: number | undefined;
        let transferAmount: number | undefined;

        if (isCredit) {
          amountPaid = 0;
          amountOwed = total;
        } else if (isMixed) {
          cashAmount = aiResult.sale.cashAmount !== undefined ? Number(aiResult.sale.cashAmount) : undefined;
          transferAmount = aiResult.sale.transferAmount !== undefined ? Number(aiResult.sale.transferAmount) : undefined;
          if (cashAmount !== undefined || transferAmount !== undefined) {
            const sum = (cashAmount ?? 0) + (transferAmount ?? 0);
            amountPaid = sum > 0 ? sum : total;
            amountOwed = Math.max(0, total - amountPaid);
          }
        } else if (aiResult.sale.amountPaid !== undefined && Number(aiResult.sale.amountPaid) < total) {
          amountPaid = Math.max(0, Number(aiResult.sale.amountPaid));
          amountOwed = Math.max(0, total - amountPaid);
        }

        const customerMatch = aiResult.sale.customer
          ? matchCustomer(aiResult.sale.customer, catalogCustomers)
          : null;

        return {
          type: 'RECORD_SALE',
          items,
          customerName: customerMatch ? customerMatch.item.name : aiResult.sale.customer,
          matchedCustomer: customerMatch ? customerMatch.item : undefined,
          customerPhone: customerMatch ? customerMatch.item.phone : undefined,
          paymentMethod,
          isCredit,
          amountPaid,
          amountOwed,
          cashAmount,
          transferAmount,
          discountAmount,
          discountPercentage,
          notes: aiResult.sale.notes,
          subtotal,
          total,
        };
      }

      // 2. UPDATE_PRODUCT
      if (aiResult.action === 'UPDATE_PRODUCT' && aiResult.updateProduct) {
        let pName = (aiResult.updateProduct.product || '').replace(/^of\s+/i, '').trim();
        const match = matchProduct(pName, catalogProducts);

        if (!match || match.confidence < 0.4) {
          // If the product doesn't exist yet but quantity or cost/selling price is specified, treat as adding new product stock!
          const qty = aiResult.updateProduct.quantityChange ?? aiResult.updateProduct.targetQuantity;
          if (
            qty !== undefined ||
            aiResult.updateProduct.newCostPrice !== undefined ||
            aiResult.updateProduct.newSellingPrice !== undefined
          ) {
            return {
              type: 'RECORD_STOCK',
              items: [
                {
                  queryName: pName,
                  matchedProduct: undefined,
                  quantity: qty ?? 1,
                  unit: 'piece',
                  costPrice: aiResult.updateProduct.newCostPrice,
                  sellingPrice: aiResult.updateProduct.newSellingPrice,
                  isNewProduct: true,
                },
              ],
              notes: 'Added via Voice Assistant',
            };
          }

          return {
            type: 'UNKNOWN',
            rawText: trimmed,
            suggestion: `Product "${pName}" was not found in your inventory. Cannot update price or stock.`,
          };
        }

        const product = match.item;
        const branchId = options?.branchId;
        const currentStock = branchId
          ? (product.inventory?.find((inv) => inv.branch_id === branchId)?.quantity ?? 0)
          : (product.inventory?.[0]?.quantity ?? 0);

        return {
          type: 'UPDATE_PRODUCT',
          productName: product.name,
          matchedProduct: product,
          productId: product.id,
          newSellingPrice: aiResult.updateProduct.newSellingPrice,
          oldSellingPrice: product.selling_price,
          newCostPrice: aiResult.updateProduct.newCostPrice,
          oldCostPrice: product.cost_price,
          costingMethod: aiResult.updateProduct.costingMethod || 'average',
          quantityChange: aiResult.updateProduct.quantityChange,
          targetQuantity: aiResult.updateProduct.targetQuantity,
          currentStock,
          reconciliationMethod:
            aiResult.updateProduct.reconciliationMethod ||
            (aiResult.updateProduct.targetQuantity !== undefined ? 'correction' : 'restock'),
          notes: aiResult.updateProduct.notes || trimmed,
        };
      }

      // 3. RECORD_DAMAGE
      if (aiResult.action === 'RECORD_DAMAGE' && aiResult.damage) {
        const pName = aiResult.damage.product || '';
        const match = matchProduct(pName, catalogProducts);

        if (!match || match.confidence < 0.4) {
          return {
            type: 'UNKNOWN',
            rawText: trimmed,
            suggestion: `Product "${pName}" was not found in inventory to record damage.`,
          };
        }

        const product = match.item;
        const quantity = aiResult.damage.quantity || 1;
        const unitCost = Number(product.cost_price ?? 0);
        const totalLoss = Math.round(quantity * unitCost * 100) / 100;

        return {
          type: 'RECORD_DAMAGE',
          productName: product.name,
          matchedProduct: product,
          productId: product.id,
          quantity,
          unit: aiResult.damage.unit || product.unit || 'piece',
          unitCost,
          totalLoss,
          reason: aiResult.damage.reason || 'Damaged stock',
          deductFromProfit: aiResult.damage.deductFromProfit ?? true,
          notes: trimmed,
        };
      }

      // 4. RECORD_PURCHASE
      if (aiResult.action === 'RECORD_PURCHASE' && aiResult.purchase?.items?.length) {
        const items: VoicePurchaseItem[] = aiResult.purchase.items.map((it: any) => {
          const match = matchProduct(it.name, catalogProducts);
          const quantity = it.quantity || 1;
          const unitCost = it.unitCost || it.cost || (match?.item.cost_price ?? 0);
          return {
            productId: match?.item.id,
            matchedProduct: match?.item,
            name: match ? match.item.name : it.name,
            quantity,
            unitCost,
            totalCost: Math.round(quantity * unitCost * 100) / 100,
            unit: match ? match.item.unit : (it.unit || 'piece'),
          };
        });

        const totalAmount = Math.round(items.reduce((s, it) => s + it.totalCost, 0) * 100) / 100;
        const amountPaid = aiResult.purchase.amountPaid !== undefined
          ? Math.max(0, Number(aiResult.purchase.amountPaid))
          : totalAmount;
        const amountOwed = Math.max(0, totalAmount - amountPaid);
        const rawMethod = (aiResult.purchase.paymentMethod || 'cash').toLowerCase();
        const paymentMethod: PaymentMethod = ['cash', 'transfer', 'pos'].includes(rawMethod)
          ? (rawMethod as PaymentMethod)
          : 'cash';

        return {
          type: 'RECORD_PURCHASE',
          supplierName: aiResult.purchase.supplier || 'Direct Supplier',
          items,
          totalAmount,
          amountPaid,
          amountOwed,
          paymentMethod,
          notes: aiResult.purchase.notes || trimmed,
        };
      }

      // 5. RECORD_PAYMENT
      if (aiResult.action === 'RECORD_PAYMENT' && aiResult.payment) {
        const custName = aiResult.payment.customer || '';
        const match = matchCustomer(custName, catalogCustomers);
        const rawMethod = (aiResult.payment.paymentMethod || 'cash').toLowerCase();
        const paymentMethod: PaymentMethod = ['cash', 'transfer', 'pos'].includes(rawMethod)
          ? (rawMethod as PaymentMethod)
          : 'cash';

        return {
          type: 'RECORD_PAYMENT',
          customerName: match ? match.item.name : custName,
          matchedCustomer: match?.item,
          amount: aiResult.payment.amount || 0,
          paymentMethod,
          notes: aiResult.payment.notes || trimmed,
        };
      }

      // 6. RECORD_EXPENSE
      if (aiResult.action === 'RECORD_EXPENSE' && aiResult.expense) {
        const cat = matchExpenseCategory(aiResult.expense.category || aiResult.expense.description);
        return {
          type: 'RECORD_EXPENSE',
          category: cat.value,
          categoryLabel: cat.label,
          amount: aiResult.expense.amount || 0,
          description: aiResult.expense.description || cat.label,
          paymentMethod: (aiResult.expense.paymentMethod || 'cash') as PaymentMethod,
          expenseDate: new Date().toISOString().split('T')[0],
        };
      }

      // 7. RECORD_DEBT
      if (aiResult.action === 'RECORD_DEBT' && aiResult.debt) {
        const customerMatch = matchCustomer(aiResult.debt.customer, catalogCustomers);
        return {
          type: 'RECORD_DEBT',
          customerName: customerMatch ? customerMatch.item.name : aiResult.debt.customer,
          matchedCustomer: customerMatch ? customerMatch.item : undefined,
          customerPhone: customerMatch ? customerMatch.item.phone : undefined,
          amount: aiResult.debt.amount || 0,
          notes: aiResult.debt.notes || 'Recorded via Voice Assistant',
          dueDate: aiResult.debt.dueDate,
        };
      }

      // 8. RECORD_STOCK
      if (aiResult.action === 'RECORD_STOCK' && aiResult.stock) {
        let rawItems: any[] = [];
        if (Array.isArray(aiResult.stock.items) && aiResult.stock.items.length > 0) {
          rawItems = aiResult.stock.items;
        } else if (aiResult.stock.product || aiResult.stock.name) {
          rawItems = [
            {
              name: aiResult.stock.product || aiResult.stock.name,
              quantity: aiResult.stock.quantity || 1,
              unit: aiResult.stock.unit || 'piece',
              cost: aiResult.stock.costPrice ?? aiResult.stock.cost,
              sellingPrice: aiResult.stock.sellingPrice,
            },
          ];
        }

        if (rawItems.length > 0) {
          const items = rawItems.map((it: any) => {
            const rawName = (it.name || '').replace(/^of\s+/i, '').trim();
            const match = matchProduct(rawName, catalogProducts);
            return {
              queryName: match ? match.item.name : rawName,
              matchedProduct: match ? match.item : undefined,
              quantity: Number(it.quantity) || 1,
              unit: match ? match.item.unit : (it.unit || 'piece'),
              costPrice: it.cost !== undefined ? Number(it.cost) : (match?.item.cost_price),
              sellingPrice: it.sellingPrice !== undefined ? Number(it.sellingPrice) : (match?.item.selling_price),
              isNewProduct: !match,
            };
          });

          return {
            type: 'RECORD_STOCK',
            items,
            supplierName: aiResult.stock.supplier,
            notes: 'Added via Voice Assistant',
          };
        }
      }
    } catch (err) {
      console.warn('[parseVoiceCommand] AI parsing failed, falling back to local engine:', err);
    }
  }

  // Fallback to local rule engine (guaranteed to work offline!)
  return parseLocalVoiceCommand(trimmed, catalogProducts, catalogCustomers, {
    branchId: options?.branchId,
  });
}
