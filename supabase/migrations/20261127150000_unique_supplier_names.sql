-- ============================================================================
-- RECORD AM: one supplier per name
-- ============================================================================
-- Testers ended up with several supplier records for the same supplier
-- ("Mama Nkechi", "mama nkechi ", ...). This migration:
--
-- 1. Merges existing duplicates. Within a business, active suppliers whose
--    names match ignoring case and extra spaces are folded into the OLDEST
--    one. Their purchases, supplier debts and anything else that points at a
--    supplier are moved to it; contact details it lacks are copied over and
--    differing ones are kept in its notes. The duplicates are not deleted:
--    they are switched off (is_active = false) and keep merged_into_id, so the
--    merge can be traced.
-- 2. Stops new duplicates: a unique index on (business, name ignoring case and
--    spaces) for active suppliers.
-- 3. Keeps phones that were offline in step: a supplier synced later under a
--    name that already exists is folded into the existing supplier instead of
--    failing, and purchases or debts that point at a merged supplier are
--    moved to the one it was merged into. Renaming a supplier to another
--    supplier's name is refused.
--
-- To see what step 1 will merge before running this, run:
--
--   SELECT business_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS name_key,
--          count(*) AS copies, array_agg(name ORDER BY created_at) AS names
--   FROM public.suppliers
--   WHERE is_active
--   GROUP BY 1, 2
--   HAVING count(*) > 1
--   ORDER BY copies DESC;
--
-- Safe to run more than once.

-- ----------------------------------------------------------------------------
-- 1. Column and name key
-- ----------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Must match supplierNameKey() in lib/supplierNames.ts.
CREATE OR REPLACE FUNCTION public.supplier_name_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- 2. Move everything that points at one supplier to another
-- ----------------------------------------------------------------------------
-- Finds every foreign key to suppliers (purchases, supplier_debts and any
-- added later), so nothing is left pointing at the duplicate.
CREATE OR REPLACE FUNCTION public.merge_supplier_into(p_from UUID, p_into UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_ref RECORD;
BEGIN
  IF p_from IS NULL OR p_into IS NULL OR p_from = p_into THEN
    RETURN;
  END IF;

  SELECT name INTO v_name FROM public.suppliers WHERE id = p_into;

  -- Debts also store the supplier's name as text.
  UPDATE public.supplier_debts
  SET supplier_name = v_name
  WHERE supplier_id = p_from AND v_name IS NOT NULL;

  FOR v_ref IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.suppliers'::regclass
      AND c.conrelid <> 'public.suppliers'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col)
      USING p_into, p_from;
  END LOOP;

  -- Suppliers merged into p_from earlier now point straight at p_into.
  UPDATE public.suppliers SET merged_into_id = p_into WHERE merged_into_id = p_from;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_supplier_into(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_supplier_into(UUID, UUID) FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Merge the duplicates that already exist
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_group RECORD;
  v_keep public.suppliers%ROWTYPE;
  v_dup public.suppliers%ROWTYPE;
  v_notes TEXT;
  v_merged INT := 0;
BEGIN
  FOR v_group IN
    SELECT business_id, public.supplier_name_key(name) AS name_key
    FROM public.suppliers
    WHERE is_active AND merged_into_id IS NULL
    GROUP BY 1, 2
    HAVING count(*) > 1
  LOOP
    SELECT * INTO v_keep
    FROM public.suppliers
    WHERE business_id = v_group.business_id
      AND public.supplier_name_key(name) = v_group.name_key
      AND is_active AND merged_into_id IS NULL
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;

    FOR v_dup IN
      SELECT *
      FROM public.suppliers
      WHERE business_id = v_group.business_id
        AND public.supplier_name_key(name) = v_group.name_key
        AND is_active AND merged_into_id IS NULL
        AND id <> v_keep.id
      ORDER BY created_at NULLS LAST, id
    LOOP
      SELECT * INTO v_keep FROM public.suppliers WHERE id = v_keep.id;
      v_notes := NULLIF(btrim(COALESCE(v_keep.notes, '')), '');

      -- Contact details the kept supplier lacks are copied; differing ones go in its notes.
      IF NULLIF(btrim(v_keep.phone), '') IS NOT NULL AND NULLIF(btrim(v_dup.phone), '') IS NOT NULL
         AND btrim(v_dup.phone) <> btrim(v_keep.phone)
         AND position(btrim(v_dup.phone) IN COALESCE(v_notes, '')) = 0 THEN
        v_notes := concat_ws(E'\n', v_notes, 'Other phone: ' || btrim(v_dup.phone));
      END IF;
      IF NULLIF(btrim(v_keep.email), '') IS NOT NULL AND NULLIF(btrim(v_dup.email), '') IS NOT NULL
         AND lower(btrim(v_dup.email)) <> lower(btrim(v_keep.email))
         AND position(lower(btrim(v_dup.email)) IN lower(COALESCE(v_notes, ''))) = 0 THEN
        v_notes := concat_ws(E'\n', v_notes, 'Other email: ' || btrim(v_dup.email));
      END IF;
      IF NULLIF(btrim(v_keep.address), '') IS NOT NULL AND NULLIF(btrim(v_dup.address), '') IS NOT NULL
         AND lower(btrim(v_dup.address)) <> lower(btrim(v_keep.address))
         AND position(lower(btrim(v_dup.address)) IN lower(COALESCE(v_notes, ''))) = 0 THEN
        v_notes := concat_ws(E'\n', v_notes, 'Other address: ' || btrim(v_dup.address));
      END IF;
      IF NULLIF(btrim(v_dup.notes), '') IS NOT NULL
         AND position(lower(btrim(v_dup.notes)) IN lower(COALESCE(v_notes, ''))) = 0 THEN
        v_notes := concat_ws(E'\n', v_notes, btrim(v_dup.notes));
      END IF;

      PERFORM public.merge_supplier_into(v_dup.id, v_keep.id);

      -- Switch the duplicate off before touching the kept supplier, so the
      -- kept one is never seen next to an active copy of itself.
      UPDATE public.suppliers
      SET is_active = FALSE, merged_into_id = v_keep.id, updated_at = NOW()
      WHERE id = v_dup.id;

      UPDATE public.suppliers
      SET phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(v_dup.phone), '')),
          email = COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(v_dup.email), '')),
          address = COALESCE(NULLIF(btrim(address), ''), NULLIF(btrim(v_dup.address), '')),
          notes = v_notes,
          updated_at = NOW()
      WHERE id = v_keep.id;

      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Merged % duplicate supplier record(s)', v_merged;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. One active supplier per name
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_business_name_key_unique
  ON public.suppliers (business_id, public.supplier_name_key(name))
  WHERE is_active AND merged_into_id IS NULL;

