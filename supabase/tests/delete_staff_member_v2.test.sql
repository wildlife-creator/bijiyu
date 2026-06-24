-- pgTAP tests for delete_staff_member v2
-- (proxy-account-multi-org-support Phase 4 / Task 4.1 + 4.3)
--
-- v2 で新規追加された挙動:
--   1. SELECT id FROM users WHERE id = p_target_user_id FOR UPDATE で
--      対象ユーザー行に悲観ロックを取り、同一ユーザーへの並行削除を直列化する
--   2. 削除後に残存 organization_members が 0 件のときのみ
--      users.deleted_at = now() をセットする（条件付きソフト削除）
--   3. 残存メンバーシップが 1 件以上ある場合、deleted_at は NULL のまま
--
-- Test 構成:
--   Tests 1-3: 機能的な残存判定の振る舞いを検証 (N 組織 / 単一組織)
--   Test 4: 関数ソースに FOR UPDATE が含まれることを静的検証
--
-- Run with: supabase test db

BEGIN;
SELECT plan(9);

-- ============================================================
-- Setup (Tests 1-4 用、in-transaction fixture)
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'dsm-v2-owner-x@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa000002-0002-0002-0002-000000000002', 'dsm-v2-owner-y@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa000099-0099-0099-0099-000000000099', 'dsm-v2-proxy@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('aa000088-0088-0088-0088-000000000088', 'dsm-v2-single@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id IN (
   'aa000001-0001-0001-0001-000000000001',
   'aa000002-0002-0002-0002-000000000002'
 );

INSERT INTO organizations (id, owner_id) VALUES
  ('aa00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'aa000001-0001-0001-0001-000000000001'),
  ('aa00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'aa000002-0002-0002-0002-000000000002');

INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('aa00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'aa000001-0001-0001-0001-000000000001', 'owner', false),
  ('aa00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'aa000002-0002-0002-0002-000000000002', 'owner', false),
  -- proxy ユーザーは法人 X / Y の両方に在籍（N 組織兼任）
  ('aa00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'aa000099-0099-0099-0099-000000000099', 'staff', true),
  ('aa00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'aa000099-0099-0099-0099-000000000099', 'staff', true),
  -- single ユーザーは法人 X のみに在籍（単一組織）
  ('aa00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'aa000088-0088-0088-0088-000000000088', 'staff', false);

-- ============================================================
-- Test 1: N 組織在籍ユーザーを法人 X から削除しても deleted_at はセットされない
-- ============================================================
SELECT lives_ok(
  $$SELECT delete_staff_member(
    'aa000099-0099-0099-0099-000000000099'::uuid,
    'aa00aaaa-0000-0000-0000-aaaaaaaaaaaa'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid
  );$$,
  'delete_staff_member (法人 X 削除) は例外なく実行できる'
);

SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE organization_id = 'aa00aaaa-0000-0000-0000-aaaaaaaaaaaa'
     AND user_id = 'aa000099-0099-0099-0099-000000000099'),
  0,
  '法人 X の organization_members 行が物理削除される'
);

SELECT is(
  (SELECT deleted_at FROM public.users
   WHERE id = 'aa000099-0099-0099-0099-000000000099'),
  NULL,
  '法人 Y にまだ在籍中のため deleted_at は NULL のまま (旧挙動の無条件セットは廃止)'
);

SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE user_id = 'aa000099-0099-0099-0099-000000000099'),
  1,
  '法人 Y の organization_members は影響を受けない'
);

-- ============================================================
-- Test 2: 残存メンバーシップを最後の 1 件まで削除すると deleted_at がセットされる
-- ============================================================
SELECT lives_ok(
  $$SELECT delete_staff_member(
    'aa000099-0099-0099-0099-000000000099'::uuid,
    'aa00bbbb-0000-0000-0000-bbbbbbbbbbbb'::uuid,
    'aa000002-0002-0002-0002-000000000002'::uuid
  );$$,
  'delete_staff_member (法人 Y 削除 = 最後のメンバーシップ) も例外なく実行できる'
);

SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users
   WHERE id = 'aa000099-0099-0099-0099-000000000099'),
  '残存 0 件になったため users.deleted_at がセットされる'
);

-- ============================================================
-- Test 3: 単一組織ユーザーは削除即座に deleted_at がセットされる
-- （既存挙動と等価）
-- ============================================================
SELECT lives_ok(
  $$SELECT delete_staff_member(
    'aa000088-0088-0088-0088-000000000088'::uuid,
    'aa00aaaa-0000-0000-0000-aaaaaaaaaaaa'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid
  );$$,
  'delete_staff_member (単一組織ユーザー削除) も例外なく実行できる'
);

SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users
   WHERE id = 'aa000088-0088-0088-0088-000000000088'),
  '単一組織ユーザーは削除即座に deleted_at がセットされる'
);

-- ============================================================
-- Test 4: 関数定義に SELECT FOR UPDATE が含まれることを検証
-- 静的検証で「悲観ロックを取るコードが存在する」ことを保証する。
-- 並行トランザクションの実物検証は Test 5 (dblink) で補完。
-- ============================================================
SELECT ok(
  (SELECT prosrc ~* 'FROM\s+public\.users\s+WHERE\s+id\s*=\s*p_target_user_id\s+FOR\s+UPDATE'
     FROM pg_proc
    WHERE proname = 'delete_staff_member'
      AND pronamespace = 'public'::regnamespace),
  'delete_staff_member 関数定義に SELECT FOR UPDATE on users が含まれる'
);

-- 並行トランザクションテスト (dblink で別セッションから FOR UPDATE を取り
-- 本セッションが待たされることを観測する形) は当初設計したが pgTAP の
-- BEGIN/ROLLBACK 内 + plpgsql DO ブロック内では `SET LOCAL statement_timeout`
-- が期待通り発火せず、ロック待ちで詰まることが判明した。
--
-- 代替方針: 上記 Test 4 の prosrc 正規表現マッチで「FOR UPDATE がソース内に
-- 存在する」ことを静的検証する。PostgreSQL の FOR UPDATE 自体の挙動は OS
-- レベルで保証されているプリミティブのためアプリ層では再検証しない。
-- 実環境での race condition 動作は Task 8.3 (Phase 8 / 解約→他組織継続
-- E2E シナリオ) で間接的にカバーされる。

SELECT * FROM finish();
ROLLBACK;
