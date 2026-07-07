-- ============================================================
-- pgTAP: client_recruit_areas RLS が組織対応済み
-- ============================================================
--
-- 検証内容:
--   Setup: Org1 (Owner=A, admin=B, staff=C) + 他組織 Org2 (Owner=D, admin=E)
--
--   INSERT:
--     1. Owner A が自身の client_recruit_areas を INSERT → OK
--     2. 同組織 Admin B が Owner A の client_recruit_areas を INSERT → OK  ← 修正対象
--     3. 他組織 Admin E が Owner A の client_recruit_areas を INSERT → 拒否 (throws)
--     4. 同組織 Staff C が Owner A の client_recruit_areas を INSERT → 拒否 (throws)
--
--   DELETE:
--     5. 同組織 Admin B が Owner A の client_recruit_areas を DELETE → OK  ← 修正対象
--     6. 他組織 Admin E の DELETE は silent block (行数不変)
--
-- 実装: 20260707140000_client_recruit_areas_org_aware_rls.sql
-- ============================================================

BEGIN;
SELECT plan(6);

-- ------------------------------------------------------------
-- Setup: seed と衝突しない UUID を使う (bb22bb22 prefix)
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb22bb22-0000-0000-0000-000000000001', 'cra-owner-a@ipu-test.local',  crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb22bb22-0000-0000-0000-000000000002', 'cra-admin-b@ipu-test.local',  crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb22bb22-0000-0000-0000-000000000003', 'cra-staff-c@ipu-test.local',  crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb22bb22-0000-0000-0000-000000000004', 'cra-owner-d@ipu-test.local',  crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb22bb22-0000-0000-0000-000000000005', 'cra-admin-e@ipu-test.local',  crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'オーナーA'
  WHERE id = 'bb22bb22-0000-0000-0000-000000000001';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = 'アドミンB'
  WHERE id = 'bb22bb22-0000-0000-0000-000000000002';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = 'スタッフC'
  WHERE id = 'bb22bb22-0000-0000-0000-000000000003';
UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'オーナーD'
  WHERE id = 'bb22bb22-0000-0000-0000-000000000004';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = 'アドミンE'
  WHERE id = 'bb22bb22-0000-0000-0000-000000000005';

INSERT INTO subscriptions (user_id, plan_type, status, stripe_subscription_id) VALUES
  ('bb22bb22-0000-0000-0000-000000000001', 'corporate', 'active', 'sub_cra_a'),
  ('bb22bb22-0000-0000-0000-000000000004', 'corporate', 'active', 'sub_cra_d');

INSERT INTO organizations (id, owner_id) VALUES
  ('bb22bb22-5555-0000-0000-000000000001', 'bb22bb22-0000-0000-0000-000000000001'),
  ('bb22bb22-5555-0000-0000-000000000002', 'bb22bb22-0000-0000-0000-000000000004');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  -- Org1: Owner A + Admin B + Staff C
  ('bb22bb22-5555-0000-0000-000000000001', 'bb22bb22-0000-0000-0000-000000000001', 'owner'),
  ('bb22bb22-5555-0000-0000-000000000001', 'bb22bb22-0000-0000-0000-000000000002', 'admin'),
  ('bb22bb22-5555-0000-0000-000000000001', 'bb22bb22-0000-0000-0000-000000000003', 'staff'),
  -- Org2: Owner D + Admin E
  ('bb22bb22-5555-0000-0000-000000000002', 'bb22bb22-0000-0000-0000-000000000004', 'owner'),
  ('bb22bb22-5555-0000-0000-000000000002', 'bb22bb22-0000-0000-0000-000000000005', 'admin');

-- client_profiles は FK 先。Owner A / Owner D 分を用意する
INSERT INTO client_profiles (user_id, display_name) VALUES
  ('bb22bb22-0000-0000-0000-000000000001', 'テスト法人A'),
  ('bb22bb22-0000-0000-0000-000000000004', 'テスト法人D');

-- ------------------------------------------------------------
-- Test 1: Owner A が自身の client_recruit_areas を INSERT → OK
-- ------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.client_recruit_areas (client_id, prefecture, municipality)
    VALUES ('bb22bb22-0000-0000-0000-000000000001', '東京都', '港区')$$,
  'Owner 本人は自身の client_recruit_areas を INSERT できる'
);

-- ------------------------------------------------------------
-- Test 2: 同組織 Admin B が Owner A の client_recruit_areas を INSERT → OK
--   ← 修正対象。組織対応前は RLS violation で失敗していた
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.client_recruit_areas (client_id, prefecture, municipality)
    VALUES ('bb22bb22-0000-0000-0000-000000000001', '大阪府', '大阪市北区')$$,
  '同組織 Admin は Owner の client_recruit_areas を INSERT できる (組織対応)'
);

-- ------------------------------------------------------------
-- Test 3: 他組織 Admin E が Owner A の client_recruit_areas を INSERT → 拒否
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000005","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.client_recruit_areas (client_id, prefecture, municipality)
    VALUES ('bb22bb22-0000-0000-0000-000000000001', '愛知県', NULL)$$,
  NULL,
  NULL,
  '他組織 Admin は他組織 Owner の client_recruit_areas を INSERT できない'
);

-- ------------------------------------------------------------
-- Test 4: 同組織 Staff C が Owner A の client_recruit_areas を INSERT → 拒否
--   (Staff は is_org_admin_or_owner_of で owner/admin 制約に弾かれる)
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000003","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.client_recruit_areas (client_id, prefecture, municipality)
    VALUES ('bb22bb22-0000-0000-0000-000000000001', '福岡県', NULL)$$,
  NULL,
  NULL,
  '同組織 Staff は Owner の client_recruit_areas を INSERT できない'
);

-- ------------------------------------------------------------
-- Test 5: 同組織 Admin B が Owner A の client_recruit_areas を DELETE → OK
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000002","role":"authenticated"}';

DELETE FROM public.client_recruit_areas
  WHERE client_id = 'bb22bb22-0000-0000-0000-000000000001'
    AND prefecture = '大阪府';

RESET role;
SELECT is(
  (SELECT COUNT(*)::int FROM public.client_recruit_areas
     WHERE client_id = 'bb22bb22-0000-0000-0000-000000000001'
       AND prefecture = '大阪府'),
  0,
  '同組織 Admin は Owner の client_recruit_areas を DELETE できる (行数=0)'
);

-- ------------------------------------------------------------
-- Test 6: 他組織 Admin E の DELETE は silent block (行数不変)
--   PostgREST の DELETE は RLS で 0 行削除でも error を返さないため、
--   実際の残行数で検証する
-- ------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"bb22bb22-0000-0000-0000-000000000005","role":"authenticated"}';

DELETE FROM public.client_recruit_areas
  WHERE client_id = 'bb22bb22-0000-0000-0000-000000000001';

RESET role;
SELECT is(
  (SELECT COUNT(*)::int FROM public.client_recruit_areas
     WHERE client_id = 'bb22bb22-0000-0000-0000-000000000001'
       AND prefecture = '東京都'
       AND municipality = '港区'),
  1,
  '他組織 Admin の DELETE は silent block されて Owner A の東京都港区は残る'
);

SELECT * FROM finish();
ROLLBACK;
