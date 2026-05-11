-- ============================================================
-- STOCKPADI - Complete RLS Fix
-- Run this entire block in Supabase SQL Editor
-- ============================================================

-- Step 1: Disable RLS on all tables temporarily
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debts DISABLE ROW LEVEL SECURITY;
ALTER TABLE debt_repayments DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_debts DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies across all tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Step 3: Drop and recreate the helper function cleanly
DROP FUNCTION IF EXISTS get_user_business_ids();
CREATE OR REPLACE FUNCTION get_user_business_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(ARRAY(
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND is_active = TRUE
  ), ARRAY[]::UUID[]);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 4: Re-enable RLS on all tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Step 5: USER PROFILES
CREATE POLICY "user_profiles_all" ON user_profiles
  FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Step 6: BUSINESSES
-- Insert: anyone authenticated can create a business they own
CREATE POLICY "businesses_insert" ON businesses
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Select: owner OR member
CREATE POLICY "businesses_select" ON businesses
  FOR SELECT TO authenticated USING (
    owner_id = auth.uid() OR id = ANY(get_user_business_ids())
  );

-- Update/Delete: owner only
CREATE POLICY "businesses_update" ON businesses
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "businesses_delete" ON businesses
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Step 7: BRANCHES
-- Allow any authenticated user to insert branches (needed during onboarding)
CREATE POLICY "branches_insert" ON branches
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "branches_select" ON branches
  FOR SELECT TO authenticated USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR business_id = ANY(get_user_business_ids())
  );

CREATE POLICY "branches_update" ON branches
  FOR UPDATE TO authenticated USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR business_id = ANY(get_user_business_ids())
  );

-- Step 8: BUSINESS MEMBERS
CREATE POLICY "members_insert" ON business_members
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "members_select" ON business_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "members_update" ON business_members
  FOR UPDATE TO authenticated USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "members_delete" ON business_members
  FOR DELETE TO authenticated USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- Step 9: All other tables — members of the business can do everything
CREATE POLICY "categories_all" ON categories
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "products_all" ON products
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "inventory_all" ON inventory
  FOR ALL TO authenticated USING (
    product_id IN (SELECT id FROM products WHERE business_id = ANY(get_user_business_ids()))
  )
  WITH CHECK (
    product_id IN (SELECT id FROM products WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "stock_movements_all" ON stock_movements
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "suppliers_all" ON suppliers
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "customers_all" ON customers
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "sales_all" ON sales
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "sale_items_all" ON sale_items
  FOR ALL TO authenticated USING (
    sale_id IN (SELECT id FROM sales WHERE business_id = ANY(get_user_business_ids()))
  )
  WITH CHECK (
    sale_id IN (SELECT id FROM sales WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "expenses_all" ON expenses
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "purchases_all" ON purchases
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "purchase_items_all" ON purchase_items
  FOR ALL TO authenticated USING (
    purchase_id IN (SELECT id FROM purchases WHERE business_id = ANY(get_user_business_ids()))
  )
  WITH CHECK (
    purchase_id IN (SELECT id FROM purchases WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "customer_debts_all" ON customer_debts
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "debt_repayments_all" ON debt_repayments
  FOR ALL TO authenticated USING (
    debt_id IN (SELECT id FROM customer_debts WHERE business_id = ANY(get_user_business_ids()))
  )
  WITH CHECK (
    debt_id IN (SELECT id FROM customer_debts WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "supplier_debts_all" ON supplier_debts
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "daily_summaries_all" ON daily_summaries
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

CREATE POLICY "activity_logs_all" ON activity_logs
  FOR ALL TO authenticated USING (business_id = ANY(get_user_business_ids()))
  WITH CHECK (business_id = ANY(get_user_business_ids()));

-- Step 10: Verify - show all policies created
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
