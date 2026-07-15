-- SQL Migration: Add high-performance composite indexes for Record Am
-- Run these statements in your Supabase SQL Editor to speed up database queries.

-- 1. Sales Index
CREATE INDEX IF NOT EXISTS idx_sales_business_branch_created 
ON public.sales (business_id, branch_id, created_at DESC);

-- 2. Customer Debts Index
CREATE INDEX IF NOT EXISTS idx_debts_business_branch_status 
ON public.customer_debts (business_id, branch_id, status, created_at DESC);

-- 3. Expenses Index
CREATE INDEX IF NOT EXISTS idx_expenses_business_branch_date 
ON public.expenses (business_id, branch_id, expense_date DESC);

-- 4. Products Index
CREATE INDEX IF NOT EXISTS idx_products_business_active 
ON public.products (business_id, is_active, name);

-- 5. Customers Index
CREATE INDEX IF NOT EXISTS idx_customers_business_active 
ON public.customers (business_id, is_active, name);

-- 6. Purchases Index
CREATE INDEX IF NOT EXISTS idx_purchases_business_branch_date 
ON public.purchases (business_id, branch_id, purchase_date DESC);

-- 7. Debt Repayments Index
CREATE INDEX IF NOT EXISTS idx_repayments_created 
ON public.debt_repayments (created_at DESC);
