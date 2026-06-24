-- pgTAP tests for handle_subscription_lifecycle_deleted v2
-- (proxy-account-multi-org-support Phase 4 / Task 4.2 + 4.3)
--
-- v2 で変更された挙動:
--   1. 旧: 配下 Admin / Staff に users.is_active = false をセット
--      新: 配下 Admin / Staff の organization_members 行を物理削除
--   2. 各削除対象に対し SELECT FOR UPDATE on users で悲観ロックを取り、
--      残存メンバーシップを判定して 0 件のときのみ users.deleted_at = now()
--   3. 他組織にも在籍するユーザーは deleted_at がセットされない (N 組織継続)
--
-- Test 構成:
--   Tests 1-4: 行削除 / 残存判定 / N 組織継続の振る舞いを検証
--   Tests 5-6: 旧 is_active=false ロジック撤廃 + FOR UPDATE 静的存在検証
--   Tests 7-8: NO-OP (個人プラン) / Owner ダウングレード既存挙動の維持確認
--
-- Run with: supabase test db

BEGIN;
SELECT plan(10);

-- ============================================================
-- Setup (Tests 1-4 用、in-transaction fixture)
-- 法人 X / 法人 Y を作り、proxy ユーザーを両方に在籍させる
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb000001-0001-0001-0001-000000000001', 'lcd-v2-owner-x@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb000002-0002-0002-0002-000000000002', 'lcd-v2-owner-y@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb000099-0099-0099-0099-000000000099', 'lcd-v2-proxy@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('bb000088-0088-0088-0088-000000000088', 'lcd-v2-single@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('bb000077-0077-0077-0077-000000000077', 'lcd-v2-admin@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id IN (
   'bb000001-0001-0001-0001-000000000001',
   'bb000002-0002-0002-0002-000000000002'
 );

INSERT INTO organizations (id, owner_id) VALUES
  ('bb00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'bb000001-0001-0001-0001-000000000001'),
  ('bb00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'bb000002-0002-0002-0002-000000000002');

INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('bb00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'bb000001-0001-0001-0001-000000000001', 'owner', false),
  ('bb00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'bb000002-0002-0002-0002-000000000002', 'owner', false),
  -- proxy: 法人 X / Y 兼任
  ('bb00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'bb000099-0099-0099-0099-000000000099', 'staff', true),
  ('bb00bbbb-0000-0000-0000-bbbbbbbbbbbb', 'bb000099-0099-0099-0099-000000000099', 'staff', true),
  -- single: 法人 X のみ
  ('bb00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'bb000088-0088-0088-0088-000000000088', 'staff', false),
  -- admin: 法人 X のみ (代理ではない)
  ('bb00aaaa-0000-0000-0000-aaaaaaaaaaaa', 'bb000077-0077-0077-0077-000000000077', 'admin', false);

INSERT INTO subscriptions (user_id, stripe_subscription_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('bb000001-0001-0001-0001-000000000001', 'sub_lcd_v2_x', 'corporate', 'active', now(), now() + interval '30 days');

-- ============================================================
-- Test 1: 法人 X 解約で配下 Admin / Staff の organization_members 行が物理削除される
-- ============================================================
SELECT lives_ok(
  $$SELECT handle_subscription_lifecycle_deleted(
    jsonb_build_object('stripe_subscription_id', 'sub_lcd_v2_x')
  );$$,
  'handle_subscription_lifecycle_deleted (法人 X 解約) は例外なく実行できる'
);

SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE organization_id = 'bb00aaaa-0000-0000-0000-aaaaaaaaaaaa'
     AND org_role IN ('admin', 'staff')),
  0,
  '法人 X 配下の Admin / Staff の organization_members 行が物理削除される (旧 is_active=false は廃止)'
);

-- ============================================================
-- Test 2: 法人 Y にも在籍する proxy ユーザーは deleted_at がセットされない
-- ============================================================
SELECT is(
  (SELECT deleted_at FROM public.users
   WHERE id = 'bb000099-0099-0099-0099-000000000099'),
  NULL,
  '他組織 (法人 Y) に在籍中の proxy は deleted_at が NULL のまま (N 組織継続)'
);

SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE user_id = 'bb000099-0099-0099-0099-000000000099'),
  1,
  '法人 Y の proxy 在籍は影響を受けない (残存 1 件)'
);

-- ============================================================
-- Test 3: 法人 X のみ在籍の single Staff は deleted_at がセットされる
-- ============================================================
SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users
   WHERE id = 'bb000088-0088-0088-0088-000000000088'),
  '残存 0 件の Staff (single) は users.deleted_at がセットされる'
);

-- ============================================================
-- Test 4: Admin (代理ではない) も同様に行削除 + 残存判定で deleted_at セット
-- ============================================================
SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users
   WHERE id = 'bb000077-0077-0077-0077-000000000077'),
  '残存 0 件の Admin も users.deleted_at がセットされる (admin/staff 両方が対象)'
);

