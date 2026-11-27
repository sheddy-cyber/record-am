// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanSupplierName,
  findSupplierByName,
  resolvePurchaseSupplier,
  supplierNameKey,
} from '../lib/supplierNames.ts';

const BIZ = 'biz-1';
const supplier = (id, name, extra = {}) => ({
  id,
  name,
  business_id: BIZ,
  is_active: true,
  created_at: '2026-11-01T00:00:00Z',
  ...extra,
});

let nextId = 0;
const createId = () => `new-${++nextId}`;

test('names match ignoring case and extra spaces', () => {
  assert.equal(supplierNameKey('  Mama   Nkechi '), 'mama nkechi');
  assert.equal(supplierNameKey('MAMA NKECHI'), supplierNameKey('mama nkechi'));
  assert.notEqual(supplierNameKey('Mama Nkechi'), supplierNameKey('Mama Nkechi Ltd'));
  assert.equal(cleanSupplierName('  Mama   Nkechi '), 'Mama Nkechi');
});

test('finds an existing supplier whatever the case', () => {
  const list = [supplier('a', 'Dangote Depot'), supplier('b', 'Mama Nkechi')];
  assert.equal(findSupplierByName(list, 'mama nkechi')?.id, 'b');
  assert.equal(findSupplierByName(list, 'MAMA  NKECHI ')?.id, 'b');
  assert.equal(findSupplierByName(list, 'Mama Ngozi'), undefined);
  assert.equal(findSupplierByName(list, '   '), undefined);
});

test('ignores deleted and merged suppliers, other businesses and the supplier being renamed', () => {
  const list = [
    supplier('deleted', 'Acme', { is_active: false }),
    supplier('merged', 'Acme', { merged_into_id: 'x' }),
    supplier('other-biz', 'Acme', { business_id: 'biz-2' }),
  ];
  assert.equal(findSupplierByName(list, 'acme', { businessId: BIZ }), undefined);

  const withLive = [...list, supplier('live', 'Acme')];
  assert.equal(findSupplierByName(withLive, 'ACME', { businessId: BIZ })?.id, 'live');
  assert.equal(findSupplierByName(withLive, 'ACME', { businessId: BIZ, excludeId: 'live' }), undefined);
});

test('a purchase typed with an existing name reuses that supplier and its spelling', () => {
  const known = [supplier('b', 'Mama Nkechi')];

  // Voice and stock-link purchases pass only a name.
  const fromName = resolvePurchaseSupplier({ known, typedName: 'mama nkechi', businessId: BIZ, createId });
  assert.deepEqual({ id: fromName.id, name: fromName.name }, { id: 'b', name: 'Mama Nkechi' });

  // The purchase screen passes a brand new id when it did not spot the match.
  const fromNewId = resolvePurchaseSupplier({
    known,
    typedName: ' MAMA NKECHI',
    businessId: BIZ,
    requestedId: 'fresh-local-id',
    createId,
  });
  assert.equal(fromNewId.id, 'b');
  assert.equal(fromNewId.name, 'Mama Nkechi');
});

test('a new supplier name still creates a supplier', () => {
  const known = [supplier('b', 'Mama Nkechi')];
  const r = resolvePurchaseSupplier({ known, typedName: '  Chidi  Wholesale ', businessId: BIZ, createId });
  assert.match(r.id, /^new-/);
  assert.equal(r.name, 'Chidi Wholesale');
  assert.equal(r.existing, undefined);

  const withId = resolvePurchaseSupplier({ known, typedName: 'Chidi', requestedId: 'given', createId });
  assert.equal(withId.id, 'given');
});

test('a supplier picked from the list is kept', () => {
  const known = [supplier('a', 'Acme'), supplier('b', 'Mama Nkechi')];
  const r = resolvePurchaseSupplier({ known, typedName: 'Acme', requestedId: 'a', createId });
  assert.equal(r.id, 'a');
});

test('editing a purchase keeps its supplier unless the name matches another one', () => {
  const known = [supplier('a', 'Acme'), supplier('b', 'Mama Nkechi')];
  assert.equal(
    resolvePurchaseSupplier({ known, typedName: 'Brand New Name', previousId: 'a', createId }).id,
    'a',
  );
  assert.equal(
    resolvePurchaseSupplier({ known, typedName: 'mama nkechi', previousId: 'a', createId }).id,
    'b',
  );
});

test('no supplier name means no supplier', () => {
  assert.equal(resolvePurchaseSupplier({ known: [], typedName: '   ', createId }), null);
});
