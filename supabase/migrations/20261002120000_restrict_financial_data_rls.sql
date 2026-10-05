-- Restrict financial data (cost prices, purchases, supplier balances, stock values)
-- to owner, manager, and auditor roles. Cashiers use staff-safe views instead.

CREATE OR REPLACE FUNCTION public.has_financial_access(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
      AND bm.is_active = TRUE
      AND bm.role IN ('owner', 'manager', 'auditor')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_financial_access(uuid) TO authenticated;

-- Staff-safe product catalog: same rows, cost_price always zero.
CREATE OR REPLACE VIEW public.staff_products AS
SELECT
  p.id,
  p.business_id,
  p.category_id,
  p.name,
  p.description,
  p.sku,
  p.barcode,
  p.unit,
  0::numeric(12, 2) AS cost_price,
  p.selling_price,
  p.reorder_level,
  p.image_url,
  p.is_service,
  p.is_active,
  p.created_at,
  p.updated_at
FROM public.products p
WHERE p.business_id = ANY(public.get_user_business_ids());

GRANT SELECT ON public.staff_products TO authenticated;

ALTER VIEW public.staff_products SET (security_invoker = false);

-- Inventory policies must not subquery products directly; staff cannot SELECT products.
CREATE OR REPLACE FUNCTION public.user_can_access_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.business_id = ANY(public.get_user_business_ids())
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_product(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members can access inventory" ON public.inventory;

CREATE POLICY "Members can access inventory"
  ON public.inventory
  FOR ALL
  USING (public.user_can_access_product(product_id))
  WITH CHECK (public.user_can_access_product(product_id));

-- Staff-safe stock history: quantities and movement metadata only.
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
WHERE sm.business_id = ANY(public.get_user_business_ids());

GRANT SELECT ON public.staff_stock_movements TO authenticated;

ALTER VIEW public.staff_stock_movements SET (security_invoker = false);

-- Staff sale line items: same rows as sale_items but cost is always zero at read time.
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
);

GRANT SELECT ON public.staff_sale_items TO authenticated;

ALTER VIEW public.staff_sale_items SET (security_invoker = false);

-- Preserve real cost on sales even when the client sends zero for staff accounts.
CREATE OR REPLACE FUNCTION public.fill_sale_item_cost_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric(12, 2);
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cost_price IS NULL OR NEW.cost_price = 0 THEN
    SELECT p.cost_price
    INTO v_cost
    FROM public.products p
    WHERE p.id = NEW.product_id;

    IF FOUND AND v_cost IS NOT NULL AND v_cost > 0 THEN
      NEW.cost_price := v_cost;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_sale_item_cost_price ON public.sale_items;
CREATE TRIGGER trg_fill_sale_item_cost_price
  BEFORE INSERT OR UPDATE ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_sale_item_cost_price();

-- Staff cannot set or change product cost prices through the API.
CREATE OR REPLACE FUNCTION public.protect_product_cost_on_staff_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.has_financial_access(NEW.business_id) THEN
    NEW.cost_price := 0;
  ELSIF TG_OP = 'UPDATE' AND NOT public.has_financial_access(NEW.business_id) THEN
    NEW.cost_price := OLD.cost_price;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_product_cost_on_staff_write ON public.products;
CREATE TRIGGER trg_protect_product_cost_on_staff_write
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_product_cost_on_staff_write();

-- PRODUCTS -------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can access products" ON public.products;

CREATE POLICY "Financial members access products"
  ON public.products
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

CREATE POLICY "Staff can insert products"
  ON public.products
  FOR INSERT
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  );

CREATE POLICY "Staff can update products"
  ON public.products
  FOR UPDATE
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  );

CREATE POLICY "Staff can delete products"
  ON public.products
  FOR DELETE
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  );

-- PURCHASES & SUPPLIERS ------------------------------------------------------
DROP POLICY IF EXISTS "Members can access purchases" ON public.purchases;
CREATE POLICY "Financial members access purchases"
  ON public.purchases
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

DROP POLICY IF EXISTS "Members can access purchase_items" ON public.purchase_items;
CREATE POLICY "Financial members access purchase_items"
  ON public.purchase_items
  FOR ALL
  USING (
    purchase_id IN (
      SELECT id
      FROM public.purchases
      WHERE business_id = ANY(public.get_user_business_ids())
        AND public.has_financial_access(business_id)
    )
  )
  WITH CHECK (
    purchase_id IN (
      SELECT id
      FROM public.purchases
      WHERE business_id = ANY(public.get_user_business_ids())
        AND public.has_financial_access(business_id)
    )
  );

DROP POLICY IF EXISTS "Members can access suppliers" ON public.suppliers;
CREATE POLICY "Financial members access suppliers"
  ON public.suppliers
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

DROP POLICY IF EXISTS "Members can access supplier_debts" ON public.supplier_debts;
CREATE POLICY "Financial members access supplier_debts"
  ON public.supplier_debts
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

-- STOCK MOVEMENTS ------------------------------------------------------------
DROP POLICY IF EXISTS "Members can access stock_movements" ON public.stock_movements;

CREATE POLICY "Financial members access stock_movements"
  ON public.stock_movements
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

CREATE POLICY "Staff can insert stock_movements"
  ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  );

CREATE POLICY "Staff can update stock_movements"
  ON public.stock_movements
  FOR UPDATE
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND NOT public.has_financial_access(business_id)
  );

-- DAILY SUMMARIES (cash reconciliation / profit) -----------------------------
DROP POLICY IF EXISTS "Members can access daily_summaries" ON public.daily_summaries;
CREATE POLICY "Financial members access daily_summaries"
  ON public.daily_summaries
  FOR ALL
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
    AND public.has_financial_access(business_id)
  );

-- SALE ITEMS -----------------------------------------------------------------
DROP POLICY IF EXISTS "Members can access sale_items" ON public.sale_items;

CREATE POLICY "Financial members access sale_items"
  ON public.sale_items
  FOR ALL
  USING (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND public.has_financial_access(s.business_id)
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND public.has_financial_access(s.business_id)
    )
  );

CREATE POLICY "Staff can insert sale_items"
  ON public.sale_items
  FOR INSERT
  WITH CHECK (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND NOT public.has_financial_access(s.business_id)
    )
  );

CREATE POLICY "Staff can update sale_items"
  ON public.sale_items
  FOR UPDATE
  USING (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND NOT public.has_financial_access(s.business_id)
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND NOT public.has_financial_access(s.business_id)
    )
  );

CREATE POLICY "Staff can delete sale_items"
  ON public.sale_items
  FOR DELETE
  USING (
    sale_id IN (
      SELECT s.id
      FROM public.sales s
      WHERE s.business_id = ANY(public.get_user_business_ids())
        AND NOT public.has_financial_access(s.business_id)
    )
  );