-- ============================================================
-- Test 5: 旧 is_active=false ロジックが完全に撤廃されている
-- (関数ソース内に "is_active" が含まれないことで検証)
-- ============================================================
SELECT ok(
  (SELECT prosrc !~* 'is_active'
     FROM pg_proc
    WHERE proname = 'handle_subscription_lifecycle_deleted'
      AND pronamespace = 'public'::regnamespace),
  'handle_subscription_lifecycle_deleted の関数定義に "is_active" 文字列が含まれない (旧凍結ロジック撤廃)'
);

-- ============================================================
-- Test 6: 関数定義に SELECT FOR UPDATE on users が含まれる
-- ============================================================
SELECT ok(
  (SELECT prosrc ~* 'FROM\s+public\.users.*FOR\s+UPDATE'
     FROM pg_proc
    WHERE proname = 'handle_subscription_lifecycle_deleted'
      AND pronamespace = 'public'::regnamespace),
  'handle_subscription_lifecycle_deleted の関数定義に FOR UPDATE on users が含まれる'
);

-- ============================================================
-- Test 7: 配下メンバー 0 名の解約 (個人プラン等) でも安全に実行できる
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb000005-0005-0005-0005-000000000005', 'lcd-v2-solo@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id = 'bb000005-0005-0005-0005-000000000005';

INSERT INTO subscriptions (user_id, stripe_subscription_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('bb000005-0005-0005-0005-000000000005', 'sub_lcd_v2_solo', 'individual', 'active', now(), now() + interval '30 days');

SELECT lives_ok(
  $$SELECT handle_subscription_lifecycle_deleted(
    jsonb_build_object('stripe_subscription_id', 'sub_lcd_v2_solo')
  );$$,
  '個人プラン (配下メンバー 0 名) の解約も安全に NO-OP で完了する'
);

-- ============================================================
-- Test 8: Owner の users.role が contractor にダウングレードされる (既存挙動維持)
-- ============================================================
SELECT is(
  (SELECT role::text FROM public.users
   WHERE id = 'bb000005-0005-0005-0005-000000000005'),
  'contractor',
  'Owner の users.role が client から contractor にダウングレード'
);

-- 並行トランザクションテスト (dblink 経由) は当初設計したが、pgTAP の
-- BEGIN/ROLLBACK 内 + plpgsql DO ブロック内で `SET LOCAL statement_timeout`
-- が期待通り発火せず、ロック待ちで詰まることが判明したため削除した。
-- 代替方針: Test 6 の prosrc 正規表現マッチで FOR UPDATE が関数ソースに
-- 存在することを静的検証する。PostgreSQL の FOR UPDATE 自体は OS レベルで
-- 保証されたプリミティブのためアプリ層では再検証しない。実環境での race
-- condition 動作は Task 8.3 (Phase 8 / 解約→他組織継続 E2E シナリオ) で
-- 間接的にカバーされる。

SELECT * FROM finish();
ROLLBACK;
