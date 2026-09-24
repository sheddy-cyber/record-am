-- Add payment_accounts table for managing bank accounts and POS terminals
-- Add payment_account_id and bank_name to sales and debt_repayments

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_number TEXT,
  channel TEXT NOT NULL DEFAULT 'both', -- 'transfer', 'pos', 'both'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for payment_accounts
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members to read payment accounts"
ON public.payment_accounts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = payment_accounts.business_id
    AND bm.user_id = auth.uid()
    AND bm.is_active = true
  )
);

CREATE POLICY "Allow members to insert payment accounts"
ON public.payment_accounts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = payment_accounts.business_id
    AND bm.user_id = auth.uid()
    AND bm.is_active = true
  )
);

CREATE POLICY "Allow members to update payment accounts"
ON public.payment_accounts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = payment_accounts.business_id
    AND bm.user_id = auth.uid()
    AND bm.is_active = true
  )
);

CREATE POLICY "Allow members to delete payment accounts"
ON public.payment_accounts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = payment_accounts.business_id
    AND bm.user_id = auth.uid()
    AND bm.is_active = true
  )
);

-- Add payment_account_id and bank_name to sales
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL;

-- Add payment_account_id and bank_name to debt_repayments
ALTER TABLE public.debt_repayments
ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.debt_repayments
ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL;
