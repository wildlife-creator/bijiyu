-- ============================================================
-- pgTAP tests for job-search RLS policies
-- ============================================================
BEGIN;
SELECT plan(9);

-- ============================================================
-- Test UUIDs (unique to this test, not in seed.sql)
-- ============================================================
-- Test contractor
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('aaa11111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-con-rls@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('aaa11111-1111-1111-1111-111111111111', 'aaa11111-1111-1111-1111-111111111111', 'test-con-rls@test.local', '{"sub":"aaa11111-1111-1111-1111-111111111111","email":"test-con-rls@test.local"}', 'email', now(), now(), now());

-- Set role
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = 'RLS' WHERE id = 'aaa11111-1111-1111-1111-111111111111';

-- Test client (owner of a draft job)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('bbb22222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cli-rls@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('bbb22222-2222-2222-2222-222222222222', 'bbb22222-2222-2222-2222-222222222222', 'test-cli-rls@test.local', '{"sub":"bbb22222-2222-2222-2222-222222222222","email":"test-cli-rls@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'クライアント' WHERE id = 'bbb22222-2222-2222-2222-222222222222';

-- Create a draft job (only owner should see it)
INSERT INTO jobs (id, owner_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, prefecture)
VALUES ('ccc33333-3333-3333-3333-333333333333', 'bbb22222-2222-2222-2222-222222222222', 'Draft Job', 'Draft', '大工', 1, 'draft', 10000, 20000, CURRENT_DATE + 7, CURRENT_DATE + 14, '東京都');

-- ============================================================
-- 1. Contractor can see open jobs
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaa11111-1111-1111-1111-111111111111"}';

SELECT ok(
  (SELECT count(*) FROM jobs WHERE status = 'open') >= 2,
  'Contractor can see open jobs from seed data'
);

-- ============================================================
-- 2. Contractor cannot see draft jobs that are not their own
-- ============================================================
SELECT is(
  (SELECT count(*) FROM jobs WHERE id = 'ccc33333-3333-3333-3333-333333333333')::integer,
  0,
  'Contractor cannot see draft jobs of other users'
);

-- ============================================================
-- 3. Owner can see their own draft job
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub":"bbb22222-2222-2222-2222-222222222222"}';

SELECT is(
  (SELECT count(*) FROM jobs WHERE id = 'ccc33333-3333-3333-3333-333333333333')::integer,
  1,
  'Owner can see their own draft job'
);

-- ============================================================
-- 4. Contractor can insert favorites for themselves
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub":"aaa11111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  $$INSERT INTO favorites (user_id, target_type, target_id) VALUES ('aaa11111-1111-1111-1111-111111111111', 'job', '66666666-6666-6666-6666-666666666666')$$,
  'Contractor can insert a favorite for themselves'
);

-- ============================================================
-- 5. Contractor can see their own favorites
-- ============================================================
SELECT is(
  (SELECT count(*) FROM favorites WHERE user_id = 'aaa11111-1111-1111-1111-111111111111')::integer,
  1,
  'Contractor can see their own favorites'
);

-- ============================================================
-- 6. Contractor cannot see other users' favorites
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub":"bbb22222-2222-2222-2222-222222222222"}';

SELECT is(
  (SELECT count(*) FROM favorites WHERE user_id = 'aaa11111-1111-1111-1111-111111111111')::integer,
  0,
  'Client cannot see contractor favorites'
);

-- ============================================================
-- 7. Contractor can delete their own favorite
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub":"aaa11111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  $$DELETE FROM favorites WHERE user_id = 'aaa11111-1111-1111-1111-111111111111' AND target_type = 'job'$$,
  'Contractor can delete their own favorite'
);

-- ============================================================
-- 8. Contractor can insert application for themselves
-- ============================================================
SELECT lives_ok(
  $$INSERT INTO applications (applicant_id, job_id, status) VALUES ('aaa11111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'applied')$$,
  'Contractor can insert application for themselves'
);

-- ============================================================
-- 9. Contractor can see their own applications
-- ============================================================
SELECT is(
  (SELECT count(*) FROM applications WHERE applicant_id = 'aaa11111-1111-1111-1111-111111111111')::integer,
  1,
  'Contractor can see their own applications'
);

SELECT * FROM finish();
ROLLBACK;
