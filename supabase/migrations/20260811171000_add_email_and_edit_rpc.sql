-- 1. Add email column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill existing emails from auth.users (requires superuser, which migrations run as)
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id AND up.email IS NULL;

-- 3. Update the handle_new_user trigger to include email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, email)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create an RPC to allow managers/owners to update a team member's profile
CREATE OR REPLACE FUNCTION update_team_member_profile(p_member_user_id UUID, p_new_full_name TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_profile RECORD;
  v_has_access BOOLEAN;
BEGIN
  -- Check if authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if the current user is an owner or manager of a business that the target user is a member of
  SELECT EXISTS (
    SELECT 1 
    FROM business_members bm1
    JOIN business_members bm2 ON bm1.business_id = bm2.business_id
    WHERE bm1.user_id = auth.uid() 
      AND bm1.role IN ('owner', 'manager')
      AND bm2.user_id = p_member_user_id
  ) INTO v_has_access;

  -- Wait, if they are the user themselves, they should also be able to update it
  IF NOT v_has_access AND auth.uid() != p_member_user_id THEN
    RAISE EXCEPTION 'Unauthorized to edit this profile';
  END IF;

  -- Update the profile
  UPDATE user_profiles
  SET full_name = p_new_full_name, updated_at = NOW()
  WHERE id = p_member_user_id
  RETURNING * INTO v_updated_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  RETURN row_to_json(v_updated_profile);
END;
$$;
