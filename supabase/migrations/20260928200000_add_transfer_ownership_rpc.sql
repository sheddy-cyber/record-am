-- Atomically transfer business ownership from the current owner to another
-- active member. The caller must be the current owner of the business.
--
-- Steps performed in a single transaction:
--   1. Validate caller is the current business owner.
--   2. Validate the new owner is an active member of the business.
--   3. Update businesses.owner_id to the new owner.
--   4. Demote the old owner's business_members.role  → 'manager'.
--   5. Promote the new owner's business_members.role → 'owner'.

CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_business_id uuid,
  p_new_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id      uuid := auth.uid();
  v_current_owner  uuid;
BEGIN
  -- Must be authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and read current owner
  SELECT owner_id INTO v_current_owner
  FROM public.businesses
  WHERE id = p_business_id
  FOR UPDATE;

  IF v_current_owner IS NULL THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  -- Caller must be the current owner
  IF v_current_owner <> v_caller_id THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;

  -- Cannot transfer to yourself
  IF p_new_owner_user_id = v_caller_id THEN
    RAISE EXCEPTION 'You are already the owner of this business';
  END IF;

  -- New owner must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id
      AND user_id      = p_new_owner_user_id
      AND is_active    = true
  ) THEN
    RAISE EXCEPTION 'The selected user is not an active member of this business';
  END IF;

  -- 1. Update business owner
  UPDATE public.businesses
  SET owner_id   = p_new_owner_user_id,
      updated_at = now()
  WHERE id = p_business_id;

  -- 2. Demote old owner → manager
  UPDATE public.business_members
  SET role = 'manager'
  WHERE business_id = p_business_id
    AND user_id     = v_caller_id
    AND is_active   = true;

  -- 3. Promote new owner → owner
  UPDATE public.business_members
  SET role = 'owner'
  WHERE business_id = p_business_id
    AND user_id     = p_new_owner_user_id
    AND is_active   = true;
END;
$$;

-- Only authenticated users may call this RPC
REVOKE EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;
