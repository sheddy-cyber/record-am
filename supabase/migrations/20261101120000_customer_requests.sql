-- Customer Requests / Market List
CREATE TABLE IF NOT EXISTS public.customer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  quantity_needed TEXT,
  estimated_price NUMERIC(12, 2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'bought', 'cancelled'
  recorded_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  recorded_by_name TEXT,
  bought_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view customer_requests"
  ON public.customer_requests
  FOR SELECT
  USING (business_id = ANY(public.get_user_business_ids()));

CREATE POLICY "Members can insert customer_requests"
  ON public.customer_requests
  FOR INSERT
  WITH CHECK (business_id = ANY(public.get_user_business_ids()));

CREATE POLICY "Members can update customer_requests"
  ON public.customer_requests
  FOR UPDATE
  USING (business_id = ANY(public.get_user_business_ids()))
  WITH CHECK (business_id = ANY(public.get_user_business_ids()));

CREATE POLICY "Members can delete customer_requests"
  ON public.customer_requests
  FOR DELETE
  USING (business_id = ANY(public.get_user_business_ids()));
