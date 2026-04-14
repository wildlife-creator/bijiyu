-- pgTAP tests for is_paid_user() function
-- Verifies past_due is treated as paid, cancelled / soft-deleted return false.
-- Run with: supabase test db

BEGIN;
SELECT plan(7);

-- ============================================================
-- Setup: create test users with various subscription states
-- ============================================================
-- IMPORTANT: use UUIDs that do not collide with seed.sql

-- User PAID-A: active subscription
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa00aa00-0000-0000-0000-000000000001',
  'paid-active@billing-test.local',
  crypt('password123', gen_salt('bf')),
  NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()
);

-- User PAID-B: past_due subscription
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa00aa00-0000-0000-0000-000000000002',
  'paid-pastdue@billing-test.local',
  crypt('password123', gen_salt('bf')),
  NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()
);

-- User UNPAID-A: no subscription record
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa00aa00-0000-0000-0000-000000000003',
  'unpaid-none@billing-test.local',
  crypt('password123', gen_salt('bf')),
  NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()
);

-- User UNPAID-B: cancelled subscription only
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa00aa00-0000-0000-0000-000000000004',
  'unpaid-cancelled@billing-test.local',
  crypt('password123', gen_salt('bf')),
  NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()
);

-- User DELETED: active subscription but soft-deleted user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa00aa00-0000-0000-0000-000000000005',
  'deleted-but-active@billing-test.local',
  crypt('password123', gen_salt('bf')),
  NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()
);

-- Subscriptions for the above
INSERT INTO subscriptions (user_id, plan_type, status, stripe_subscription_id)
VALUES
  ('aa00aa00-0000-0000-0000-000000000001', 'individual', 'active', 'sub_test_paid_active'),
  ('aa00aa00-0000-0000-0000-000000000002', 'individual', 'past_due', 'sub_test_paid_pastdue'),
  ('aa00aa00-0000-0000-0000-000000000004', 'individual', 'cancelled', 'sub_test_unpaid_cancelled'),
  ('aa00aa00-0000-0000-0000-000000000005', 'individual', 'active', 'sub_test_deleted_active');

-- Soft-delete user 5
UPDATE public.users
SET deleted_at = NOW()
WHERE id = 'aa00aa00-0000-0000-0000-000000000005';

-- ============================================================
-- Tests
-- ============================================================

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000001'),
  true,
  'is_paid_user returns true for ACTIVE subscription'
);

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000002'),
  true,
  'is_paid_user returns true for PAST_DUE subscription (still considered paid)'
);

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000003'),
  false,
  'is_paid_user returns false for user with NO subscription'
);

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000004'),
  false,
  'is_paid_user returns false for CANCELLED-only subscription'
);

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000005'),
  false,
  'is_paid_user returns false for soft-deleted user even if subscription is active'
);

-- After cancelling the past_due subscription, user should no longer be paid
UPDATE subscriptions
SET status = 'cancelled'
WHERE stripe_subscription_id = 'sub_test_paid_pastdue';

SELECT is(
  is_paid_user('aa00aa00-0000-0000-0000-000000000002'),
  false,
  'is_paid_user returns false after past_due transitions to cancelled'
);

-- Function exists and is callable
SELECT has_function(
  'public', 'is_paid_user', ARRAY['uuid'],
  'is_paid_user(uuid) function exists'
);

SELECT * FROM finish();
ROLLBACK;
