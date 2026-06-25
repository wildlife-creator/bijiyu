-- ============================================================
-- pgTAP tests for email_taken_by_other_user
-- (email-recycle-on-delete spec 修正、2026-06-25)
--
-- restoreDeletedSuffix が updateUserById 呼び出し前に衝突を判定するための
-- 事前確認 RPC。本 user 自身は除外して「他 user に email が取られている
-- か」を返す。
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Setup: 3 種類の user
--   user_a: email = "taken-test-a@test.local"
--   user_b: email = "taken-test-b@test.local"
--   user_c: email は a と同じ「taken-test-a@test.local」(別 user が取った状態を再現)
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('eeec0001-0001-4001-8001-000000000001', 'taken-test-a@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('eeec0002-0002-4002-8002-000000000002', 'taken-test-b@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- ============================================================
-- Test 1: 他 user が email を持っている → true
-- (user_a が "taken-test-a" を持っている状態で、user_b 視点で
--  "taken-test-a" を取られているかを問う)
-- ============================================================
SELECT is(
  email_taken_by_other_user(
    'taken-test-a@test.local',
    'eeec0002-0002-4002-8002-000000000002'::uuid
  ),
  true,
  'Test 1: 他 user が email を保有 → true'
);

-- ============================================================
-- Test 2: 自分自身が email を持っている → false (excluded)
-- (user_a 視点で自分の email を問う → 「他人には取られていない」)
-- ============================================================
SELECT is(
  email_taken_by_other_user(
    'taken-test-a@test.local',
    'eeec0001-0001-4001-8001-000000000001'::uuid
  ),
  false,
  'Test 2: 本 user 自身は除外される → false'
);

-- ============================================================
-- Test 3: 誰も持っていない email → false
-- ============================================================
SELECT is(
  email_taken_by_other_user(
    'nobody-has-this@test.local',
    'eeec0001-0001-4001-8001-000000000001'::uuid
  ),
  false,
  'Test 3: 誰も email を保有していない → false'
);

-- ============================================================
-- Test 4: SECURITY DEFINER である
-- ============================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE proname = 'email_taken_by_other_user'
      AND pronamespace = 'public'::regnamespace),
  true,
  'Test 4: email_taken_by_other_user は SECURITY DEFINER'
);

-- ============================================================
-- Test 5: proconfig に search_path=public 含まれる
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'email_taken_by_other_user'
      AND pronamespace = 'public'::regnamespace
      AND 'search_path=public' = ANY(proconfig)
  ),
  'Test 5: email_taken_by_other_user.proconfig に search_path=public'
);

SELECT * FROM finish();
ROLLBACK;
