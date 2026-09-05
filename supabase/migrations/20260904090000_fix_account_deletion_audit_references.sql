-- Preserve business audit history when a staff account is deleted. These
-- columns identify who performed an action; they must not keep a deleted
-- authentication record alive.
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_performed_by_fkey,
  ADD CONSTRAINT stock_movements_performed_by_fkey
    FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_sold_by_fkey,
  ADD CONSTRAINT sales_sold_by_fkey
    FOREIGN KEY (sold_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_recorded_by_fkey,
  ADD CONSTRAINT expenses_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_recorded_by_fkey,
  ADD CONSTRAINT purchases_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.debt_repayments
  DROP CONSTRAINT IF EXISTS debt_repayments_recorded_by_fkey,
  ADD CONSTRAINT debt_repayments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.daily_summaries
  DROP CONSTRAINT IF EXISTS daily_summaries_closed_by_fkey,
  ADD CONSTRAINT daily_summaries_closed_by_fkey
    FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey,
  ADD CONSTRAINT activity_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- A sole business owner may delete their account and the business data will
-- cascade with it. A shared-business owner must first transfer ownership or
-- remove the other active members, preventing accidental deletion of a team.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.businesses AS business
    WHERE business.owner_id = v_user_id
      AND EXISTS (
        SELECT 1
        FROM public.business_members AS member
        WHERE member.business_id = business.id
          AND member.user_id <> v_user_id
          AND member.is_active = true
      )
  ) THEN
    RAISE EXCEPTION
      'You cannot delete your account while you own a business with other active members. Transfer ownership or remove those members first.';
  END IF;

  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
