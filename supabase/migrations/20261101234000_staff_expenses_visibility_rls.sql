-- Restrict staff to only viewing, updating, and deleting their own recorded expenses.
-- Owners and managers can view and manage all expenses across their business.

CREATE OR REPLACE FUNCTION public.can_manage_all_expenses(p_business_id uuid)
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
      AND bm.role IN ('owner', 'manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_all_expenses(uuid) TO authenticated;

-- Drop existing broad policies on expenses
DROP POLICY IF EXISTS "expenses_all" ON public.expenses;
DROP POLICY IF EXISTS "Members can access expenses" ON public.expenses;
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;

-- 1. SELECT POLICY
-- Owners/managers see all expenses in the business.
-- Staff only see expenses that they recorded (recorded_by = auth.uid()).
CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND (
      public.can_manage_all_expenses(business_id)
      OR recorded_by = auth.uid()
    )
  );

-- 2. INSERT POLICY
-- Any active member can record an expense for their business.
CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
  );

-- 3. UPDATE POLICY
-- Owners/managers can update any expense. Staff can only update their own.
CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND (
      public.can_manage_all_expenses(business_id)
      OR recorded_by = auth.uid()
    )
  )
  WITH CHECK (
    business_id = ANY(public.get_user_business_ids())
  );

-- 4. DELETE POLICY
-- Owners/managers can delete any expense. Staff can only delete their own.
CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    business_id = ANY(public.get_user_business_ids())
    AND (
      public.can_manage_all_expenses(business_id)
      OR recorded_by = auth.uid()
    )
  );
