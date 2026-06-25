-- ============================================================
-- pgTAP tests for email_recycle_sync_identity
-- (email-recycle-on-delete spec 修正、2026-06-25)
--
-- 検証項目:
--   1. legacy 形式 (provider_id = email 文字列) の identity が
--      to_email に書き換わる
--   2. uuid 形式 (provider_id = user_id) の identity は provider_id
--      は据え置きで、identity_data.email のみ書き換わる
--   3. email カラム (generated) が identity_data.email に連動する
--   4. 復元時 (from = 印付き, to = 原本) も対称に動く
--   5. 該当 user に identity が無い (invite 直後) → NO-OP で例外なし
--   6. SECURITY DEFINER で search_path=public
-- ============================================================

BEGIN;
SELECT plan(9);

-- ============================================================
-- Setup: 2 種類の identity 構造を持つ user を作る
--   user_legacy: legacy 形式 (seed.sql 由来、provider_id = email)
--   user_modern: uuid 形式 (signUp 由来、provider_id = user_id)
--   user_no_identity: invite 直後で identity 未作成
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('eecf0001-0001-4001-8001-000000000001', 'sync-legacy@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('eecf0002-0002-4002-8002-000000000002', 'sync-modern@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('eecf0003-0003-4003-8003-000000000003', 'sync-empty@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- handle_new_user は public.users のみ作るため、auth.identities は明示的に
-- INSERT する。

-- legacy 形式: provider_id = email 文字列 (seed.sql で直接 INSERT された旧形式)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'eecf0001-0001-4001-8001-000000000001',
  'sync-legacy@test.local',
  '{"sub":"eecf0001-0001-4001-8001-000000000001","email":"sync-legacy@test.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
);

-- modern 形式: provider_id = user_id 文字列 (Supabase signUp / inviteUserByEmail 由来)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'eecf0002-0002-4002-8002-000000000002',
  'eecf0002-0002-4002-8002-000000000002',  -- user_id 文字列 (uuid 形式)
  '{"sub":"eecf0002-0002-4002-8002-000000000002","email":"sync-modern@test.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
);

-- user_no_identity: identity を作らない (invite 直後 = まだ accept されていない状態を再現)
-- 何もしない

-- ============================================================
-- Test 1: legacy 形式 user で provider_id が to_email に書き換わる
-- ============================================================
SELECT email_recycle_sync_identity(
  'eecf0001-0001-4001-8001-000000000001'::uuid,
  'sync-legacy@test.local',
  'deleted-20260625-aaaa-sync-legacy@test.local'
);

SELECT is(
  (SELECT provider_id FROM auth.identities
    WHERE user_id = 'eecf0001-0001-4001-8001-000000000001'
      AND provider = 'email'),
  'deleted-20260625-aaaa-sync-legacy@test.local',
  'Test 1: legacy 形式 (provider_id = email 文字列) → 印付き email に書き換わる'
);

-- ============================================================
-- Test 2: identity_data.email も書き換わる
-- ============================================================
SELECT is(
  (SELECT identity_data->>'email' FROM auth.identities
    WHERE user_id = 'eecf0001-0001-4001-8001-000000000001'
      AND provider = 'email'),
  'deleted-20260625-aaaa-sync-legacy@test.local',
  'Test 2: identity_data.email も印付き email に書き換わる'
);

-- ============================================================
-- Test 3: email カラム (generated) も連動する
-- ============================================================
SELECT is(
  (SELECT email FROM auth.identities
    WHERE user_id = 'eecf0001-0001-4001-8001-000000000001'
      AND provider = 'email'),
  'deleted-20260625-aaaa-sync-legacy@test.local',
  'Test 3: email generated column が identity_data.email に連動して書き換わる'
);

-- ============================================================
-- Test 4: modern 形式 (uuid provider_id) → provider_id は据え置き
-- ============================================================
SELECT email_recycle_sync_identity(
  'eecf0002-0002-4002-8002-000000000002'::uuid,
  'sync-modern@test.local',
  'deleted-20260625-bbbb-sync-modern@test.local'
);

SELECT is(
  (SELECT provider_id FROM auth.identities
    WHERE user_id = 'eecf0002-0002-4002-8002-000000000002'
      AND provider = 'email'),
  'eecf0002-0002-4002-8002-000000000002',
  'Test 4: uuid 形式 provider_id は据え置き (user_id 文字列のまま)'
);

-- ============================================================
-- Test 5: modern 形式でも identity_data.email は更新される
-- ============================================================
SELECT is(
  (SELECT identity_data->>'email' FROM auth.identities
    WHERE user_id = 'eecf0002-0002-4002-8002-000000000002'
      AND provider = 'email'),
  'deleted-20260625-bbbb-sync-modern@test.local',
  'Test 5: uuid 形式でも identity_data.email は印付き email に書き換わる'
);

-- ============================================================
-- Test 6: 復元方向 (from = 印付き, to = 原本) も対称に動く
-- ============================================================
SELECT email_recycle_sync_identity(
  'eecf0001-0001-4001-8001-000000000001'::uuid,
  'deleted-20260625-aaaa-sync-legacy@test.local',
  'sync-legacy@test.local'
);

SELECT is(
  (SELECT provider_id FROM auth.identities
    WHERE user_id = 'eecf0001-0001-4001-8001-000000000001'
      AND provider = 'email'),
  'sync-legacy@test.local',
  'Test 6: 復元方向 (印付き → 原本) も対称に provider_id を戻す'
);

-- ============================================================
-- Test 7: identity が無い user に対しても例外なし
-- ============================================================
SELECT lives_ok(
  $$SELECT email_recycle_sync_identity(
    'eecf0003-0003-4003-8003-000000000003'::uuid,
    'sync-empty@test.local',
    'deleted-20260625-cccc-sync-empty@test.local'
  );$$,
  'Test 7: identity が無い user (invite 直後等) でも例外を投げず NO-OP'
);

-- ============================================================
-- Test 8: SECURITY DEFINER である
-- ============================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE proname = 'email_recycle_sync_identity'
      AND pronamespace = 'public'::regnamespace),
  true,
  'Test 8: email_recycle_sync_identity は SECURITY DEFINER'
);

-- ============================================================
-- Test 9: proconfig に search_path=public 含まれる
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'email_recycle_sync_identity'
      AND pronamespace = 'public'::regnamespace
      AND 'search_path=public' = ANY(proconfig)
  ),
  'Test 9: email_recycle_sync_identity.proconfig に search_path=public'
);

SELECT * FROM finish();
ROLLBACK;
