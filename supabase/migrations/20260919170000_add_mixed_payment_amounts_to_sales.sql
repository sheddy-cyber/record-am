-- Add cash_amount and transfer_amount to sales and debt_repayments for mixed payment tracking

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) DEFAULT NULL;

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC(12,2) DEFAULT NULL;

ALTER TABLE public.debt_repayments
ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) DEFAULT NULL;

ALTER TABLE public.debt_repayments
ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC(12,2) DEFAULT NULL;
