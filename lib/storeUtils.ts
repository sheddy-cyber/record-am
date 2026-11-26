/**
 * Fast comparison utilities for Zustand stores to prevent costly JSON.stringify
 * allocations and serialization on large arrays of database models.
 */

export function hasArrayChanged<T extends Record<string, any>>(
  prev: T[] | null | undefined,
  next: T[] | null | undefined,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    if (!deepEqual(prev[i], next[i])) return true;
  }
  return false;
}

/** Structural deep equality for plain JSON-like data (store rows, stats). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // NaN-safe for numbers; everything else already compared by identity.
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEqual(x[i], y[i])) return false;
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  // Treat a missing key and an undefined value as the same thing: cached JSON
  // drops undefined fields while freshly built objects keep them.
  let yDefined = 0;
  for (const k in y) if (y[k] !== undefined) yDefined++;
  let xDefined = 0;
  for (const k of keys) {
    if (x[k] === undefined) continue;
    xDefined++;
    if (!deepEqual(x[k], y[k])) return false;
  }
  return xDefined === yDefined;
}

/**
 * Returns `next`, but reuses every row of `prev` that is unchanged (matched by
 * key), and returns `prev` itself when nothing changed at all. Lists built from
 * a refresh therefore keep their object identities, so memoised rows do not
 * re-render and nothing on screen shifts when the server sends the same data.
 */
export function reconcileList<T>(
  prev: readonly T[] | null | undefined,
  next: T[],
  getKey: (item: T) => string = (item) => (item as any).id,
): T[] {
  if (!prev || prev.length === 0) return next;
  if ((prev as T[]) === next) return next;
  const byKey = new Map<string, T>();
  for (const item of prev) byKey.set(getKey(item), item);
  let same = prev.length === next.length;
  const out = new Array<T>(next.length);
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const old = byKey.get(getKey(item));
    const kept = old !== undefined && deepEqual(old, item) ? old : item;
    out[i] = kept;
    if (same && kept !== prev[i]) same = false;
  }
  return same ? (prev as T[]) : out;
}

/** Returns `prev` when `next` is deeply equal to it, otherwise `next`. */
export function reconcileValue<T>(prev: T, next: T): T {
  return deepEqual(prev, next) ? prev : next;
}

/**
 * Reads every row of a query in pages of `pageSize` (PostgREST caps a single
 * response, so larger tables would otherwise be silently truncated). `build`
 * receives the inclusive row range for each page and must apply a stable order.
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) rows.push(row);
    if (page.length < pageSize) return rows;
  }
}
