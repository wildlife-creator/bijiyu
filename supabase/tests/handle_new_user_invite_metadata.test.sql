-- pgTAP tests for handle_new_user trigger invite metadata (organization spec Task 15.3 / D 対応)
-- Run with: supabase test db

BEGIN;
SELECT plan(4);

-- ============================================================
-- Test 1: invited_role='staff' メタデータで role=staff が設定される
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '44444444-aaaa-bbbb-cccc-000000000001',
  'hnu-staff@test.local',
  crypt('x', gen_salt('bf')),
  NOW(),
  '{}'::jsonb,
  '{"invited_role":"staff","invited_last_name":"田中","invited_first_name":"一郎"}'::jsonb,
  NOW(),
  NOW()
);

SELECT is(
  (SELECT role::text FROM public.users WHERE id = '44444444-aaaa-bbbb-cccc-000000000001'),
  'staff',
  'invited_role=staff sets public.users.role=staff'
);

-- ============================================================
-- Test 2: invited_last_name / invited_first_name が保存される
-- ============================================================
SELECT is(
  (SELECT last_name || '/' || first_name FROM public.users WHERE id = '44444444-aaaa-bbbb-cccc-000000000001'),
  '田中/一郎',
  'invited_last_name / invited_first_name metadata saved to public.users'
);

-- ============================================================
-- Test 3: メタデータ無し（AUTH-001 経路）では role=contractor
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '44444444-aaaa-bbbb-cccc-000000000002',
  'hnu-signup@test.local',
  crypt('x', gen_salt('bf')),
  NOW(),
  '{}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

SELECT is(
  (SELECT role::text FROM public.users WHERE id = '44444444-aaaa-bbbb-cccc-000000000002'),
  'contractor',
  'no metadata → role=contractor (AUTH-001 compatibility)'
);

-- ============================================================
-- Test 4: invited_role='admin' 等の不正値は contractor にフォールバック
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '44444444-aaaa-bbbb-cccc-000000000003',
  'hnu-badmeta@test.local',
  crypt('x', gen_salt('bf')),
  NOW(),
  '{}'::jsonb,
  '{"invited_role":"admin"}'::jsonb,
  NOW(),
  NOW()
);

SELECT is(
  (SELECT role::text FROM public.users WHERE id = '44444444-aaaa-bbbb-cccc-000000000003'),
  'contractor',
  'invited_role=admin falls back to contractor (whitelist protection)'
);

SELECT * FROM finish();
ROLLBACK;
