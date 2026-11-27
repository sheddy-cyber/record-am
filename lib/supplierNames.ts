/**
 * One supplier per name in a business. Names match ignoring letter case,
 * leading/trailing spaces and repeated spaces, so "Mama Nkechi", "mama nkechi"
 * and " Mama  Nkechi " are the same supplier.
 *
 * Must stay in step with public.supplier_name_key() in
 * supabase/migrations/20261127150000_unique_supplier_names.sql.
 * Kept free of app imports so it can be unit tested with plain Node.
 */

export function supplierNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tidies a typed name for saving: trimmed, single spaces, casing kept. */
export function cleanSupplierName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

interface NamedSupplier {
  id: string;
  name: string;
  business_id?: string;
  is_active?: boolean | null;
  merged_into_id?: string | null;
}

/** True for a supplier that is still in use (not deleted, not merged into another). */
export function isLiveSupplier(supplier: NamedSupplier): boolean {
  return supplier.is_active !== false && !supplier.merged_into_id;
}

/**
 * The live supplier with this name, if any.
 * @param excludeId ignore this supplier (the one being renamed).
 */
export function findSupplierByName<T extends NamedSupplier>(
  suppliers: readonly T[],
  name: string | null | undefined,
  options: { businessId?: string; excludeId?: string } = {},
): T | undefined {
  const key = supplierNameKey(name);
  if (!key) return undefined;
  return suppliers.find(
    (supplier) =>
      supplier.id !== options.excludeId &&
      (!options.businessId || !supplier.business_id || supplier.business_id === options.businessId) &&
      isLiveSupplier(supplier) &&
      supplierNameKey(supplier.name) === key,
  );
}

/**
 * Which supplier a purchase belongs to. Reuses the supplier that already has
 * the typed name instead of making a copy. A requested id (from a picker)
 * wins when it is a supplier we know, or when no supplier has the typed name.
 * Returns null when no supplier name was given.
 */
export function resolvePurchaseSupplier<T extends NamedSupplier>(params: {
  known: readonly T[];
  typedName: string;
  businessId?: string;
  requestedId?: string;
  /** The supplier of the purchase being edited, if any. */
  previousId?: string;
  createId: () => string;
}): { id: string; name: string; existing?: T } | null {
  const typedName = cleanSupplierName(params.typedName);
  if (!typedName) return null;

  const sameName = findSupplierByName(params.known, typedName, { businessId: params.businessId });
  const requestedKnown = Boolean(params.requestedId && params.known.some((s) => s.id === params.requestedId));
  const id =
    params.requestedId && (requestedKnown || !sameName)
      ? params.requestedId
      : sameName?.id || params.previousId || params.createId();

  const existing = params.known.find((s) => s.id === id);
  // Keep the saved spelling when the typed name is the same supplier.
  const name =
    existing && supplierNameKey(existing.name) === supplierNameKey(typedName) ? existing.name : typedName;
  return { id, name, existing };
}

export function duplicateSupplierMessage(existingName: string): string {
  return `A supplier named "${existingName}" already exists. Use that supplier instead of adding it again.`;
}
