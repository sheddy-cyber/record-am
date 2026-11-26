-- ============================================================================
-- RECORD AM: staff branch lock, protected branch history, reliable staff sync
-- ============================================================================
-- 1. Staff (everyone except the owner) can only see and change records in the
--    branch they are assigned to. Owners keep access to every branch.
-- 2. Sales and other money records can no longer be deleted together with a
--    branch. Branches with history are closed (hidden) instead of deleted.
-- 3. Stock adjustments from several phones add up instead of overwriting each
--    other.
-- Safe to run more than once.

-- ----------------------------------------------------------------------------
-- 1. Closed branches
-- ----------------------------------------------------------------------------
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ----------------------------------------------------------------------------
-- 2. Which branches the signed-in user may work in
-- ----------------------------------------------------------------------------
-- Owners: every branch of their business. Everyone else: the branch they are
-- assigned to (or the main branch if they have none).
CREATE OR REPLACE FUNCTION public.user_branch_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT b.id
      FROM public.branches b
      WHERE EXISTS (
          SELECT 1 FROM public.businesses biz
          WHERE biz.id = b.business_id AND biz.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.business_members bm
          WHERE bm.business_id = b.business_id
            AND bm.user_id = auth.uid()
            AND bm.is_active = TRUE
            AND (
              bm.role = 'owner'
              OR bm.branch_id = b.id
              OR (bm.branch_id IS NULL AND b.is_main = TRUE)
            )
        )
    ),
    ARRAY[]::UUID[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_branch_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_branch_id = ANY(public.user_branch_ids());
$$;

GRANT EXECUTE ON FUNCTION public.can_access_branch(UUID) TO authenticated;

-- Row check for the branches table itself. It looks at the row being checked
-- rather than re-reading branches, so it also works for a branch being created.
CREATE OR REPLACE FUNCTION public.can_see_branch(p_business_id UUID, p_branch_id UUID, p_is_main BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.businesses biz
      WHERE biz.id = p_business_id AND biz.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND (
          bm.role = 'owner'
          OR bm.branch_id = p_branch_id
          OR (bm.branch_id IS NULL AND COALESCE(p_is_main, FALSE))
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_see_branch(UUID, UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Branch lock on every branch-scoped table
-- ----------------------------------------------------------------------------
-- RESTRICTIVE policies are added on top of the existing ones (both must pass),
-- so nothing an owner could do before changes; staff simply stop seeing other
-- branches.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'sales', 'customer_debts', 'expenses', 'purchases',
    'daily_summaries', 'inventory', 'stock_movements'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "branch_scope" ON public.%I', v_table);
      EXECUTE format(
        'CREATE POLICY "branch_scope" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        'USING (branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])) '
        'WITH CHECK (branch_id = ANY ((SELECT public.user_branch_ids())::UUID[]))',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "branch_scope" ON public.sale_items;
CREATE POLICY "branch_scope" ON public.sale_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])
    )
  );

DROP POLICY IF EXISTS "branch_scope" ON public.debt_repayments;
CREATE POLICY "branch_scope" ON public.debt_repayments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_debts d
      WHERE d.id = debt_repayments.debt_id
        AND d.branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customer_debts d
      WHERE d.id = debt_repayments.debt_id
        AND d.branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])
    )
  );

DO $$
BEGIN
  IF to_regclass('public.customer_requests') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "branch_scope" ON public.customer_requests';
    EXECUTE 'CREATE POLICY "branch_scope" ON public.customer_requests AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (branch_id IS NULL OR branch_id = ANY ((SELECT public.user_branch_ids())::UUID[])) '
      'WITH CHECK (branch_id IS NULL OR branch_id = ANY ((SELECT public.user_branch_ids())::UUID[]))';
  END IF;
END;
$$;

-- Staff only see their own branch in branch lists.
DROP POLICY IF EXISTS "branch_scope" ON public.branches;
CREATE POLICY "branch_scope" ON public.branches
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.can_see_branch(business_id, id, is_main));

-- ----------------------------------------------------------------------------
-- 4. Staff-safe views follow the same branch lock
-- ----------------------------------------------------------------------------
-- These views run with their owner's rights (they hide cost prices), so they
-- must filter by branch themselves.
CREATE OR REPLACE VIEW public.staff_sale_items AS
SELECT
  si.id,
  si.sale_id,
  si.product_id,
  si.quantity,
  si.unit_price,
  si.discount_amount,
  si.total_price,
  si.created_at,
  0::numeric(12, 2) AS cost_price
FROM public.sale_items si
WHERE si.sale_id IN (
  SELECT s.id
  FROM public.sales s
  WHERE s.business_id = ANY(public.get_user_business_ids())
    AND s.branch_id = ANY(public.user_branch_ids())
);

