-- ============================================================
-- pgTAP tests for matching RLS policies
-- ============================================================
BEGIN;
SELECT plan(10);

-- ============================================================
-- Test UUIDs (unique to this test, not in seed.sql)
-- ============================================================
-- Test contractor (applicant)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('dd111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-match-con@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('dd111111-1111-1111-1111-111111111111', 'dd111111-1111-1111-1111-111111111111', 'test-match-con@test.local', '{"sub":"dd111111-1111-1111-1111-111111111111","email":"test-match-con@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = 'マッチ', first_name = '受注者' WHERE id = 'dd111111-1111-1111-1111-111111111111';

-- Test client (job owner)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('dd222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-match-cli@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('dd222222-2222-2222-2222-222222222222', 'dd222222-2222-2222-2222-222222222222', 'test-match-cli@test.local', '{"sub":"dd222222-2222-2222-2222-222222222222","email":"test-match-cli@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'client', last_name = 'マッチ', first_name = '発注者' WHERE id = 'dd222222-2222-2222-2222-222222222222';

-- Unrelated user
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('dd333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-match-other@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('dd333333-3333-3333-3333-333333333333', 'dd333333-3333-3333-3333-333333333333', 'test-match-other@test.local', '{"sub":"dd333333-3333-3333-3333-333333333333","email":"test-match-other@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = '他人' WHERE id = 'dd333333-3333-3333-3333-333333333333';

-- Create subscription for client
INSERT INTO subscriptions (id, user_id, stripe_subscription_id, status, plan_type, current_period_start, current_period_end)
VALUES ('dd444444-4444-4444-4444-444444444444', 'dd222222-2222-2222-2222-222222222222', 'sub_test_match', 'active', 'individual', now(), now() + interval '30 days');

-- Create test job
INSERT INTO jobs (id, owner_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, prefecture)
VALUES ('dd555555-5555-5555-5555-555555555555', 'dd222222-2222-2222-2222-222222222222', 'RLSテスト案件', '説明', '大工', 3, 'open', 18000, 22000, CURRENT_DATE, CURRENT_DATE + 30, '東京都');

-- Create test application (status = applied)
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status)
VALUES ('dd666666-6666-6666-6666-666666666666', 'dd555555-5555-5555-5555-555555555555', 'dd111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + 30, 'applied');

-- Create second test job for the accepted application
INSERT INTO jobs (id, owner_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, prefecture)
VALUES ('dd555556-5555-5555-5555-555555555555', 'dd222222-2222-2222-2222-222222222222', 'RLSテスト案件2', '説明2', '電気工事', 2, 'open', 20000, 25000, CURRENT_DATE, CURRENT_DATE + 30, '東京都');

-- Create test application (status = accepted, for review test) - on a different job
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date)
VALUES ('dd777777-7777-7777-7777-777777777777', 'dd555556-5555-5555-5555-555555555555', 'dd111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + 30, 'accepted', CURRENT_DATE + 10);

-- ============================================================
-- Test 1: Contractor can see own applications
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::int FROM applications WHERE applicant_id = 'dd111111-1111-1111-1111-111111111111'),
  2,
  'Contractor can see own applications'
);

-- ============================================================
-- Test 2: Job owner can see applications to their jobs
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'dd222222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT count(*)::int FROM applications WHERE job_id IN ('dd555555-5555-5555-5555-555555555555', 'dd555556-5555-5555-5555-555555555555')),
  2,
  'Job owner can see applications to their jobs'
);

-- ============================================================
-- Test 3: Unrelated user cannot see applications
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'dd333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT count(*)::int FROM applications WHERE id = 'dd666666-6666-6666-6666-666666666666'),
  0,
  'Unrelated user cannot see others applications'
);

-- ============================================================
-- Test 4: Contractor can cancel own applied application
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'dd111111-1111-1111-1111-111111111111';

SELECT lives_ok(
  $$UPDATE applications SET status = 'cancelled' WHERE id = 'dd666666-6666-6666-6666-666666666666'$$,
  'Contractor can cancel own applied application'
);

-- Reset status back to applied for further tests
RESET ROLE;
UPDATE applications SET status = 'applied' WHERE id = 'dd666666-6666-6666-6666-666666666666';

-- ============================================================
-- Test 5: Contractor cannot change accepted application
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd111111-1111-1111-1111-111111111111';

-- This should silently not match (accepted != applied in USING clause)
UPDATE applications SET status = 'cancelled' WHERE id = 'dd777777-7777-7777-7777-777777777777';

SELECT is(
  (SELECT status::text FROM applications WHERE id = 'dd777777-7777-7777-7777-777777777777'),
  'accepted',
  'Contractor cannot cancel accepted application (status unchanged)'
);

-- ============================================================
-- Test 6: Unrelated user cannot cancel application
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'dd333333-3333-3333-3333-333333333333';

UPDATE applications SET status = 'cancelled' WHERE id = 'dd666666-6666-6666-6666-666666666666';

RESET ROLE;
SELECT is(
  (SELECT status::text FROM applications WHERE id = 'dd666666-6666-6666-6666-666666666666'),
  'applied',
  'Unrelated user cannot cancel others application'
);

-- ============================================================
-- Test 7: Job owner can accept application
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd222222-2222-2222-2222-222222222222';

SELECT lives_ok(
  $$UPDATE applications SET status = 'accepted', first_work_date = CURRENT_DATE + 10 WHERE id = 'dd666666-6666-6666-6666-666666666666'$$,
  'Job owner can accept application'
);

-- Reset for next test
RESET ROLE;
UPDATE applications SET status = 'applied', first_work_date = NULL WHERE id = 'dd666666-6666-6666-6666-666666666666';

-- ============================================================
-- Test 8: Job owner can reject application
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd222222-2222-2222-2222-222222222222';

SELECT lives_ok(
  $$UPDATE applications SET status = 'rejected' WHERE id = 'dd666666-6666-6666-6666-666666666666'$$,
  'Job owner can reject application'
);

-- ============================================================
-- Test 9: Reviews are publicly readable
-- ============================================================
-- Insert a user_review via admin
RESET ROLE;
INSERT INTO user_reviews (id, application_id, reviewer_id, reviewee_id, operating_status, rating_again, rating_follows_instructions, rating_punctual, rating_speed, rating_quality, rating_has_tools)
VALUES ('dd888888-8888-8888-8888-888888888888', 'dd777777-7777-7777-7777-777777777777', 'dd222222-2222-2222-2222-222222222222', 'dd111111-1111-1111-1111-111111111111', 'completed', 'good', 'good', 'good', 'good', 'good', 'good');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT count(*)::int FROM user_reviews WHERE id = 'dd888888-8888-8888-8888-888888888888'),
  1,
  'User reviews are publicly readable'
);

-- ============================================================
-- Test 10: Client reviews are publicly readable
-- ============================================================
RESET ROLE;
INSERT INTO client_reviews (id, application_id, reviewer_id, reviewee_id, operating_status, rating_again)
VALUES ('dd999999-9999-9999-9999-999999999999', 'dd777777-7777-7777-7777-777777777777', 'dd111111-1111-1111-1111-111111111111', 'dd222222-2222-2222-2222-222222222222', 'completed', 'good');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT count(*)::int FROM client_reviews WHERE id = 'dd999999-9999-9999-9999-999999999999'),
  1,
  'Client reviews are publicly readable'
);

-- ============================================================
SELECT * FROM finish();
ROLLBACK;
