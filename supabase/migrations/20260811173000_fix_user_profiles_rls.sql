-- Drop the restrictive all-in-one policy
DROP POLICY IF EXISTS "user_profiles_all" ON user_profiles;

-- Allow any authenticated user to view profiles
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT TO authenticated USING (true);

-- Allow users to manage only their own profiles
CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "user_profiles_delete" ON user_profiles
  FOR DELETE TO authenticated USING (id = auth.uid());

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
