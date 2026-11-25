-- Multi-branch management, automatic Staff ID on join, business logo storage,
-- staff sync RPCs, and Realtime publication setup.

-- ============================================================================
-- 1. STAFF ID ON BUSINESS MEMBERS
-- ============================================================================
ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS staff_id TEXT;

CREATE OR REPLACE FUNCTION public.generate_staff_id(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_seq BIGINT := 0;
  v_candidate TEXT;
BEGIN
  -- Serialize Staff ID generation per business to avoid duplicate sequence numbers.
  PERFORM pg_advisory_xact_lock(hashtext('staff_id:' || p_business_id::TEXT));

  SELECT COALESCE(MAX((substring(bm.staff_id FROM '^STF-([0-9]+)$'))::BIGINT), 0)
  INTO v_max_seq
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id
    AND bm.staff_id ~ '^STF-[0-9]+$';

  LOOP
    v_max_seq := v_max_seq + 1;
    v_candidate := 'STF-' || LPAD(v_max_seq::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.staff_id = v_candidate
    );
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_staff_id_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.staff_id IS NULL OR BTRIM(NEW.staff_id) = '' THEN
    NEW.staff_id := public.generate_staff_id(NEW.business_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_staff_id ON public.business_members;
CREATE TRIGGER trg_assign_staff_id
  BEFORE INSERT ON public.business_members
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_staff_id_before_insert();

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, business_id
    FROM public.business_members
    WHERE staff_id IS NULL OR BTRIM(staff_id) = ''
    ORDER BY business_id, COALESCE(joined_at, invited_at) ASC NULLS LAST, id ASC
  LOOP
    UPDATE public.business_members
    SET staff_id = public.generate_staff_id(rec.business_id)
    WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_business_staff_id
  ON public.business_members (business_id, staff_id)
  WHERE staff_id IS NOT NULL;

-- ============================================================================
-- 2. JOIN BUSINESS RPC (preserves UUID signature, returns member + staff_id)
-- ============================================================================
DROP FUNCTION IF EXISTS public.join_business_by_id(UUID);

CREATE FUNCTION public.join_business_by_id(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_business public.businesses%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_member public.business_members%ROWTYPE;
  v_existing public.business_members%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required. Please sign in and try again.'
    );
  END IF;

  SELECT *
  INTO v_business
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Business not found. Please check the Business ID and try again.'
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.business_members
  WHERE business_id = p_business_id
    AND user_id = v_user_id
  LIMIT 1;

  IF FOUND THEN
    IF NOT COALESCE(v_existing.is_active, TRUE) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Your membership in this business is inactive. Contact the business owner.'
      );
    END IF;

    IF v_existing.staff_id IS NULL OR BTRIM(v_existing.staff_id) = '' THEN
      UPDATE public.business_members
      SET staff_id = public.generate_staff_id(p_business_id)
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    IF v_existing.branch_id IS NOT NULL THEN
      SELECT * INTO v_branch FROM public.branches WHERE id = v_existing.branch_id;
    END IF;

    IF v_branch.id IS NULL THEN
      SELECT *
      INTO v_branch
      FROM public.branches
      WHERE business_id = p_business_id
      ORDER BY is_main DESC, created_at ASC
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'success', TRUE,
      'already_member', TRUE,
      'role', v_existing.role,
      'staff_id', v_existing.staff_id,
      'member', to_jsonb(v_existing),
      'business', to_jsonb(v_business),
      'branch', to_jsonb(v_branch)
    );
  END IF;

  SELECT *
  INTO v_branch
  FROM public.branches
  WHERE business_id = p_business_id
  ORDER BY is_main DESC, created_at ASC
  LIMIT 1;

  INSERT INTO public.business_members (
    business_id,
    user_id,
    branch_id,
    role,
    is_active,
    joined_at
  )
  VALUES (
    p_business_id,
    v_user_id,
    v_branch.id,
    'cashier',
    TRUE,
    NOW()
  )
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', TRUE,
    'already_member', FALSE,
    'role', v_member.role,
    'staff_id', v_member.staff_id,
    'member', to_jsonb(v_member),
    'business', to_jsonb(v_business),
    'branch', to_jsonb(v_branch)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_business_by_id(UUID) TO authenticated;

-- ============================================================================
-- 3. BRANCHES, BUSINESSES & TEAM MEMBERS RLS UPDATES
-- ============================================================================
DROP POLICY IF EXISTS "Members can access branches" ON public.branches;
DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_insert" ON public.branches;
DROP POLICY IF EXISTS "branches_update" ON public.branches;
DROP POLICY IF EXISTS "branches_delete" ON public.branches;

CREATE POLICY "branches_select"
  ON public.branches
  FOR SELECT
  USING (
    business_id = ANY(public.get_user_business_ids())
    OR EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = branches.business_id
        AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "branches_insert"
  ON public.branches
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = branches.business_id
        AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = branches.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.role = 'owner'
    )
  );

CREATE POLICY "branches_update"
  ON public.branches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = branches.business_id
        AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = branches.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = branches.business_id
        AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = branches.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.role = 'owner'
    )
  );

CREATE POLICY "branches_delete"
  ON public.branches
  FOR DELETE
  USING (
    is_main = FALSE
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id = branches.business_id
          AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members bm
        WHERE bm.business_id = branches.business_id
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.role = 'owner'
      )
    )
  );

DROP POLICY IF EXISTS "Owners can update businesses" ON public.businesses;
DROP POLICY IF EXISTS "Owners and managers can update businesses" ON public.businesses;
DROP POLICY IF EXISTS "businesses_update" ON public.businesses;

