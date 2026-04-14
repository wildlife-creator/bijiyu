-- ============================================================
-- billing: Explicit REVOKE for RPC functions
-- ============================================================
--
-- Supabase default privileges grant EXECUTE to anon, authenticated,
-- and service_role on all new functions. The original migration's
-- `REVOKE ... FROM PUBLIC` only revokes the PUBLIC pseudo-role,
-- not the individually-granted roles. This migration fixes that.

REVOKE EXECUTE ON FUNCTION handle_checkout_completed_plan(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_subscription_lifecycle_updated(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_subscription_lifecycle_deleted(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_or_lock_stripe_customer(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_stripe_customer_id(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION ensure_organization_exists(uuid) FROM anon, authenticated;
