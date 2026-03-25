-- pgTAP tests for auth feature: RLS policies + complete_registration RPC
-- Run with: supabase test db

BEGIN;
SELECT plan(8);

-- ============================================================
-- Setup: create test users in auth.users (triggers public.users)
-- ============================================================

-- User A
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'usera@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

-- User B
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'userb@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

-- ============================================================
-- Test 1: DB trigger creates public.users with role=contractor
-- ============================================================
SELECT is(
  (SELECT role FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  'contractor',
  'DB trigger creates user with role=contractor'
);

-- ============================================================
-- Test 2: Users can read their own record
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  1,
  'User A can read their own record'
);

-- ============================================================
-- Test 3: Users can update their own record
-- ============================================================
UPDATE public.users
SET last_name = 'テスト', first_name = '太郎'
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT last_name FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  'テスト',
  'User A can update their own record'
);

-- ============================================================
-- Test 4: Users cannot update other users records
-- ============================================================
UPDATE public.users
SET last_name = 'ハック'
WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT isnt(
  (SELECT last_name FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'),
  'ハック',
  'User A cannot update User B record'
);

-- ============================================================
-- Test 5: complete_registration RPC creates skills and areas
-- ============================================================
RESET role;

SELECT public.complete_registration(
  '11111111-1111-1111-1111-111111111111',
  '山田',
  '太郎',
  '男性',
  '1990-01-15'::date,
  '東京都',
  'テスト建設',
  '[{"trade_type":"大工","experience_years":5},{"trade_type":"電気工事士","experience_years":3}]'::jsonb,
  ARRAY['東京都','神奈川県']
);

SELECT is(
  (SELECT last_name FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  '山田',
  'complete_registration updates user last_name'
);

-- ============================================================
-- Test 6: Skills are created correctly
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM public.user_skills WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'complete_registration creates 2 skill records'
);

-- ============================================================
-- Test 7: Available areas are created correctly
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM public.user_available_areas WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'complete_registration creates 2 area records'
);

-- ============================================================
-- Test 8: Skills limited to 3 max
-- ============================================================
-- Clean up previous skills
DELETE FROM public.user_skills WHERE user_id = '22222222-2222-2222-2222-222222222222';

SELECT public.complete_registration(
  '22222222-2222-2222-2222-222222222222',
  '鈴木',
  '花子',
  '女性',
  '1985-06-20'::date,
  '大阪府',
  NULL,
  '[{"trade_type":"大工","experience_years":1},{"trade_type":"鳶職","experience_years":2},{"trade_type":"左官","experience_years":3},{"trade_type":"配管工","experience_years":4}]'::jsonb,
  ARRAY['大阪府']
);

SELECT is(
  (SELECT count(*)::int FROM public.user_skills WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  3,
  'complete_registration limits skills to 3 max'
);

-- ============================================================
-- Cleanup
-- ============================================================
SELECT * FROM finish();
ROLLBACK;
