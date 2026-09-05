-- ============================================================
-- STOCKPADI - Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- provisions, pharmacy, cyber_cafe, salon, fashion, electronics, food, other
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT DEFAULT 'NGN',
  currency_symbol TEXT DEFAULT '₦',
  tax_rate NUMERIC(5,2) DEFAULT 0,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_main BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER PROFILES & ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  pin_hash TEXT, -- hashed PIN for quick local auth
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'cashier', -- owner, manager, cashier, auditor
  is_active BOOLEAN DEFAULT TRUE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  UNIQUE(business_id, user_id)
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0F6FFF',
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS / SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  unit TEXT DEFAULT 'piece', -- piece, kg, litre, hour, dozen, carton, etc.
  cost_price NUMERIC(12,2) DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(10,2) DEFAULT 5,
  image_url TEXT,
  is_service BOOLEAN DEFAULT FALSE, -- true for cyber cafe time, salon services, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY (stock per branch)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, branch_id)
);

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- stock_in, stock_out, adjustment, transfer, damage, wastage
  quantity NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(12,2),
  total_cost NUMERIC(12,2),
  reference TEXT, -- supplier name, sale id, etc.
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_number TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  amount_owed NUMERIC(12,2) DEFAULT 0, -- total - paid
  payment_status TEXT DEFAULT 'paid', -- paid, partial, credit
  payment_method TEXT DEFAULT 'cash', -- cash, transfer, pos, mobile_money, mixed
  notes TEXT,
  sold_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  cost_price NUMERIC(12,2),
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- rent, electricity, transport, salary, supplies, maintenance, other
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PURCHASES (from suppliers)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_number TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  amount_owed NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'paid', -- paid, partial, credit
  notes TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PURCHASE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEBTS (Customer owes business)
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL, -- stored directly in case customer record is deleted
  customer_phone TEXT,
  original_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'outstanding', -- outstanding, partial, settled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEBT REPAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS debt_repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id UUID NOT NULL REFERENCES customer_debts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIER DEBTS (business owes supplier)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'outstanding',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DAILY SUMMARIES (end-of-day records)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  total_purchases NUMERIC(12,2) DEFAULT 0,
  gross_profit NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  cash_in_hand_expected NUMERIC(12,2) DEFAULT 0,
  cash_in_hand_actual NUMERIC(12,2),
  discrepancy NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, branch_id, summary_date)
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- sale_created, stock_added, debt_recorded, etc.
  entity_type TEXT, -- sale, product, customer, expense, etc.
  entity_id UUID,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
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

-- Helper function: get business IDs for current user
CREATE OR REPLACE FUNCTION get_user_business_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- BUSINESSES policies
CREATE POLICY "Users can view their businesses" ON businesses
  FOR SELECT USING (id = ANY(get_user_business_ids()));

CREATE POLICY "Owners can insert businesses" ON businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update businesses" ON businesses
  FOR UPDATE USING (owner_id = auth.uid());

-- USER PROFILES policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- BUSINESS MEMBERS policies
CREATE POLICY "Members can view their business memberships" ON business_members
  FOR SELECT USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Owners can manage members" ON business_members
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- Generic policy for business-scoped tables
CREATE POLICY "Members can access branches" ON branches
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access categories" ON categories
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access products" ON products
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access inventory" ON inventory
  FOR ALL USING (
    product_id IN (SELECT id FROM products WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "Members can access stock_movements" ON stock_movements
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access suppliers" ON suppliers
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access customers" ON customers
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access sales" ON sales
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access sale_items" ON sale_items
  FOR ALL USING (
    sale_id IN (SELECT id FROM sales WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "Members can access expenses" ON expenses
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access purchases" ON purchases
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access purchase_items" ON purchase_items
  FOR ALL USING (
    purchase_id IN (SELECT id FROM purchases WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "Members can access customer_debts" ON customer_debts
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access debt_repayments" ON debt_repayments
  FOR ALL USING (
    debt_id IN (SELECT id FROM customer_debts WHERE business_id = ANY(get_user_business_ids()))
  );

CREATE POLICY "Members can access supplier_debts" ON supplier_debts
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access daily_summaries" ON daily_summaries
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

CREATE POLICY "Members can access activity_logs" ON activity_logs
  FOR ALL USING (business_id = ANY(get_user_business_ids()));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_customer_debts_updated_at BEFORE UPDATE ON customer_debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_daily_summaries_updated_at BEFORE UPDATE ON daily_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generate sale number
CREATE OR REPLACE FUNCTION generate_sale_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  count INT;
BEGIN
  SELECT COUNT(*) INTO count FROM sales WHERE business_id = p_business_id;
  RETURN 'SALE-' || LPAD((count + 1)::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate purchase number
CREATE OR REPLACE FUNCTION generate_purchase_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  count INT;
BEGIN
  SELECT COUNT(*) INTO count FROM purchases WHERE business_id = p_business_id;
  RETURN 'PUR-' || LPAD((count + 1)::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_business_name_ci_active
  ON products(business_id, lower(btrim(name)))
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_debts_business ON customer_debts(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_business ON activity_logs(business_id);

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Record Am schema created successfully!' AS status;
