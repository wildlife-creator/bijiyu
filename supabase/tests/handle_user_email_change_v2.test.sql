-- ============================================================
-- pgTAP tests for handle_user_email_change v2
-- (email-recycle-on-delete spec / Task 3)
--
-- v2 で変更された挙動:
--   1. 印付き形式 (`^deleted-\d{8}-[a-z0-9]{4,}-`) への UPDATE は
--      public.users.email への同期をスキップする (forward 4 文字 /
--      バックフィル 8 文字を両対応)。
--   2. 関数に `SET search_path = public` が付与されていること
--      (CLAUDE.md SECURITY DEFINER ルール)。
--
-- Run with: supabase test db
-- ============================================================

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup: トランザクション内に検証用 user を 3 人作る
--   user_a: 通常メール変更検証用
--   user_b: 印付き email (4 文字) 検証用
--   user_c: 印付き email (8 文字) 検証用
--
-- handle_new_user トリガーで public.users 行も自動作成される
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aeae0001-0001-4001-8001-000000000001', 'syncv2-a@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aeae0002-0002-4002-8002-000000000002', 'syncv2-b@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aeae0003-0003-4003-8003-000000000003', 'syncv2-c@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- ============================================================
-- Test 1: 通常メール変更では public.users.email が同期される
-- ============================================================
UPDATE auth.users SET email = 'syncv2-a-new@test.local'
  WHERE id = 'aeae0001-0001-4001-8001-000000000001';

SELECT is(
  (SELECT email FROM public.users
    WHERE id = 'aeae0001-0001-4001-8001-000000000001'),
  'syncv2-a-new@test.local',
  'Test 1: 通常メール変更は従来通り public.users.email へ同期される'
);

-- ============================================================
-- Test 2: 印付き email (4 文字 = forward 経路) への UPDATE では同期スキップ
-- ============================================================
UPDATE auth.users SET email = 'deleted-20260617-a3f2-syncv2-b@test.local'
  WHERE id = 'aeae0002-0002-4002-8002-000000000002';

SELECT is(
  (SELECT email FROM public.users
    WHERE id = 'aeae0002-0002-4002-8002-000000000002'),
  'syncv2-b@test.local',
  'Test 2: 印付き email (4 文字) への UPDATE は public.users.email を変更しない'
);

-- ============================================================
-- Test 3: 印付き email (8 文字 = バックフィル経路) への UPDATE でも同期スキップ
-- ============================================================
UPDATE auth.users SET email = 'deleted-20260617-1a2b3c4d-syncv2-c@test.local'
  WHERE id = 'aeae0003-0003-4003-8003-000000000003';

SELECT is(
  (SELECT email FROM public.users
    WHERE id = 'aeae0003-0003-4003-8003-000000000003'),
  'syncv2-c@test.local',
  'Test 3: 印付き email (8 文字) への UPDATE は public.users.email を変更しない'
);

-- ============================================================
-- Test 4: 印付き email から原本 email への戻し UPDATE (= restoreDeletedSuffix)
--         は通常メール変更として同期される (NEW.email が原本 → スキップしない)
-- ============================================================
UPDATE auth.users SET email = 'syncv2-b-restored@test.local'
  WHERE id = 'aeae0002-0002-4002-8002-000000000002';

SELECT is(
  (SELECT email FROM public.users
    WHERE id = 'aeae0002-0002-4002-8002-000000000002'),
  'syncv2-b-restored@test.local',
  'Test 4: 印付き → 原本への戻し UPDATE は public.users.email を同期する'
);

-- ============================================================
-- Test 5: 関数が SECURITY DEFINER である
-- ============================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE proname = 'handle_user_email_change'
      AND pronamespace = 'public'::regnamespace),
  true,
  'Test 5: handle_user_email_change は SECURITY DEFINER である'
);

-- ============================================================
-- Test 6: proconfig に search_path=public が含まれる
-- (CLAUDE.md SECURITY DEFINER ルール準拠、v1 では欠落していた)
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'handle_user_email_change'
      AND pronamespace = 'public'::regnamespace
      AND 'search_path=public' = ANY(proconfig)
  ),
  'Test 6: handle_user_email_change.proconfig に search_path=public が含まれる'
);

SELECT * FROM finish();
ROLLBACK;
