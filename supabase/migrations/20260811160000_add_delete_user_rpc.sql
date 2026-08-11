CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ensure the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete the authenticated user from auth.users.
  -- This will cascade to user_profiles, business_members, and businesses (if they are the owner).
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
