-- ============================================================
-- pgTAP: is_paid_user() が組織 (Owner のサブスク相乗り) に対応しているか
-- ============================================================
--
-- 検証内容:
--   - Owner (自分の subscriptions が active) は true
--   - 普通の担当者 (org_role=staff) は Owner のサブスクに相乗り true
--   - 強い担当者 (org_role=admin) も同様に true
--   - Owner サブスク解約後は Staff/Admin ともに false
--   - 組織未所属で subscriptions も無いユーザーは false
--   - 論理削除された Owner のサブスクは相乗り無効 (false)
--
-- 実装: 20260707120000_is_paid_user_org_aware.sql
-- ============================================================

BEGIN;
SELECT plan(9);

-- ------------------------------------------------------------
-- Setup: 組織 + Owner + Staff (org_role=staff) + Admin (org_role=admin)
-- + 対照群 (組織未所属 / 論理削除 Owner)
-- IMPORTANT: seed.sql と衝突しない UUID を使う
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb00bb00-0000-0000-0000-000000000001', 'org-owner@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb00bb00-0000-0000-0000-000000000002', 'org-staff@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb00bb00-0000-0000-0000-000000000003', 'org-admin@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb00bb00-0000-0000-0000-000000000004', 'org-detached@ipu-test.local', crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb00bb00-0000-0000-0000-000000000005', 'org-owner-deleted@ipu-test.local', crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb00bb00-0000-0000-0000-000000000006', 'org-staff-of-deleted@ipu-test.local', crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'オーナー'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000001';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = '担当者'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000002';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = '管理者'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000003';
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = '一般'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000004';
UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = '削除オーナー'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000005';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = '削除下担当'
  WHERE id = 'bb00bb00-0000-0000-0000-000000000006';

-- Owner の corporate active subscription
INSERT INTO subscriptions (user_id, plan_type, status, stripe_subscription_id)
VALUES
  ('bb00bb00-0000-0000-0000-000000000001', 'corporate', 'active', 'sub_ipu_org_owner'),
  ('bb00bb00-0000-0000-0000-000000000005', 'corporate', 'active', 'sub_ipu_org_deleted_owner');

-- 組織 + メンバー
INSERT INTO organizations (id, owner_id) VALUES
  ('bb00bb00-5555-0000-0000-000000000001', 'bb00bb00-0000-0000-0000-000000000001'),
  ('bb00bb00-5555-0000-0000-000000000002', 'bb00bb00-0000-0000-0000-000000000005');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('bb00bb00-5555-0000-0000-000000000001', 'bb00bb00-0000-0000-0000-000000000001', 'owner'),
  ('bb00bb00-5555-0000-0000-000000000001', 'bb00bb00-0000-0000-0000-000000000002', 'staff'),
  ('bb00bb00-5555-0000-0000-000000000001', 'bb00bb00-0000-0000-0000-000000000003', 'admin'),
  ('bb00bb00-5555-0000-0000-000000000002', 'bb00bb00-0000-0000-0000-000000000005', 'owner'),
  ('bb00bb00-5555-0000-0000-000000000002', 'bb00bb00-0000-0000-0000-000000000006', 'staff');

-- 論理削除された Owner (bb00bb00-...-05) の users.deleted_at を立てる
UPDATE public.users SET deleted_at = NOW()
  WHERE id = 'bb00bb00-0000-0000-0000-000000000005';

-- ------------------------------------------------------------
-- Tests
-- ------------------------------------------------------------

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000001'),
  true,
  'Owner: 自身の active subscription で paid=true'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000002'),
  true,
  '普通の担当者 (org_role=staff): Owner のサブスクに相乗りで paid=true'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000003'),
  true,
  '強い担当者 (org_role=admin): Owner のサブスクに相乗りで paid=true'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000004'),
  false,
  '組織未所属で subscription も無いユーザーは paid=false'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000006'),
  false,
  '論理削除された Owner の Staff は相乗り無効 (paid=false)'
);

-- Owner のサブスクを cancelled に変更
UPDATE subscriptions SET status = 'cancelled'
  WHERE stripe_subscription_id = 'sub_ipu_org_owner';

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000001'),
  false,
  'Owner のサブが cancelled になると Owner 自身も paid=false'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000002'),
  false,
  'Owner のサブが cancelled になると Staff の相乗りも paid=false'
);

SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000003'),
  false,
  'Owner のサブが cancelled になると Admin の相乗りも paid=false'
);

-- 論理削除された Owner を復活させても、Owner 自身の users.deleted_at が
-- NULL に戻らない限り Staff は相乗りできないことを念のため確認
-- (5 の Owner はまだ論理削除中で、そのサブスクは active のまま)
SELECT is(
  is_paid_user('bb00bb00-0000-0000-0000-000000000005'),
  false,
  '論理削除された Owner 自身の paid=false (deleted_at フィルタ)'
);

SELECT * FROM finish();
ROLLBACK;
