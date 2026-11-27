// Run with `npm test` (Node 22.18+ loads the .ts module directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeStockBaseline,
  planStockAlerts,
  recordedBranchStock,
} from '../lib/stockAlerts.ts';

const MAIN = 'branch-main';
const NEW_BRANCH = 'branch-new';

const product = (id, inventory, reorder_level = 5) => ({
  id,
  name: `Product ${id}`,
  unit: 'pcs',
  reorder_level,
  is_active: true,
  is_service: false,
  inventory,
});

/** A catalog stocked only at the main branch, like a business that just added a branch. */
const catalog = (count, quantity = 20) =>
  Array.from({ length: count }, (_, i) => product(`p${i}`, [{ branch_id: MAIN, quantity }]));

const withStock = (p, branchId, quantity) => ({
  ...p,
  inventory: [...p.inventory.filter((row) => row.branch_id !== branchId), { branch_id: branchId, quantity }],
});

test('a missing inventory row is "not stocked yet", not zero', () => {
  const p = product('a', [{ branch_id: MAIN, quantity: 3 }]);
  assert.equal(recordedBranchStock(p, MAIN), 3);
  assert.equal(recordedBranchStock(p, NEW_BRANCH), null);
  assert.equal(recordedBranchStock(product('b', [{ branch_id: MAIN, quantity: '0.00' }]), MAIN), 0);
});

test('new branch with many products: no per-product alerts, one summary', () => {
  const products = catalog(500);

  // First check of the new branch on this device.
  const first = planStockAlerts(products, NEW_BRANCH, null);
  assert.equal(first.alerts.length, 0);
  assert.deepEqual(first.baseline, { lowOrOut: 0, notStocked: 500 });
  assert.equal(first.changed, true, 'baseline must be saved so it only happens once');

  const summary = describeStockBaseline(first.baseline, 'Yaba');
  assert.ok(summary);
  assert.match(summary.body, /500 products have no stock recorded yet/);

  // Later checks stay silent too.
  const second = planStockAlerts(products, NEW_BRANCH, first.nextMap);
  assert.equal(second.alerts.length, 0);
  assert.equal(second.baseline, null);
});

test('new branch whose products were copied in at zero quantity: no per-product alerts', () => {
  const products = catalog(300).map((p) => withStock(p, NEW_BRANCH, 0));

  const first = planStockAlerts(products, NEW_BRANCH, null);
  assert.equal(first.alerts.length, 0);
  assert.equal(first.baseline.lowOrOut, 300);

  const second = planStockAlerts(products, NEW_BRANCH, first.nextMap);
  assert.equal(second.alerts.length, 0, 'zero that has not changed since the baseline stays silent');
});

test('stock running down to zero after it was stocked still alerts', () => {
  let products = catalog(50);
  let map = planStockAlerts(products, NEW_BRANCH, null).nextMap;

  // Stock arrives at the new branch: healthy, no alerts.
  products = products.map((p) => withStock(p, NEW_BRANCH, 10));
  let plan = planStockAlerts(products, NEW_BRANCH, map);
  assert.equal(plan.alerts.length, 0);
  assert.equal(plan.restocked.length, 50);
  map = plan.nextMap;

  // One product sells out.
  products[7] = withStock(products[7], NEW_BRANCH, 0);
  plan = planStockAlerts(products, NEW_BRANCH, map);
  assert.equal(plan.alerts.length, 1);
  assert.equal(plan.alerts[0].product.id, 'p7');
  assert.equal(plan.alerts[0].quantity, 0);
  map = plan.nextMap;

  // Checking again does not repeat the alert.
  plan = planStockAlerts(products, NEW_BRANCH, map);
  assert.equal(plan.alerts.length, 0);
});

test('existing behaviour on a branch already being tracked is unchanged', () => {
  const p = product('a', [{ branch_id: MAIN, quantity: 20 }]);
  let map = planStockAlerts([p], MAIN, null).nextMap; // healthy baseline
  assert.deepEqual(map, {});

  // Crosses the reorder level -> low stock alert.
  let plan = planStockAlerts([withStock(p, MAIN, 4)], MAIN, map);
  assert.deepEqual(plan.alerts.map((a) => a.quantity), [4]);
  map = plan.nextMap;

  // Drops further -> alerts again.
  plan = planStockAlerts([withStock(p, MAIN, 0)], MAIN, map);
  assert.deepEqual(plan.alerts.map((a) => a.quantity), [0]);
  map = plan.nextMap;

  // Part restock, still low -> silent, tracked.
  plan = planStockAlerts([withStock(p, MAIN, 2)], MAIN, map);
  assert.equal(plan.alerts.length, 0);
  assert.equal(plan.nextMap.a, 2);
  map = plan.nextMap;

  // Full restock -> reset, so the next drop alerts again.
  plan = planStockAlerts([withStock(p, MAIN, 30)], MAIN, map);
  assert.equal(plan.alerts.length, 0);
  assert.equal(plan.nextMap.a, undefined);
  assert.equal(plan.restocked.length, 1);
  map = plan.nextMap;

  plan = planStockAlerts([withStock(p, MAIN, 5)], MAIN, map);
  assert.deepEqual(plan.alerts.map((a) => a.quantity), [5]);
});

test('first check on a new device summarises existing low stock instead of one alert each', () => {
  const products = [
    product('a', [{ branch_id: MAIN, quantity: 0 }]),
    product('b', [{ branch_id: MAIN, quantity: 2 }]),
    product('c', [{ branch_id: MAIN, quantity: 50 }]),
  ];
  const plan = planStockAlerts(products, MAIN, null);
  assert.equal(plan.alerts.length, 0);
  assert.deepEqual(plan.baseline, { lowOrOut: 2, notStocked: 0 });
  assert.deepEqual(plan.nextMap, { a: 0, b: 2 });
  assert.match(describeStockBaseline(plan.baseline, 'Main').body, /2 products are low or out of stock/);

  // b then sells out -> that is a real drop and alerts.
  const next = planStockAlerts(
    [products[0], withStock(products[1], MAIN, 0), products[2]],
    MAIN,
    plan.nextMap,
  );
  assert.deepEqual(next.alerts.map((a) => a.product.id), ['b']);
});

test('services and inactive products never alert', () => {
  const products = [
    { ...product('s', [{ branch_id: MAIN, quantity: 0 }]), is_service: true },
    { ...product('i', [{ branch_id: MAIN, quantity: 0 }]), is_active: false },
  ];
  const plan = planStockAlerts(products, MAIN, { s: 0, i: 0 });
  assert.equal(plan.alerts.length, 0);
  assert.deepEqual(plan.nextMap, {});
  assert.equal(plan.changed, true);
});

test('a healthy baseline sends no summary', () => {
  assert.equal(describeStockBaseline({ lowOrOut: 0, notStocked: 0 }, 'Main'), null);
});