-- New or re-activated supplier with a name that is taken: fold it into the
-- existing supplier (a phone that was offline did not know about it).
-- Renaming a supplier to a name that is taken: refuse.
CREATE OR REPLACE FUNCTION public.guard_supplier_duplicates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_existing UUID;
BEGIN
  -- An upsert of a row that already exists runs the UPDATE trigger next; decide there.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.suppliers WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Once merged, a supplier stays merged (an old phone may still upsert it).
  IF TG_OP = 'UPDATE' AND OLD.merged_into_id IS NOT NULL THEN
    NEW.merged_into_id := COALESCE(NEW.merged_into_id, OLD.merged_into_id);
    NEW.is_active := FALSE;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.is_active, FALSE) OR NEW.merged_into_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_key := public.supplier_name_key(NEW.name);
  IF v_key = '' THEN
    RETURN NEW;
  END IF;

  -- Two phones syncing the same new name at once: one waits for the other.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::TEXT || ':' || v_key, 0));

  SELECT id INTO v_existing
  FROM public.suppliers
  WHERE business_id = NEW.business_id
    AND id <> NEW.id
    AND is_active AND merged_into_id IS NULL
    AND public.supplier_name_key(name) = v_key
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;

  IF v_existing IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_active, FALSE)
     AND public.supplier_name_key(OLD.name) <> v_key THEN
    RAISE EXCEPTION 'A supplier named "%" already exists', btrim(NEW.name)
      USING ERRCODE = 'unique_violation';
  END IF;

  NEW.is_active := FALSE;
  NEW.merged_into_id := v_existing;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supplier_duplicates ON public.suppliers;
CREATE TRIGGER trg_guard_supplier_duplicates
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_duplicates();

-- A supplier that was just folded in: move what pointed at it.
CREATE OR REPLACE FUNCTION public.move_refs_of_merged_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.merge_supplier_into(NEW.id, NEW.merged_into_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_move_refs_of_merged_supplier ON public.suppliers;
CREATE TRIGGER trg_move_refs_of_merged_supplier
  AFTER UPDATE ON public.suppliers
  FOR EACH ROW
  WHEN (NEW.merged_into_id IS NOT NULL AND OLD.merged_into_id IS DISTINCT FROM NEW.merged_into_id)
  EXECUTE FUNCTION public.move_refs_of_merged_supplier();

-- ----------------------------------------------------------------------------
-- 5. Purchases, debts, etc. saved later against a merged supplier
-- ----------------------------------------------------------------------------
-- TG_ARGV[0] is the column holding the supplier id.
CREATE OR REPLACE FUNCTION public.remap_merged_supplier_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_id UUID;
  v_next UUID;
  v_hops INT := 0;
  v_patch JSONB;
BEGIN
  v_id := NULLIF(to_jsonb(NEW) ->> v_col, '')::UUID;
  IF v_id IS NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    SELECT merged_into_id INTO v_next FROM public.suppliers WHERE id = v_id;
    EXIT WHEN v_next IS NULL OR v_hops >= 10;
    v_id := v_next;
    v_hops := v_hops + 1;
  END LOOP;

  IF v_hops = 0 THEN
    RETURN NEW;
  END IF;

  v_patch := jsonb_build_object(v_col, v_id);
  IF to_jsonb(NEW) ? 'supplier_name' THEN
    v_patch := v_patch || jsonb_build_object(
      'supplier_name', (SELECT name FROM public.suppliers WHERE id = v_id)
    );
  END IF;
  NEW := jsonb_populate_record(NEW, v_patch);
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_ref RECORD;
BEGIN
  FOR v_ref IN
    SELECT c.conrelid::regclass AS tbl, c.conrelid AS rel, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.suppliers'::regclass
      AND c.conrelid <> 'public.suppliers'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', 'trg_remap_merged_supplier_' || v_ref.col, v_ref.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %s FOR EACH ROW EXECUTE FUNCTION public.remap_merged_supplier_ref(%L)',
      'trg_remap_merged_supplier_' || v_ref.col, v_ref.col, v_ref.tbl, v_ref.col
    );
  END LOOP;
END;
$$;
