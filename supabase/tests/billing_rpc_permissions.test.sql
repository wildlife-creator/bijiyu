-- pgTAP tests for billing RPC function permissions (Task 14.1 + 14.5)
-- Verifies that SECURITY DEFINER functions are NOT callable by anon/authenticated.

BEGIN;
SELECT plan(14);

-- ============================================================
-- Test RPC functions exist
-- ============================================================

SELECT has_function('public', 'handle_checkout_completed_plan', ARRAY['jsonb'],
  'handle_checkout_completed_plan(jsonb) exists');
SELECT has_function('public', 'handle_subscription_lifecycle_updated', ARRAY['jsonb'],
  'handle_subscription_lifecycle_updated(jsonb) exists');
SELECT has_function('public', 'handle_subscription_lifecycle_deleted', ARRAY['jsonb'],
  'handle_subscription_lifecycle_deleted(jsonb) exists');
SELECT has_function('public', 'get_or_lock_stripe_customer', ARRAY['uuid'],
  'get_or_lock_stripe_customer(uuid) exists');
SELECT has_function('public', 'set_stripe_customer_id', ARRAY['uuid', 'text'],
  'set_stripe_customer_id(uuid, text) exists');
SELECT has_function('public', 'ensure_organization_exists', ARRAY['uuid'],
  'ensure_organization_exists(uuid) exists');

-- ============================================================
-- Test anon cannot call any RPC function
-- ============================================================

SET LOCAL role TO anon;

SELECT throws_ok(
  $$SELECT handle_checkout_completed_plan('{"user_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)$$,
  '42501',  -- permission denied
  NULL,
  'anon cannot call handle_checkout_completed_plan'
);

SELECT throws_ok(
  $$SELECT get_or_lock_stripe_customer('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  NULL,
  'anon cannot call get_or_lock_stripe_customer'
);

-- ============================================================
-- Test authenticated cannot call any RPC function
-- ============================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
  $$SELECT handle_checkout_completed_plan('{"user_id":"11111111-1111-1111-1111-111111111111"}'::jsonb)$$,
  '42501',
  NULL,
  'authenticated cannot call handle_checkout_completed_plan'
);

SELECT throws_ok(
  $$SELECT handle_subscription_lifecycle_updated('{"stripe_subscription_id":"sub_test"}'::jsonb)$$,
  '42501',
  NULL,
  'authenticated cannot call handle_subscription_lifecycle_updated'
);

SELECT throws_ok(
  $$SELECT handle_subscription_lifecycle_deleted('{"stripe_subscription_id":"sub_test"}'::jsonb)$$,
  '42501',
  NULL,
  'authenticated cannot call handle_subscription_lifecycle_deleted'
);

SELECT throws_ok(
  $$SELECT get_or_lock_stripe_customer('11111111-1111-1111-1111-111111111111'::uuid)$$,
  '42501',
  NULL,
  'authenticated cannot call get_or_lock_stripe_customer'
);

SELECT throws_ok(
  $$SELECT set_stripe_customer_id('11111111-1111-1111-1111-111111111111'::uuid, 'cus_test')$$,
  '42501',
  NULL,
  'authenticated cannot call set_stripe_customer_id'
);

SELECT throws_ok(
  $$SELECT ensure_organization_exists('11111111-1111-1111-1111-111111111111'::uuid)$$,
  '42501',
  NULL,
  'authenticated cannot call ensure_organization_exists'
);

SELECT * FROM finish();
ROLLBACK;
