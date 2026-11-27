/**
 * Decides which low / out-of-stock alerts to send for one branch.
 *
 * Kept free of app imports (React Native, Supabase, stores) so the rules can
 * be unit tested with plain Node: `npm test`.
 */

/** Last alerted quantity per product id, persisted per business + branch. */
export type StockAlertMap = Record<string, number>;

export interface StockAlertProduct {
  id: string;
  name: string;
  unit: string;
  reorder_level?: number | null;
  is_active?: boolean;
  is_service?: boolean;
  inventory?: Array<{ branch_id: string; quantity: number | string | null }> | null;
}

export const DEFAULT_REORDER_LEVEL = 5;

/**
 * The stock recorded for a product at a branch, or `null` when the branch has
 * no stock record for it yet. A missing record means "not stocked here yet"
 * (a branch that was just added, or a product created at another branch), not
 * "sold out", so it must never raise an out-of-stock alert on its own.
 */
export function recordedBranchStock(product: StockAlertProduct, branchId: string): number | null {
  const row = product.inventory?.find((item) => item.branch_id === branchId);
  if (!row || row.quantity === null || row.quantity === undefined) return null;
  const quantity = Number(row.quantity);
  return Number.isFinite(quantity) ? quantity : null;
}

export interface StockAlertPlan<P extends StockAlertProduct> {
  /** One notification each: stock newly at/below the reorder level, or lower than last alerted. */
  alerts: Array<{ product: P; quantity: number }>;
  /** Back above the reorder level: their old alerts can be marked read. */
  restocked: P[];
  nextMap: StockAlertMap;
  /** True when `nextMap` must be saved. */
  changed: boolean;
  /**
   * Set on the first check of a branch on this device (no saved map yet). That
   * check only records where stock stands, without per-product alerts; the
   * caller sends at most one summary built from these counts instead.
   */
  baseline: { lowOrOut: number; notStocked: number } | null;
}

/**
 * @param previous the saved map for this branch, or `null` if this device has
 *   never checked the branch before.
 */
export function planStockAlerts<P extends StockAlertProduct>(
  products: P[],
  branchId: string,
  previous: StockAlertMap | null,
): StockAlertPlan<P> {
  const isBaseline = previous === null;
  const nextMap: StockAlertMap = { ...(previous ?? {}) };
  const alerts: StockAlertPlan<P>['alerts'] = [];
  const restocked: P[] = [];
  let changed = isBaseline;
  let lowOrOut = 0;
  let notStocked = 0;

  const forget = (id: string) => {
    if (nextMap[id] !== undefined) {
      delete nextMap[id];
      changed = true;
    }
  };

  for (const product of products) {
    if (product.is_service || product.is_active === false) {
      forget(product.id);
      continue;
    }

    const quantity = recordedBranchStock(product, branchId);
    if (quantity === null) {
      notStocked += 1;
      forget(product.id);
      continue;
    }

    const reorderLevel =
      typeof product.reorder_level === 'number' ? product.reorder_level : DEFAULT_REORDER_LEVEL;

    if (quantity > reorderLevel) {
      // Healthy stock: reset so the next drop alerts again.
      forget(product.id);
      restocked.push(product);
      continue;
    }

    lowOrOut += 1;
    const lastAlerted = nextMap[product.id];

    if (isBaseline) {
      // Record silently; the caller summarises the baseline in one message.
      nextMap[product.id] = quantity;
    } else if (lastAlerted === undefined || quantity < lastAlerted) {
      // Crossed the reorder level, or ran down further since the last alert.
      alerts.push({ product, quantity });
      nextMap[product.id] = quantity;
      changed = true;
    } else if (quantity > lastAlerted) {
      // Part restocked but still low: track it without alerting.
      nextMap[product.id] = quantity;
      changed = true;
    }
    // Unchanged since the last alert: stay silent.
  }

  return {
    alerts,
    restocked,
    nextMap,
    changed,
    baseline: isBaseline ? { lowOrOut, notStocked } : null,
  };
}

/** One message summarising a branch's first stock check, or null if nothing needs attention. */
export function describeStockBaseline(
  baseline: { lowOrOut: number; notStocked: number },
  branchName?: string | null,
): { title: string; body: string } | null {
  const where = branchName?.trim() ? branchName.trim() : 'this branch';
  const plural = (n: number) => (n === 1 ? 'product' : 'products');
  const parts: string[] = [];
  if (baseline.lowOrOut > 0) {
    parts.push(`${baseline.lowOrOut} ${plural(baseline.lowOrOut)} ${baseline.lowOrOut === 1 ? 'is' : 'are'} low or out of stock`);
  }
  if (baseline.notStocked > 0) {
    parts.push(`${baseline.notStocked} ${plural(baseline.notStocked)} ${baseline.notStocked === 1 ? 'has' : 'have'} no stock recorded yet`);
  }
  if (parts.length === 0) return null;

  const title = baseline.lowOrOut > 0 ? `Stock check: ${where}` : `No stock at ${where} yet`;
  return { title, body: `At ${where}, ${parts.join(' and ')}. Open Inventory to add stock.` };
}
