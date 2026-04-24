-- pgTAP tests for avatars Storage RLS (organization spec Task 15.5)
-- 既存の自己フォルダ書き込み + 新 avatars_client_profile_write_* ポリシー検証
-- Run with: supabase test db

BEGIN;
SELECT plan(5);

-- ============================================================
-- Setup
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('66666666-aaaa-bbbb-cccc-000000000001', 'av-owner@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('66666666-aaaa-bbbb-cccc-000000000002', 'av-admin@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('66666666-aaaa-bbbb-cccc-000000000003', 'av-staff@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('66666666-aaaa-bbbb-cccc-000000000004', 'av-other@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id IN (
  '66666666-aaaa-bbbb-cccc-000000000001',
  '66666666-aaaa-bbbb-cccc-000000000004'
);

INSERT INTO organizations (id, owner_id) VALUES
  ('66666666-aaaa-bbbb-cccc-100000000001', '66666666-aaaa-bbbb-cccc-000000000001'),
  ('66666666-aaaa-bbbb-cccc-100000000004', '66666666-aaaa-bbbb-cccc-000000000004');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('66666666-aaaa-bbbb-cccc-100000000001', '66666666-aaaa-bbbb-cccc-000000000001', 'owner'),
  ('66666666-aaaa-bbbb-cccc-100000000001', '66666666-aaaa-bbbb-cccc-000000000002', 'admin'),
  ('66666666-aaaa-bbbb-cccc-100000000001', '66666666-aaaa-bbbb-cccc-000000000003', 'staff'),
  ('66666666-aaaa-bbbb-cccc-100000000004', '66666666-aaaa-bbbb-cccc-000000000004', 'owner');

-- ============================================================
-- Test 1: 自分のフォルダへの INSERT は既存 avatars_owner_insert で通る
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"66666666-aaaa-bbbb-cccc-000000000001","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES (
      'avatars',
      '66666666-aaaa-bbbb-cccc-000000000001/client-profile.jpg',
      '66666666-aaaa-bbbb-cccc-000000000001'
    );$$,
  'owner can INSERT into own folder (avatars_owner_insert)'
);

-- ============================================================
-- Test 2: 組織 Admin が Owner のフォルダに INSERT 可
--   （avatars_client_profile_write_insert + is_org_admin_or_owner_of）
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"66666666-aaaa-bbbb-cccc-000000000002","role":"authenticated"}';

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES (
      'avatars',
      '66666666-aaaa-bbbb-cccc-000000000001/admin-upload.jpg',
      '66666666-aaaa-bbbb-cccc-000000000002'
    );$$,
  'admin can INSERT into same-org Owner folder (avatars_client_profile_write_insert)'
);

-- ============================================================
-- Test 3: Staff は Owner フォルダに書き込めない
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"66666666-aaaa-bbbb-cccc-000000000003","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES (
      'avatars',
      '66666666-aaaa-bbbb-cccc-000000000001/staff-upload.jpg',
      '66666666-aaaa-bbbb-cccc-000000000003'
    );$$,
  '42501',
  NULL,
  'staff cannot INSERT into Owner folder (blocked by is_org_admin_or_owner_of owner/admin constraint)'
);

-- ============================================================
-- Test 4: 他組織 Admin は別組織 Owner のフォルダに書き込めない
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"66666666-aaaa-bbbb-cccc-000000000002","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES (
      'avatars',
      '66666666-aaaa-bbbb-cccc-000000000004/cross-org.jpg',
      '66666666-aaaa-bbbb-cccc-000000000002'
    );$$,
  '42501',
  NULL,
  'admin cannot INSERT into OTHER organization Owner folder'
);

-- ============================================================
-- Test 5: SELECT (閲覧) は既存の public SELECT ポリシーで全認証済みユーザー可
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"66666666-aaaa-bbbb-cccc-000000000004","role":"authenticated"}';

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name = '66666666-aaaa-bbbb-cccc-000000000001/client-profile.jpg'
  ),
  'any authenticated user can SELECT avatars via public SELECT policy'
);

SELECT * FROM finish();
ROLLBACK;
