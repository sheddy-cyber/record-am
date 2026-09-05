-- Supabase projects may have explicit default EXECUTE grants for anon and
-- service_role. Account deletion is a user-initiated operation, so only an
-- authenticated session may invoke this RPC.
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
