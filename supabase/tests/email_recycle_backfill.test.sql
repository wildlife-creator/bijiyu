-- ============================================================
-- pgTAP tests for email-recycle backfill migration
-- (email-recycle-on-delete spec / Task 10)
--
-- 検証項目:
--   1. 削除済み user の auth.users.email が SUFFIX_PATTERN に変換される
--   2. バックフィル後の random token が 8 文字であることを確認
--   3. public.users.email は原本のまま (handle_user_email_change v2 が機能)
--   4. 既印付け user (4 文字 / 8 文字 両方) は二重印付けされない (冪等性)
--
-- マイグレーション本体は db reset 時に 1 度だけ実行されるため、本テストでは
-- 同じ UPDATE 文を fixture 上で再実行して挙動を検証する。
--
-- Run with: supabase test db
-- ============================================================

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup: 4 種の user を作成
--   user_a: deleted_at セット済み + 印付け未済 → バックフィル対象
--   user_b: deleted_at セット済み + 既印付け (4 文字 forward) → skip
--   user_c: deleted_at セット済み + 既印付け (8 文字 backfill) → skip
--   user_d: deleted_at NULL (active) → 対象外
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aeae0010-0010-4010-8010-000000000001',
   'backfill-a@bijiyu.jp',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aeae0010-0010-4010-8010-000000000002',
   'deleted-20260615-z9y8-backfill-b@bijiyu.jp',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aeae0010-0010-4010-8010-000000000003',
   'deleted-20260615-a1b2c3d4-backfill-c@bijiyu.jp',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aeae0010-0010-4010-8010-000000000004',
   'backfill-d@bijiyu.jp',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- handle_new_user で public.users が自動生成される。a/b/c のみ deleted_at セット。
UPDATE public.users SET deleted_at = NOW() - interval '1 day'
 WHERE id IN (
   'aeae0010-0010-4010-8010-000000000001',
   'aeae0010-0010-4010-8010-000000000002',
   'aeae0010-0010-4010-8010-000000000003'
 );

-- public.users.email を生 setup 値で確定 (handle_new_user 経由で同期されているはず)
-- 注: トリガー v2 により、印付き形式の email では INSERT トリガー (handle_new_user)
-- 時点で同期はされるが、ここでは「バックフィル前」の origin email を public 側に
-- 入れて Test 3 (public 側不変) を検証可能にする。
UPDATE public.users SET email = 'backfill-b@bijiyu.jp'
 WHERE id = 'aeae0010-0010-4010-8010-000000000002';
UPDATE public.users SET email = 'backfill-c@bijiyu.jp'
 WHERE id = 'aeae0010-0010-4010-8010-000000000003';

-- ============================================================
-- バックフィル本体 (migration と同じ UPDATE 文を再実行)
-- ============================================================
UPDATE auth.users
   SET email = 'deleted-'
             || to_char(now() at time zone 'UTC', 'YYYYMMDD')
             || '-'
             || substring(md5(random()::text || id::text || clock_timestamp()::text), 1, 8)
             || '-'
             || split_part(email, '@', 1)
             || '@'
             || split_part(email, '@', 2)
 WHERE id IN (SELECT id FROM public.users WHERE deleted_at IS NOT NULL)
   AND email !~ '^deleted-\d{8}-[a-z0-9]{4,}-';

-- ============================================================
-- Test 1: user_a (印付け未済) は SUFFIX_PATTERN に変換される
-- ============================================================
SELECT ok(
  (SELECT email ~ '^deleted-\d{8}-[a-z0-9]{4,}-backfill-a@bijiyu\.jp$'
     FROM auth.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000001'),
  'Test 1: 印付け未済の削除済み user の auth.users.email が SUFFIX_PATTERN に変換される'
);

-- ============================================================
-- Test 2: バックフィル後の random token は 8 文字
-- ============================================================
SELECT ok(
  (SELECT email ~ '^deleted-\d{8}-[a-z0-9]{8}-backfill-a@bijiyu\.jp$'
     FROM auth.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000001'),
  'Test 2: バックフィルで生成された random token は 8 文字 [a-z0-9]'
);

-- ============================================================
-- Test 3: public.users.email は原本のまま (handle_user_email_change v2 が
-- 印付き形式への UPDATE をスキップする)
-- ============================================================
SELECT is(
  (SELECT email FROM public.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000001'),
  'backfill-a@bijiyu.jp',
  'Test 3: バックフィルで auth.users.email は印付き化されるが public.users.email は原本のまま'
);

-- ============================================================
-- Test 4: 既印付け (4 文字 forward 形式) は二重印付けされない
-- ============================================================
SELECT is(
  (SELECT email FROM auth.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000002'),
  'deleted-20260615-z9y8-backfill-b@bijiyu.jp',
  'Test 4: 既印付け (4 文字 forward) は二重印付けされず原状維持'
);

-- ============================================================
-- Test 5: 既印付け (8 文字 backfill 形式) も二重印付けされない (冪等性)
-- ============================================================
SELECT is(
  (SELECT email FROM auth.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000003'),
  'deleted-20260615-a1b2c3d4-backfill-c@bijiyu.jp',
  'Test 5: 既印付け (8 文字 backfill) は二重印付けされず原状維持 (冪等性)'
);

-- ============================================================
-- Test 6: active user (deleted_at NULL) は対象外で原状維持
-- ============================================================
SELECT is(
  (SELECT email FROM auth.users
    WHERE id = 'aeae0010-0010-4010-8010-000000000004'),
  'backfill-d@bijiyu.jp',
  'Test 6: active user (deleted_at NULL) はバックフィル対象外'
);

SELECT * FROM finish();
ROLLBACK;
