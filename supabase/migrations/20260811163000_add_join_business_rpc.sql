CREATE OR REPLACE FUNCTION join_business_by_id(p_business_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_business RECORD;
  v_branch RECORD;
  v_existing_member RECORD;
  v_role TEXT := 'cashier';
BEGIN
  -- 1. Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Check if business exists
  SELECT * INTO v_business FROM businesses WHERE id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found. Please check the ID and try again.';
  END IF;

  -- 3. Check if branch exists
  SELECT * INTO v_branch FROM branches WHERE business_id = p_business_id AND is_main = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Main branch not found for this business.';
  END IF;

  -- 4. Check if user is already a member
  SELECT * INTO v_existing_member FROM business_members 
    WHERE business_id = p_business_id AND user_id = auth.uid();
  
  IF FOUND THEN
    v_role := v_existing_member.role;
  ELSE
    -- 5. Add user as member
    INSERT INTO business_members (business_id, user_id, branch_id, role, joined_at)
    VALUES (p_business_id, auth.uid(), v_branch.id, 'cashier', NOW());
  END IF;

  -- Return the business, branch, and role so the client can update its state
  RETURN json_build_object(
    'business', row_to_json(v_business),
    'branch', row_to_json(v_branch),
    'role', v_role
  );
END;
$$;
