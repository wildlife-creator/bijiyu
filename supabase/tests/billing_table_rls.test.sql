-- pgTAP tests for billing-related table RLS (Task 14.5)
-- Verifies subscriptions / option_subscriptions / stripe_webhook_events
-- are properly locked down for authenticated users.

BEGIN;
SELECT plan(9);

-- ============================================================
-- Setup
-- ============================================================

-- Switch to authenticated as the contractor seed user
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ============================================================
-- subscriptions: user can SELECT own rows only
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM subscriptions WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'contractor sees 0 subscriptions (has none)'
);

-- Switch to client who has a subscription
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM subscriptions WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'client sees their own subscription'
);

-- Cannot see other users' subscriptions
SELECT is(
  (SELECT count(*)::int FROM subscriptions WHERE user_id = 'b1110000-0000-1000-8000-000000000001'),
  0,
  'client cannot see past_due user subscription'
);

-- ============================================================
-- subscriptions: INSERT/UPDATE/DELETE blocked for authenticated
-- ============================================================

SELECT throws_ok(
  $$INSERT INTO subscriptions (user_id, plan_type, status) VALUES ('22222222-2222-2222-2222-222222222222', 'individual', 'active')$$,
  '42501',
  NULL,
  'authenticated cannot INSERT into subscriptions (RLS blocks)'
);

-- ============================================================
-- option_subscriptions: similar restrictions
-- ============================================================

-- Switch to corp-comp who has an active option
SET LOCAL request.jwt.claims TO '{"sub":"b1110000-0000-1000-8000-000000000005","role":"authenticated"}';

SELECT cmp_ok(
  (SELECT count(*)::int FROM option_subscriptions WHERE user_id = 'b1110000-0000-1000-8000-000000000005'),
  '>=',
  1,
  'corp-comp user sees their own option_subscriptions'
);

-- Cannot see other users' option_subscriptions
SELECT is(
  (SELECT count(*)::int FROM option_subscriptions WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'corp-comp cannot see another users option_subscriptions'
);

-- ============================================================
-- stripe_webhook_events: not accessible by authenticated
-- ============================================================

SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM stripe_webhook_events),
  0,
  'authenticated cannot SELECT from stripe_webhook_events'
);

SELECT throws_ok(
  $$INSERT INTO stripe_webhook_events (stripe_event_id, event_type, status) VALUES ('evt_test', 'test', 'processing')$$,
  '42501',
  NULL,
  'authenticated cannot INSERT into stripe_webhook_events'
);

-- ============================================================
-- audit_logs: not accessible by authenticated
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM audit_logs),
  0,
  'authenticated cannot SELECT from audit_logs'
);

SELECT * FROM finish();
ROLLBACK;