CREATE POLICY "businesses_update"
  ON public.businesses
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = businesses.id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = businesses.id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.role IN ('owner', 'manager')
    )
  );

-- Allow authenticated members to view business memberships cleanly
DROP POLICY IF EXISTS "Members can view their business memberships" ON public.business_members;
DROP POLICY IF EXISTS "members_select" ON public.business_members;
DROP POLICY IF EXISTS "bm_select" ON public.business_members;

CREATE POLICY "bm_select"
  ON public.business_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR business_id = ANY(public.get_user_business_ids())
  );

-- Allow owners/managers to assign branches & roles on team members (protecting owners from non-owners)
DROP POLICY IF EXISTS "Owners can manage members" ON public.business_members;
DROP POLICY IF EXISTS "members_insert" ON public.business_members;
DROP POLICY IF EXISTS "members_update" ON public.business_members;
DROP POLICY IF EXISTS "members_delete" ON public.business_members;
DROP POLICY IF EXISTS "bm_insert" ON public.business_members;
DROP POLICY IF EXISTS "bm_update" ON public.business_members;
DROP POLICY IF EXISTS "bm_delete" ON public.business_members;

CREATE POLICY "bm_insert"
  ON public.business_members
  FOR INSERT
  WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR (
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = business_members.business_id
          AND b.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "bm_update"
  ON public.business_members
  FOR UPDATE
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.business_members actor
      WHERE actor.business_id = business_members.business_id
        AND actor.user_id = auth.uid()
        AND actor.is_active = TRUE
        AND (
          actor.role = 'owner'
          OR (actor.role = 'manager' AND business_members.role <> 'owner')
        )
    )
  )
  WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.business_members actor
      WHERE actor.business_id = business_members.business_id
        AND actor.user_id = auth.uid()
        AND actor.is_active = TRUE
        AND (
          actor.role = 'owner'
          OR (actor.role = 'manager' AND business_members.role <> 'owner')
        )
    )
  );

CREATE POLICY "bm_delete"
  ON public.business_members
  FOR DELETE
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.business_members actor
      WHERE actor.business_id = business_members.business_id
        AND actor.user_id = auth.uid()
        AND actor.is_active = TRUE
        AND actor.role = 'owner'
        AND business_members.role <> 'owner'
    )
  );

-- ============================================================================
-- 4. MULTI-BRANCH ATOMIC RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_main_branch(
  p_business_id UUID,
  p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_owner BOOLEAN := FALSE;
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
        AND bm.role = 'owner'
    )
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only the business owner can change the main branch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = p_branch_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to this business';
  END IF;

  UPDATE public.branches
  SET is_main = (id = p_branch_id),
      updated_at = NOW()
  WHERE business_id = p_business_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_main_branch(UUID, UUID) TO authenticated;

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

-- ============================================================================
-- 5. STAFF-SAFE SYNC, EDIT, DELETE & DAILY SUMMARY RPCs / VIEWS
-- ============================================================================
-- Staff-safe view of daily summaries (masks cost/profit fields from cashiers)
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
WHERE ds.business_id = ANY(public.get_user_business_ids());

GRANT SELECT ON public.staff_daily_summaries TO authenticated;
ALTER VIEW public.staff_daily_summaries SET (security_invoker = false);

-- Allows cashiers and owners to clear sale_items during offline sale edits
-- without needing direct SELECT RLS on sale_items.cost_price.
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

  DELETE FROM public.sale_items
  WHERE sale_id = p_sale_id;

  RETURN jsonb_build_object('success', TRUE, 'sale_id', p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_sale_items_for_sale(UUID) TO authenticated;

-- Atomic sale deletion usable by both owners and authorized staff:
-- restores branch inventory from sale_items, deletes linked debts, deletes sale.
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

-- Allows any active business member (including cashiers) to close the daily register
-- while computing profit/purchase metrics server-side so owner margins stay intact.
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

-- ============================================================================
-- 6. BUSINESS LOGOS STORAGE BUCKET & POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-logos',
  'business-logos',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id)
DO UPDATE SET
  public = TRUE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "Business logos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Business managers can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Business managers can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Business managers can delete logos" ON storage.objects;

CREATE POLICY "Business logos are publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'business-logos');

CREATE POLICY "Business managers can upload logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::TEXT = (storage.foldername(name))[1]
          AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members bm
        WHERE bm.business_id::TEXT = (storage.foldername(name))[1]
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.role IN ('owner', 'manager')
      )
    )
  );

CREATE POLICY "Business managers can update logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::TEXT = (storage.foldername(name))[1]
          AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members bm
        WHERE bm.business_id::TEXT = (storage.foldername(name))[1]
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.role IN ('owner', 'manager')
      )
    )
  );

CREATE POLICY "Business managers can delete logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::TEXT = (storage.foldername(name))[1]
          AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members bm
        WHERE bm.business_id::TEXT = (storage.foldername(name))[1]
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.role IN ('owner', 'manager')
      )
    )
  );

-- ============================================================================
-- 7. SUPABASE REALTIME PUBLICATION & REPLICA IDENTITY
-- ============================================================================
-- Ensure DELETE events include branch_id/business_id in WAL old_record so filtered
-- realtime subscriptions notify owner and staff screens immediately.
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'sales',
    'sale_items',
    'customer_debts',
    'debt_repayments',
    'expenses',
    'inventory',
    'products',
    'branches',
    'businesses',
    'business_members',
    'daily_summaries',
    'customer_requests'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);

      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      EXCEPTION
        WHEN duplicate_object THEN
          NULL;
        WHEN undefined_object THEN
          NULL;
      END;
    END IF;
  END LOOP;
END;
$$;
