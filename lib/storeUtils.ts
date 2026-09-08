/**
 * Fast comparison utilities for Zustand stores to prevent costly JSON.stringify
 * allocations and serialization on large arrays of database models.
 */

export function hasArrayChanged<T extends Record<string, any>>(
  prev: T[] | null | undefined,
  next: T[] | null | undefined,
  keyField: keyof T = 'id' as keyof T
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;

  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];

    if (a === b) continue;
    if (!a || !b) return true;

    // Check primary key
    if (a[keyField] !== b[keyField]) return true;

    // Fast path: timestamps
    if (a.updated_at !== undefined && b.updated_at !== undefined) {
      if (a.updated_at !== b.updated_at) return true;
    }
    if (a.created_at !== undefined && b.created_at !== undefined) {
      if (a.created_at !== b.created_at) return true;
    }

    // Shallow check of own properties
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return true;

    for (let j = 0; j < keysA.length; j++) {
      const k = keysA[j];
      const valA = a[k];
      const valB = b[k];

      if (valA === valB) continue;

      // If nested object or array, check if both are objects
      if (typeof valA === 'object' && valA !== null && typeof valB === 'object' && valB !== null) {
        if (JSON.stringify(valA) !== JSON.stringify(valB)) {
          return true;
        }
      } else {
        return true;
      }
    }
  }

  return false;
}