CREATE OR REPLACE VIEW public.staff_stock_movements AS
SELECT
  sm.id,
  sm.business_id,
  sm.branch_id,
  sm.product_id,
  sm.type,
  sm.quantity,
  sm.reference,
  sm.notes,
  sm.created_at
FROM public.stock_movements sm
WHERE sm.business_id = ANY(public.get_user_business_ids())
  AND sm.branch_id = ANY(public.user_branch_ids());

CREATE OR REPLACE VIEW public.staff_daily_summaries AS
SELECT
  ds.id,
  ds.business_id,
  ds.branch_id,
  ds.summary_date,
  ds.total_sales,
  ds.total_expenses,
  0::NUMERIC(12, 2) AS total_purchases,
  ds.total_discounts,
  0::NUMERIC(12, 2) AS gross_profit,
  0::NUMERIC(12, 2) AS net_profit,
  ds.cash_in_hand_expected,
  ds.cash_in_hand_actual,
  ds.discrepancy,
  ds.notes,
  ds.closed_by,
  ds.is_closed,
  ds.created_at,
  ds.updated_at
FROM public.daily_summaries ds
WHERE ds.business_id = ANY(public.get_user_business_ids())
  AND ds.branch_id = ANY(public.user_branch_ids());

-- ----------------------------------------------------------------------------
-- 5. Server functions that take a sale or branch respect the branch lock
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_branch_stock(
  p_business_id UUID,
  p_product_id UUID,
  p_from_branch_id UUID,
  p_to_branch_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_authorized BOOLEAN := FALSE;
  v_from_inv_id UUID;
  v_from_qty NUMERIC := 0;
  v_to_qty NUMERIC := 0;
  v_from_name TEXT;
  v_to_name TEXT;
  v_product_cost NUMERIC := 0;
  v_clean_notes TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero';
  END IF;

  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Source and destination branches must be different';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = p_business_id AND b.owner_id = v_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.user_id = v_user_id
        AND bm.is_active = TRUE
        AND bm.role IN ('owner', 'manager')
    )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Only owners and managers can transfer stock between branches';
  END IF;

  -- Branch lock: both branches must be ones this user works in.
  IF NOT (public.can_access_branch(p_from_branch_id) AND public.can_access_branch(p_to_branch_id)) THEN
    RAISE EXCEPTION 'You can only move stock between branches you work in';
  END IF;

  SELECT name INTO v_from_name
  FROM public.branches
  WHERE id = p_from_branch_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source branch not found in this business';
  END IF;

  SELECT name INTO v_to_name
  FROM public.branches
  WHERE id = p_to_branch_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination branch not found in this business';
  END IF;

  SELECT COALESCE(cost_price, 0) INTO v_product_cost
  FROM public.products
  WHERE id = p_product_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found in this business';
  END IF;

  SELECT id, COALESCE(quantity, 0)
  INTO v_from_inv_id, v_from_qty
  FROM public.inventory
  WHERE product_id = p_product_id
    AND branch_id = p_from_branch_id
  FOR UPDATE;

  IF v_from_inv_id IS NULL OR v_from_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock in % (available: %, requested: %)', v_from_name, COALESCE(v_from_qty, 0), p_quantity;
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - p_quantity,
      last_updated = NOW()
  WHERE id = v_from_inv_id
  RETURNING quantity INTO v_from_qty;

  INSERT INTO public.inventory (product_id, branch_id, quantity, last_updated)
  VALUES (p_product_id, p_to_branch_id, p_quantity, NOW())
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET
    quantity = COALESCE(public.inventory.quantity, 0) + EXCLUDED.quantity,
    last_updated = NOW()
  RETURNING quantity INTO v_to_qty;

  v_clean_notes := NULLIF(BTRIM(COALESCE(p_notes, '')), '');

  INSERT INTO public.stock_movements (
    business_id,
    branch_id,
    product_id,
    type,
    quantity,
    unit_cost,
    total_cost,
    reference,
    notes,
    performed_by
  )
  VALUES
    (
      p_business_id,
      p_from_branch_id,
      p_product_id,
      'transfer_out',
      -p_quantity,
      v_product_cost,
      v_product_cost * p_quantity,
      'Transfer to ' || v_to_name,
      COALESCE(v_clean_notes, 'Branch stock transfer out'),
      v_user_id
    ),
    (
      p_business_id,
      p_to_branch_id,
      p_product_id,
      'transfer_in',
      p_quantity,
      v_product_cost,
      v_product_cost * p_quantity,
      'Transfer from ' || v_from_name,
      COALESCE(v_clean_notes, 'Branch stock transfer in'),
      v_user_id
    );

  RETURN jsonb_build_object(
    'success', TRUE,
    'from_quantity', v_from_qty,
    'to_quantity', v_to_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_branch_stock(UUID, UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_sale_items_for_sale(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_business_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT s.business_id
  INTO v_business_id
  FROM public.sales s
  WHERE s.id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', TRUE, 'deleted', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = v_business_id
      AND bm.user_id = v_user_id
      AND bm.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Permission denied for this business';
  END IF;

  -- Branch lock.
  IF NOT EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = p_sale_id AND public.can_access_branch(s.branch_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied for this branch';
  END IF;

  DELETE FROM public.sale_items
  WHERE sale_id = p_sale_id;

  RETURN jsonb_build_object('success', TRUE, 'sale_id', p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_sale_items_for_sale(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_sale_record_atomic(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale public.sales%ROWTYPE;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', TRUE, 'already_deleted', TRUE);
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = v_sale.business_id AND b.owner_id = v_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = v_sale.business_id
        AND bm.user_id = v_user_id
        AND bm.is_active = TRUE
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Branch lock.
  IF NOT public.can_access_branch(v_sale.branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this branch';
  END IF;

  FOR v_item IN
    SELECT si.product_id, si.quantity, COALESCE(p.is_service, FALSE) AS is_service
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id
  LOOP
    IF v_item.product_id IS NOT NULL AND NOT v_item.is_service THEN
      INSERT INTO public.inventory (product_id, branch_id, quantity, last_updated)
      VALUES (v_item.product_id, v_sale.branch_id, v_item.quantity, NOW())
      ON CONFLICT (product_id, branch_id)
      DO UPDATE SET
        quantity = COALESCE(public.inventory.quantity, 0) + EXCLUDED.quantity,
        last_updated = NOW();
    END IF;
  END LOOP;

  DELETE FROM public.debt_repayments
  WHERE debt_id IN (
    SELECT id FROM public.customer_debts WHERE sale_id = p_sale_id
  );

  DELETE FROM public.customer_debts
  WHERE sale_id = p_sale_id;

  DELETE FROM public.sale_items
  WHERE sale_id = p_sale_id;

  DELETE FROM public.sales
  WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', TRUE, 'sale_id', p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_sale_record_atomic(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_daily_summary_close(
  p_id UUID,
  p_business_id UUID,
  p_branch_id UUID,
  p_summary_date DATE,
  p_total_sales NUMERIC,
  p_total_expenses NUMERIC,
  p_total_purchases NUMERIC DEFAULT 0,
  p_total_discounts NUMERIC DEFAULT 0,
  p_cash_in_hand_expected NUMERIC DEFAULT 0,
  p_cash_in_hand_actual NUMERIC DEFAULT 0,
  p_discrepancy NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_member BOOLEAN := FALSE;
  v_computed_purchases NUMERIC := COALESCE(p_total_purchases, 0);
  v_total_cogs NUMERIC := 0;
  v_gross_profit NUMERIC := 0;
  v_net_profit NUMERIC := 0;
  v_summary_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = p_business_id AND b.owner_id = v_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.user_id = v_user_id
        AND bm.is_active = TRUE
    )
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Branch lock.
  IF NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this branch';
  END IF;

  -- Compute server-side COGS and purchases for accurate financial reporting
  -- without exposing cost_price back to restricted roles.
  SELECT COALESCE(SUM(COALESCE(p.amount_paid, 0)), 0)
  INTO v_computed_purchases
  FROM public.purchases p
  WHERE p.business_id = p_business_id
    AND p.branch_id = p_branch_id
    AND p.purchase_date = p_summary_date;

  SELECT COALESCE(
    SUM(
      GREATEST(COALESCE(si.cost_price, pr.cost_price, 0), 0) * COALESCE(si.quantity, 0)
    ),
    0
  )
  INTO v_total_cogs
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  LEFT JOIN public.products pr ON pr.id = si.product_id
  WHERE s.business_id = p_business_id
    AND s.branch_id = p_branch_id
    AND (s.created_at AT TIME ZONE 'UTC')::DATE = p_summary_date;

  v_gross_profit := COALESCE(p_total_sales, 0) - v_total_cogs;
  v_net_profit := v_gross_profit - COALESCE(p_total_expenses, 0);

  INSERT INTO public.daily_summaries (
    id,
    business_id,
    branch_id,
    summary_date,
    total_sales,
    total_expenses,
    total_purchases,
    total_discounts,
    gross_profit,
    net_profit,
    cash_in_hand_expected,
    cash_in_hand_actual,
    discrepancy,
    notes,
    closed_by,
    is_closed,
    updated_at
  )
  VALUES (
    COALESCE(p_id, uuid_generate_v4()),
    p_business_id,
    p_branch_id,
    p_summary_date,
    COALESCE(p_total_sales, 0),
    COALESCE(p_total_expenses, 0),
    v_computed_purchases,
    COALESCE(p_total_discounts, 0),
    v_gross_profit,
    v_net_profit,
    COALESCE(p_cash_in_hand_expected, 0),
    COALESCE(p_cash_in_hand_actual, 0),
    COALESCE(p_discrepancy, 0),
    p_notes,
    v_user_id,
    TRUE,
    NOW()
  )
  ON CONFLICT (business_id, branch_id, summary_date)
  DO UPDATE SET
    total_sales = EXCLUDED.total_sales,
    total_expenses = EXCLUDED.total_expenses,
    total_purchases = EXCLUDED.total_purchases,
    total_discounts = EXCLUDED.total_discounts,
    gross_profit = EXCLUDED.gross_profit,
    net_profit = EXCLUDED.net_profit,
    cash_in_hand_expected = EXCLUDED.cash_in_hand_expected,
    cash_in_hand_actual = EXCLUDED.cash_in_hand_actual,
    discrepancy = EXCLUDED.discrepancy,
    notes = EXCLUDED.notes,
    closed_by = EXCLUDED.closed_by,
    is_closed = TRUE,
    updated_at = NOW()
  RETURNING id INTO v_summary_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'id', v_summary_id,
    'summary_date', p_summary_date,
    'is_closed', TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_daily_summary_close(
  UUID, UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Sales and money records survive a branch: deleting a branch that has any
--    is refused (close it instead).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.branches'::regclass
      AND a.attname = 'branch_id'
      AND c.confdeltype <> 'r'
      AND c.conrelid IN (
        SELECT x FROM unnest(ARRAY[
          to_regclass('public.sales'),
          to_regclass('public.customer_debts'),
          to_regclass('public.expenses'),
          to_regclass('public.purchases'),
          to_regclass('public.daily_summaries')
        ]) AS x
        WHERE x IS NOT NULL
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT',
      r.tbl, r.conname
    );
  END LOOP;
END;
$$;

-- Close or reopen a branch. Closing hides it from staff, the branch switcher and
-- stock transfers, keeps all of its records, and moves its staff to the main
-- branch so nobody is left assigned to a closed branch.
CREATE OR REPLACE FUNCTION public.set_branch_open(p_branch_id UUID, p_open BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_branch public.branches%ROWTYPE;
  v_main_id UUID;
  v_moved INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_branch.business_id AND b.owner_id = v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = v_branch.business_id
        AND bm.user_id = v_user_id
        AND bm.is_active = TRUE
        AND bm.role = 'owner'
    )
  ) THEN
    RAISE EXCEPTION 'Only the owner can close or reopen branches';
  END IF;

  IF NOT p_open AND v_branch.is_main THEN
    RAISE EXCEPTION 'The main branch cannot be closed. Make another branch the main branch first.';
  END IF;

  UPDATE public.branches
  SET is_active = p_open, updated_at = NOW()
  WHERE id = p_branch_id;

  IF NOT p_open THEN
    SELECT id INTO v_main_id
    FROM public.branches
    WHERE business_id = v_branch.business_id AND is_main = TRUE
    LIMIT 1;

    UPDATE public.business_members
    SET branch_id = v_main_id
    WHERE business_id = v_branch.business_id
      AND branch_id = p_branch_id
      AND role <> 'owner';
    GET DIAGNOSTICS v_moved = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'branch_id', p_branch_id, 'is_active', p_open, 'staff_moved', v_moved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_branch_open(UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Atomic stock adjustment
-- ----------------------------------------------------------------------------
-- Adds a change to the current quantity in one statement, so two phones
-- selling the same product at the same moment both count. Runs with the
-- caller's rights, so the usual inventory and branch rules apply.
CREATE OR REPLACE FUNCTION public.adjust_inventory_quantity(
  p_product_id UUID,
  p_branch_id UUID,
  p_delta NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quantity NUMERIC;
BEGIN
  INSERT INTO public.inventory (product_id, branch_id, quantity, last_updated)
  VALUES (p_product_id, p_branch_id, GREATEST(0, COALESCE(p_delta, 0)), NOW())
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET
    quantity = GREATEST(0, ROUND(COALESCE(public.inventory.quantity, 0) + COALESCE(p_delta, 0), 2)),
    last_updated = NOW()
  RETURNING quantity INTO v_quantity;

  RETURN v_quantity;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_quantity(UUID, UUID, NUMERIC) TO authenticated;
