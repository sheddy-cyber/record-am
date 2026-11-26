-- ============================================================================
-- RECORD AM: keep stock history and purchase history in step
-- ============================================================================
-- 1. Every stock movement created by a purchase (or a purchase created by a
--    stock addition) carries the purchase id, so the two can be changed and
--    removed together.
-- 2. delete_purchase_record removes a purchase, its supplier debt and the stock
--    it added, in one transaction.
-- 3. record_staff_restock_purchase lets staff (who cannot see cost prices or
--    purchases) record the purchase behind a restock; the server prices it
--    from the product's saved cost.
-- Safe to run more than once.

-- ----------------------------------------------------------------------------
-- 1. Link column
-- ----------------------------------------------------------------------------
-- Deliberately not a foreign key: phones sync offline and may upload a stock
-- movement before the purchase it belongs to.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS purchase_id UUID;
CREATE INDEX IF NOT EXISTS idx_stock_movements_purchase ON public.stock_movements (purchase_id)
  WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON public.stock_movements (branch_id, reference)
  WHERE reference IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Delete a purchase together with its stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_purchase_record(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase public.purchases%ROWTYPE;
  v_movement RECORD;
  v_delta NUMERIC;
  v_reversed INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_purchase FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', TRUE, 'already_deleted', TRUE);
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_purchase.business_id AND b.owner_id = v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = v_purchase.business_id
        AND bm.user_id = v_user_id
        AND bm.is_active = TRUE
        AND bm.role IN ('owner', 'manager')
    )
  ) THEN
    RAISE EXCEPTION 'Only owners and managers can delete purchases';
  END IF;

  IF NOT public.can_access_branch(v_purchase.branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this branch';
  END IF;

  -- Undo every stock movement this purchase made. Older records are linked
  -- only by the purchase number in reference.
  FOR v_movement IN
    SELECT id, product_id, branch_id, type, quantity
    FROM public.stock_movements
    WHERE purchase_id = p_purchase_id
       OR (purchase_id IS NULL
           AND branch_id = v_purchase.branch_id
           AND reference = v_purchase.purchase_number
           AND type IN ('stock_in', 'stock_out', 'adjustment'))
    FOR UPDATE
  LOOP
    v_delta := CASE WHEN v_movement.type = 'stock_out' THEN v_movement.quantity ELSE -v_movement.quantity END;

    INSERT INTO public.inventory (product_id, branch_id, quantity, last_updated)
    VALUES (v_movement.product_id, v_movement.branch_id, GREATEST(0, v_delta), NOW())
    ON CONFLICT (product_id, branch_id)
    DO UPDATE SET
      quantity = GREATEST(0, ROUND(COALESCE(public.inventory.quantity, 0) + v_delta, 2)),
      last_updated = NOW();

    DELETE FROM public.stock_movements WHERE id = v_movement.id;
    v_reversed := v_reversed + 1;
  END LOOP;

  DELETE FROM public.supplier_debts WHERE purchase_id = p_purchase_id;
  DELETE FROM public.purchase_items WHERE purchase_id = p_purchase_id;
  DELETE FROM public.purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', TRUE, 'purchase_id', p_purchase_id, 'movements_reversed', v_reversed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_purchase_record(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Purchase behind a staff restock
-- ----------------------------------------------------------------------------
-- p_items: [{ "id": uuid, "product_id": uuid, "quantity": number }, ...]
-- Unit costs come from the products table, so staff never see or set them.
-- Idempotent: calling again with the same purchase id does nothing.
CREATE OR REPLACE FUNCTION public.record_staff_restock_purchase(
  p_purchase_id UUID,
  p_business_id UUID,
  p_branch_id UUID,
  p_purchase_number TEXT,
  p_items JSONB,
  p_purchase_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_item JSONB;
  v_cost NUMERIC;
  v_qty NUMERIC;
  v_total NUMERIC := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = p_business_id AND bm.user_id = v_user_id AND bm.is_active = TRUE
  ) AND NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Permission denied for this business';
  END IF;

  IF NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this branch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchases WHERE id = p_purchase_id) THEN
    RETURN jsonb_build_object('success', TRUE, 'already_recorded', TRUE);
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A restock purchase needs at least one item';
  END IF;

  INSERT INTO public.purchases (
    id, business_id, branch_id, supplier_id, purchase_number,
    total_amount, discount_amount, amount_paid, amount_owed, payment_status,
    notes, purchase_date, recorded_by
  )
  VALUES (
    p_purchase_id, p_business_id, p_branch_id, NULL, COALESCE(NULLIF(p_purchase_number, ''), 'PUR-' || to_char(NOW(), 'YYYYMMDDHH24MISS')),
    0, 0, 0, 0, 'paid',
    COALESCE(p_notes, 'Recorded from a staff restock'), COALESCE(p_purchase_date, CURRENT_DATE), v_user_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := ROUND(COALESCE((v_item->>'quantity')::NUMERIC, 0), 2);
    CONTINUE WHEN v_qty <= 0;

    SELECT COALESCE(p.cost_price, 0) INTO v_cost
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::UUID AND p.business_id = p_business_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found in this business';
    END IF;

    INSERT INTO public.purchase_items (id, purchase_id, product_id, quantity, unit_cost, total_cost)
    VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::UUID, uuid_generate_v4()),
      p_purchase_id,
      (v_item->>'product_id')::UUID,
      v_qty,
      v_cost,
      ROUND(v_qty * v_cost, 2)
    );
    v_total := v_total + ROUND(v_qty * v_cost, 2);
  END LOOP;

  -- Staff restocks are recorded as paid; the owner can edit the purchase to
  -- add the supplier or an amount still owed.
  UPDATE public.purchases
  SET total_amount = v_total, amount_paid = v_total, amount_owed = 0, payment_status = 'paid', updated_at = NOW()
  WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', TRUE, 'purchase_id', p_purchase_id, 'total_amount', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_staff_restock_purchase(UUID, UUID, UUID, TEXT, JSONB, DATE, TEXT) TO authenticated;
