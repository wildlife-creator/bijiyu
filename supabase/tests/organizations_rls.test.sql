-- pgTAP tests for organizations RLS (organization spec Task 15.2)
-- 新ポリシー `organizations_select_public` と旧ポリシー廃止の検証
-- Run with: supabase test db

BEGIN;
SELECT plan(5);

-- ============================================================
-- Test fixtures
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('22222222-aaaa-bbbb-cccc-000000000001', 'org-alive@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('22222222-aaaa-bbbb-cccc-000000000002', 'org-deleted@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('22222222-aaaa-bbbb-cccc-000000000003', 'org-viewer@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('22222222-aaaa-bbbb-cccc-000000000099', 'org-sysadmin@test.local',crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id IN (
  '22222222-aaaa-bbbb-cccc-000000000001',
  '22222222-aaaa-bbbb-cccc-000000000002'
);
UPDATE public.users SET role = 'admin' WHERE id = '22222222-aaaa-bbbb-cccc-000000000099';

INSERT INTO organizations (id, owner_id, deleted_at) VALUES
  ('22222222-aaaa-bbbb-cccc-100000000001', '22222222-aaaa-bbbb-cccc-000000000001', NULL),
  ('22222222-aaaa-bbbb-cccc-100000000002', '22222222-aaaa-bbbb-cccc-000000000002', NOW() - interval '1 day');

-- ============================================================
-- Test 1: organizations_select_public — authenticated users see alive org
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-aaaa-bbbb-cccc-000000000003","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = '22222222-aaaa-bbbb-cccc-100000000001'),
  1,
  'authenticated user can SELECT alive organization via organizations_select_public'
);

-- ============================================================
-- Test 2: Soft-deleted organization is hidden from public SELECT
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = '22222222-aaaa-bbbb-cccc-100000000002'),
  0,
  'soft-deleted organization is hidden from public SELECT'
);

-- ============================================================
-- Test 3: System admin can SELECT soft-deleted org via organizations_select_admin
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"22222222-aaaa-bbbb-cccc-000000000099","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = '22222222-aaaa-bbbb-cccc-100000000002'),
  1,
  'admin can SELECT soft-deleted org via organizations_select_admin'
);

-- ============================================================
-- Test 4: Old policies organizations_select / organizations_select_thread_participant are dropped
-- ============================================================
SET LOCAL role TO postgres;

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname IN ('organizations_select', 'organizations_select_thread_participant')),
  0,
  'old policies organizations_select / _thread_participant are dropped'
);

-- ============================================================
-- Test 5: is_same_org() function is still usable from other RLS policies
-- ============================================================
SELECT has_function(
  'public',
  'is_same_org',
  ARRAY['uuid', 'uuid'],
  'is_same_org() function is still usable from other RLS policies'
);

SELECT * FROM finish();
ROLLBACK;
