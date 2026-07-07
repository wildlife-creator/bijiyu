-- ============================================================
-- pgTAP: job_images RLS が組織対応済み（Staff/Admin から見て「同組織メンバー
-- 作成の案件」にも画像 INSERT/UPDATE/DELETE できるか）
-- ============================================================
--
-- 検証内容:
--   Setup: Org1 (Owner=A, org_role=admin=B, org_role=staff=C) + 部外者 D
--          Job1 = Owner が作成 / Job2 = Staff C が作成 (owner_id=C)
--
--   INSERT:
--     1. Owner が Job1 (own) に画像追加 → OK
--     2. Owner が Job2 (Staff作成の同組織) に画像追加 → OK  ← 修正対象
--     3. Staff が Job1 (Owner作成の同組織) に画像追加 → OK  ← 修正対象
--     4. Admin が Job2 (Staff作成の同組織) に画像追加 → OK  ← 修正対象
--     5. 部外者 D が Job1 に画像追加 → 拒否 (throws_ok)
--
--   DELETE:
--     6. Owner が Staff 追加の Job2 の画像を削除 → OK  ← 修正対象
--     7. Staff が Owner 追加の Job1 の画像を削除 → OK  ← 修正対象
--     8. 部外者 D が Job1 の画像を削除 → silent block (行数不変で検証)
--
-- 実装: 20260707130000_job_images_org_aware_rls.sql
-- ============================================================

BEGIN;
SELECT plan(8);

-- ------------------------------------------------------------
-- Setup: seed と衝突しない UUID を使う (aa11aa11 prefix)
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aa11aa11-0000-0000-0000-000000000001', 'jimg-owner@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa11aa11-0000-0000-0000-000000000002', 'jimg-staff@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa11aa11-0000-0000-0000-000000000003', 'jimg-admin@ipu-test.local',   crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa11aa11-0000-0000-0000-000000000004', 'jimg-outsider@ipu-test.local', crypt('p', gen_salt('bf')), NOW(), '{"provider":"email"}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'オーナー'
  WHERE id = 'aa11aa11-0000-0000-0000-000000000001';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = '担当者'
  WHERE id = 'aa11aa11-0000-0000-0000-000000000002';
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = '管理者'
  WHERE id = 'aa11aa11-0000-0000-0000-000000000003';
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = '部外者'
  WHERE id = 'aa11aa11-0000-0000-0000-000000000004';

INSERT INTO subscriptions (user_id, plan_type, status, stripe_subscription_id) VALUES
  ('aa11aa11-0000-0000-0000-000000000001', 'corporate', 'active', 'sub_jimg_owner');

INSERT INTO organizations (id, owner_id) VALUES
  ('aa11aa11-5555-0000-0000-000000000001', 'aa11aa11-0000-0000-0000-000000000001');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('aa11aa11-5555-0000-0000-000000000001', 'aa11aa11-0000-0000-0000-000000000001', 'owner'),
  ('aa11aa11-5555-0000-0000-000000000001', 'aa11aa11-0000-0000-0000-000000000002', 'staff'),
  ('aa11aa11-5555-0000-0000-000000000001', 'aa11aa11-0000-0000-0000-000000000003', 'admin');

-- Job1: Owner 作成 (owner_id = Owner, organization_id = org)
-- Job2: Staff 作成 (owner_id = Staff, organization_id = org)
INSERT INTO jobs (id, owner_id, organization_id, title, description, status) VALUES
  ('aa11aa11-1111-0000-0000-000000000001', 'aa11aa11-0000-0000-0000-000000000001', 'aa11aa11-5555-0000-0000-000000000001', 'Job1 Owner作成', 'desc', 'draft'),
  ('aa11aa11-1111-0000-0000-000000000002', 'aa11aa11-0000-0000-0000-000000000002', 'aa11aa11-5555-0000-0000-000000000001', 'Job2 Staff作成', 'desc', 'draft');

-- ------------------------------------------------------------
-- Test 1: Owner が Job1 (own) に画像追加 → OK
-- ------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.job_images (job_id, image_url, image_type, sort_order)
    VALUES ('aa11aa11-1111-0000-0000-000000000001', 'https://example.com/o1.png', 'photo', 0)$$,
  'Owner が自案件 (Job1) に画像を追加できる'
);

-- ------------------------------------------------------------
-- Test 2: Owner が Job2 (Staff 作成の同組織) に画像追加 → OK (組織対応)
-- ------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.job_images (job_id, image_url, image_type, sort_order)
    VALUES ('aa11aa11-1111-0000-0000-000000000002', 'https://example.com/o2.png', 'photo', 0)$$,
  'Owner が同組織 Staff 作成案件 (Job2) にも画像を追加できる'
);

-- ------------------------------------------------------------
-- Test 3: Staff が Job1 (Owner 作成の同組織) に画像追加 → OK (組織対応)
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.job_images (job_id, image_url, image_type, sort_order)
    VALUES ('aa11aa11-1111-0000-0000-000000000001', 'https://example.com/s1.png', 'photo', 1)$$,
  'Staff が同組織 Owner 作成案件 (Job1) にも画像を追加できる'
);

-- ------------------------------------------------------------
-- Test 4: Admin (org_role=admin) が Job2 (Staff 作成の同組織) に画像追加 → OK
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000003","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.job_images (job_id, image_url, image_type, sort_order)
    VALUES ('aa11aa11-1111-0000-0000-000000000002', 'https://example.com/a1.png', 'photo', 1)$$,
  'Admin (org_role) が同組織 Staff 作成案件 (Job2) にも画像を追加できる'
);

-- ------------------------------------------------------------
-- Test 5: 部外者 D が Job1 に画像追加 → 拒否
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000004","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.job_images (job_id, image_url, image_type, sort_order)
    VALUES ('aa11aa11-1111-0000-0000-000000000001', 'https://example.com/x.png', 'photo', 99)$$,
  NULL,
  NULL,
  '部外者は他組織の案件に画像を追加できない'
);

-- ------------------------------------------------------------
-- Test 6: Owner が Staff 追加の Job2 画像 (a1.png) を削除 → OK
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000001","role":"authenticated"}';

DELETE FROM public.job_images WHERE image_url = 'https://example.com/a1.png';

SELECT is(
  (SELECT COUNT(*)::int FROM public.job_images WHERE image_url = 'https://example.com/a1.png'),
  0,
  'Owner は同組織 Admin が追加した Job2 の画像を削除できる (行数=0)'
);

-- ------------------------------------------------------------
-- Test 7: Staff が Owner 追加の Job1 画像 (o1.png) を削除 → OK
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000002","role":"authenticated"}';

DELETE FROM public.job_images WHERE image_url = 'https://example.com/o1.png';

SELECT is(
  (SELECT COUNT(*)::int FROM public.job_images WHERE image_url = 'https://example.com/o1.png'),
  0,
  'Staff は同組織 Owner が追加した Job1 の画像を削除できる (行数=0)'
);

-- ------------------------------------------------------------
-- Test 8: 部外者 D が Job1 の残画像を削除 → silent block (行数不変)
-- ------------------------------------------------------------
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"aa11aa11-0000-0000-0000-000000000004","role":"authenticated"}';

DELETE FROM public.job_images WHERE job_id = 'aa11aa11-1111-0000-0000-000000000001';

RESET role;
SELECT is(
  (SELECT COUNT(*)::int FROM public.job_images WHERE job_id = 'aa11aa11-1111-0000-0000-000000000001'),
  1,
  '部外者の DELETE は silent block されて Job1 の画像 (s1.png) は残る'
);

SELECT * FROM finish();
ROLLBACK;
