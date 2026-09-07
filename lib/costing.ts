export const roundAmount = (value: number) => Number(value.toFixed(2));

export interface WeightedAverageCostParams {
  currentStock: number;
  currentCostPrice: number;
  addedQuantity: number;
  newUnitCost: number;
}

/**
 * Calculates the Weighted Average Cost (Moving Average / AVCO) when restocking.
 * Formula: ((Current Qty * Old Cost) + (Added Qty * New Cost)) / (Current Qty + Added Qty)
 *
 * Edge cases handled:
 * - If addedQuantity <= 0: returns currentCostPrice
 * - If currentStock <= 0 or currentCostPrice <= 0: returns newUnitCost (old stock exhausted or cost unknown)
 * - If newUnitCost <= 0: returns currentCostPrice
 */
export function calculateWeightedAverageCost({
  currentStock,
  currentCostPrice,
  addedQuantity,
  newUnitCost,
}: WeightedAverageCostParams): number {
  const currentQty = Math.max(0, currentStock);
  const addQty = Math.max(0, addedQuantity);
  const oldCost = Math.max(0, currentCostPrice);
  const newCost = Math.max(0, newUnitCost);

  if (addQty <= 0) return oldCost;
  if (currentQty <= 0 || oldCost <= 0) return newCost;
  if (newCost <= 0) return oldCost;

  const totalValue = currentQty * oldCost + addQty * newCost;
  const totalQty = currentQty + addQty;
  return totalQty > 0 ? roundAmount(totalValue / totalQty) : newCost;
}

export interface ProfitMarginResult {
  profitPerUnit: number;
  marginPercentage: number;
  markupPercentage: number;
  status: 'profit' | 'loss' | 'break_even';
}

/**
 * Computes profit margin and markup given cost price and selling price.
 * Margin % = ((Selling - Cost) / Selling) * 100
 * Markup % = ((Selling - Cost) / Cost) * 100
 */
export function calculateProfitMargin(costPrice: number, sellingPrice: number): ProfitMarginResult {
  const cost = Math.max(0, costPrice);
  const selling = Math.max(0, sellingPrice);
  const profitPerUnit = roundAmount(selling - cost);

  if (selling === 0 && cost === 0) {
    return { profitPerUnit: 0, marginPercentage: 0, markupPercentage: 0, status: 'break_even' };
  }

  const marginPercentage = selling > 0 ? roundAmount((profitPerUnit / selling) * 100) : 0;
  const markupPercentage = cost > 0 ? roundAmount((profitPerUnit / cost) * 100) : 100;

  const status: 'profit' | 'loss' | 'break_even' =
    profitPerUnit > 0 ? 'profit' : profitPerUnit < 0 ? 'loss' : 'break_even';

  return {
    profitPerUnit,
    marginPercentage,
    markupPercentage,
    status,
  };
}
