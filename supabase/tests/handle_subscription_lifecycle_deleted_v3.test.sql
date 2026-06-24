-- ============================================================
-- pgTAP tests for handle_subscription_lifecycle_deleted v3
-- (email-recycle-on-delete spec / Task 5)
--
-- v3 で新規追加された挙動:
--   1. 戻り値 jsonb に globally_deleted_user_ids: uuid[] フィールドを追加
--   2. Owner 既退会 early-return パスでは空配列を返す
--   3. 通常パスで配下メンバーが globally_deleted（deleted_at が
--      NULL → now() に遷移）した全 user_id が並ぶ
--
-- v2 の挙動 (Owner role downgrade / 案件 closed 化 / FOR UPDATE 直列化 /
--          条件付き deleted_at セット) は完全維持。
--
-- Run with: supabase test db
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Setup
-- 法人 X (corporate plan, owner aa050001) + 配下 staff 2 名
--   - staff_a (aa050099): 法人 X / Y 兼任 → 解約後も Y に残存
--   - staff_b (aa050088): 法人 X のみ → 解約で globally_deleted
-- 法人 Y (corporate plan, owner aa050002): staff_a が在籍
-- 解約イベントは法人 X のサブスクに対して発火
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aa050001-0001-4001-8001-000000000001', 'lcd-v3-owner-x@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa050002-0002-4002-8002-000000000002', 'lcd-v3-owner-y@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa050099-0099-4099-8099-000000000099', 'lcd-v3-staff-a@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb,
   '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('aa050088-0088-4088-8088-000000000088', 'lcd-v3-staff-b@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb,
   '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id IN (
   'aa050001-0001-4001-8001-000000000001',
   'aa050002-0002-4002-8002-000000000002'
 );

INSERT INTO organizations (id, owner_id) VALUES
  ('aa050aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa050001-0001-4001-8001-000000000001'),
  ('aa050bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa050002-0002-4002-8002-000000000002');

INSERT INTO organization_members (organization_id, user_id, org_role,
  is_proxy_account) VALUES
  ('aa050aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa050001-0001-4001-8001-000000000001', 'owner', false),
  ('aa050bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa050002-0002-4002-8002-000000000002', 'owner', false),
  -- staff_a は X / Y 兼任
  ('aa050aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa050099-0099-4099-8099-000000000099', 'staff', true),
  ('aa050bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa050099-0099-4099-8099-000000000099', 'staff', true),
  -- staff_b は X のみ
  ('aa050aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa050088-0088-4088-8088-000000000088', 'staff', false);

-- 法人 X のサブスク（corporate plan、active）
INSERT INTO subscriptions (id, user_id, plan_type, status,
  stripe_subscription_id, current_period_end) VALUES
  ('aa050555-0000-4000-8000-555555555555',
   'aa050001-0001-4001-8001-000000000001',
   'corporate', 'active', 'sub_lcd_v3_x', NOW());

-- ============================================================
-- Test 1: 法人 X のサブスク解約 → staff_b のみ globally_deleted
--         (staff_a は Y に残存)
-- ============================================================
SELECT is(
  (SELECT handle_subscription_lifecycle_deleted(
     jsonb_build_object('stripe_subscription_id', 'sub_lcd_v3_x')
   ) -> 'globally_deleted_user_ids'),
  to_jsonb(ARRAY['aa050088-0088-4088-8088-000000000088'::uuid]),
  'Test 1: 兼任 staff_a は除外、X 専属 staff_b のみ globally_deleted_user_ids に含まれる'
);

-- ============================================================
-- Test 2: 同じ subscription を再度解約呼び出し (Owner 既退会 early-return には
-- ならず、ただ residual な状態だが) → staff_b は既に削除済み = 配列空
-- ============================================================
-- 法人 X の subscription は既に cancelled。再度呼び出すと配下メンバーは
-- 既に削除済みなので空配列を返す。
-- 注: 配下 staff_a は法人 Y に在籍中で deleted_at が NULL のまま。
-- ループ内で再度 staff_a の organization_members を削除しようとするが
-- 既に法人 X からは除去済み (DELETE 対象 0 件)。残存 count = 1 のまま。
-- 結果: globally_deleted_user_ids は空配列。
SELECT is(
  (SELECT handle_subscription_lifecycle_deleted(
     jsonb_build_object('stripe_subscription_id', 'sub_lcd_v3_x')
   ) -> 'globally_deleted_user_ids'),
  '[]'::jsonb,
  'Test 2: 再呼び出しで配下メンバー全員既処理 → globally_deleted_user_ids は空配列'
);

-- ============================================================
-- Test 3: Owner 既退会 early-return パスでも globally_deleted_user_ids が空配列で返る
-- ============================================================
-- 法人 Y のサブスク作成 + Y Owner を退会済みに
INSERT INTO subscriptions (id, user_id, plan_type, status,
  stripe_subscription_id, current_period_end) VALUES
  ('aa050666-0000-4000-8000-666666666666',
   'aa050002-0002-4002-8002-000000000002',
   'corporate', 'active', 'sub_lcd_v3_y', NOW());

UPDATE public.users SET deleted_at = NOW()
 WHERE id = 'aa050002-0002-4002-8002-000000000002';

SELECT is(
  (SELECT handle_subscription_lifecycle_deleted(
     jsonb_build_object('stripe_subscription_id', 'sub_lcd_v3_y')
   ) -> 'globally_deleted_user_ids'),
  '[]'::jsonb,
  'Test 3: Owner 既退会 early-return パスでも globally_deleted_user_ids は空配列'
);

-- ============================================================
-- Test 4: 戻り値 jsonb のキー存在を確認
-- ============================================================
SELECT ok(
  (SELECT handle_subscription_lifecycle_deleted(
     jsonb_build_object('stripe_subscription_id', 'sub_lcd_v3_y')
   ) ? 'globally_deleted_user_ids'),
  'Test 4: 戻り値 jsonb に globally_deleted_user_ids キーが存在する'
);

SELECT * FROM finish();
ROLLBACK;
