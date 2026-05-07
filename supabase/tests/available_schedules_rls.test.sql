-- pgTAP tests for schedule feature: available_schedules RLS policies
-- Run with: supabase test db
--
-- 検証対象:
--   - SELECT: 全認証ユーザーが任意ユーザーの空き日程を閲覧可能（公開）
--   - INSERT: 自分の user_id 行のみ
--   - UPDATE: 自分の user_id 行のみ
--   - DELETE: 自分の user_id 行のみ
--
-- 使用 UUID は seed.sql / 他 pgTAP テストと衝突しない `as000...` 帯を使う

BEGIN;
SELECT plan(8);

-- ============================================================
-- Setup: create test users
-- ============================================================

-- Contractor user A
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'aa000001-0001-0001-0001-000000000001',
  'schedule-rls-a@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

-- Contractor user B
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'ab000002-0002-0002-0002-000000000002',
  'schedule-rls-b@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

-- ============================================================
-- Setup: insert schedules as service role
-- ============================================================

INSERT INTO public.available_schedules (id, user_id, start_date, end_date)
VALUES
  ('ac000001-0001-0001-0001-000000000001', 'aa000001-0001-0001-0001-000000000001', '2030-07-01', '2030-07-05'),
  ('ad000002-0002-0002-0002-000000000002', 'ab000002-0002-0002-0002-000000000002', '2030-08-01', '2030-08-05');

-- ============================================================
-- Test 1: User A can SELECT user B's schedule (public read)
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa000001-0001-0001-0001-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.available_schedules WHERE user_id = 'ab000002-0002-0002-0002-000000000002'),
  1,
  'User A can SELECT User B schedules (public read)'
);

-- ============================================================
-- Test 2: User A can INSERT own schedule
-- ============================================================
SELECT lives_ok(
  $$INSERT INTO public.available_schedules (user_id, start_date, end_date)
    VALUES ('aa000001-0001-0001-0001-000000000001', '2030-09-01', '2030-09-05')$$,
  'User A can INSERT own schedule'
);

-- ============================================================
-- Test 3: User A cannot INSERT schedule for User B
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO public.available_schedules (user_id, start_date, end_date)
    VALUES ('ab000002-0002-0002-0002-000000000002', '2030-10-01', '2030-10-05')$$,
  NULL,
  NULL,
  'User A cannot INSERT schedule for User B'
);

-- ============================================================
-- Test 4: User A can UPDATE own schedule
-- ============================================================
SELECT lives_ok(
  $$UPDATE public.available_schedules SET end_date = '2030-07-10'
    WHERE id = 'ac000001-0001-0001-0001-000000000001'$$,
  'User A can UPDATE own schedule'
);

-- ============================================================
-- Test 5: User A cannot UPDATE User B's schedule (silent zero rows)
-- ============================================================
UPDATE public.available_schedules SET end_date = '2099-12-31'
  WHERE id = 'ad000002-0002-0002-0002-000000000002';

RESET role;
SELECT is(
  (SELECT end_date::text FROM public.available_schedules WHERE id = 'ad000002-0002-0002-0002-000000000002'),
  '2030-08-05',
  'User A cannot UPDATE User B schedule (end_date unchanged)'
);

-- ============================================================
-- Test 6: User A cannot DELETE User B's schedule (silent zero rows)
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa000001-0001-0001-0001-000000000001","role":"authenticated"}';

DELETE FROM public.available_schedules WHERE id = 'ad000002-0002-0002-0002-000000000002';
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.available_schedules WHERE id = 'ad000002-0002-0002-0002-000000000002'),
  1,
  'User A cannot DELETE User B schedule'
);

-- ============================================================
-- Test 7: User A can DELETE own schedule
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa000001-0001-0001-0001-000000000001","role":"authenticated"}';

DELETE FROM public.available_schedules WHERE id = 'ac000001-0001-0001-0001-000000000001';
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.available_schedules WHERE id = 'ac000001-0001-0001-0001-000000000001'),
  0,
  'User A can DELETE own schedule'
);

-- ============================================================
-- Test 8: User B can SELECT own schedule after User A delete attempt
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"ab000002-0002-0002-0002-000000000002","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.available_schedules WHERE user_id = 'ab000002-0002-0002-0002-000000000002'),
  1,
  'User B still has own schedule (1 row)'
);

SELECT * FROM finish();
ROLLBACK;
