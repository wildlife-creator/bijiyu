-- pgTAP tests for insert_staff_member_with_limit RPC (organization spec Task 15.3)
-- Run with: supabase test db

BEGIN;
SELECT plan(9);

-- ============================================================
-- Setup
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('33333333-aaaa-bbbb-cccc-000000000001', 'ism-owner@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('33333333-aaaa-bbbb-cccc-000000000002', 'ism-staff1@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff","invited_last_name":"山田","invited_first_name":"太郎"}'::jsonb, NOW(), NOW()),
  ('33333333-aaaa-bbbb-cccc-000000000003', 'ism-staff2@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('33333333-aaaa-bbbb-cccc-000000000004', 'ism-proxy@test.local',   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('33333333-aaaa-bbbb-cccc-000000000005', 'ism-proxy2@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = '33333333-aaaa-bbbb-cccc-000000000001';

INSERT INTO organizations (id, owner_id) VALUES
  ('33333333-aaaa-bbbb-cccc-100000000001', '33333333-aaaa-bbbb-cccc-000000000001');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('33333333-aaaa-bbbb-cccc-100000000001', '33333333-aaaa-bbbb-cccc-000000000001', 'owner');

-- ============================================================
-- Test 1: 上限内 INSERT 成功
-- ============================================================
SELECT lives_ok(
  $$SELECT insert_staff_member_with_limit(
    '33333333-aaaa-bbbb-cccc-000000000002'::uuid,
    '33333333-aaaa-bbbb-cccc-100000000001'::uuid,
    'staff',
    false,
    10
  );$$,
  'RPC succeeds within maxStaff limit'
);

SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE organization_id = '33333333-aaaa-bbbb-cccc-100000000001'
     AND user_id = '33333333-aaaa-bbbb-cccc-000000000002'),
  1,
  'staff inserted into organization_members'
);

-- ============================================================
-- Test 2: 既存ユーザーの role / 氏名を変更しない（D 採用）
-- ============================================================
SELECT is(
  (SELECT role FROM public.users WHERE id = '33333333-aaaa-bbbb-cccc-000000000002'),
  'staff',
  'handle_new_user trigger already set role=staff (RPC does not modify users.role)'
);

SELECT is(
  (SELECT last_name FROM public.users WHERE id = '33333333-aaaa-bbbb-cccc-000000000002'),
  '山田',
  'handle_new_user trigger already set last_name (RPC does not modify users.last_name)'
);

-- ============================================================
-- Test 3: 上限到達で STAFF_LIMIT_EXCEEDED
-- ============================================================
SELECT throws_ok(
  $$SELECT insert_staff_member_with_limit(
    '33333333-aaaa-bbbb-cccc-000000000003'::uuid,
    '33333333-aaaa-bbbb-cccc-100000000001'::uuid,
    'staff',
    false,
    1
  );$$,
  'P0001',
  NULL,
  'STAFF_LIMIT_EXCEEDED raised when current >= maxStaff'
);

-- ============================================================
-- Test 4: INVALID_ORG_ROLE
-- ============================================================
SELECT throws_ok(
  $$SELECT insert_staff_member_with_limit(
    '33333333-aaaa-bbbb-cccc-000000000003'::uuid,
    '33333333-aaaa-bbbb-cccc-100000000001'::uuid,
    'owner',
    false,
    10
  );$$,
  'P0001',
  NULL,
  'INVALID_ORG_ROLE raised for non admin/staff'
);

-- ============================================================
-- Test 5: 既存代理ありで is_proxy_account=true → PROXY_ACCOUNT_ALREADY_EXISTS
-- ============================================================
SELECT lives_ok(
  $$SELECT insert_staff_member_with_limit(
    '33333333-aaaa-bbbb-cccc-000000000004'::uuid,
    '33333333-aaaa-bbbb-cccc-100000000001'::uuid,
    'staff',
    true,
    10
  );$$,
  'first proxy account INSERT succeeds'
);

SELECT throws_ok(
  $$SELECT insert_staff_member_with_limit(
    '33333333-aaaa-bbbb-cccc-000000000005'::uuid,
    '33333333-aaaa-bbbb-cccc-100000000001'::uuid,
    'staff',
    true,
    10
  );$$,
  'P0001',
  NULL,
  'PROXY_ACCOUNT_ALREADY_EXISTS raised when another proxy exists'
);

-- ============================================================
-- Test 6: authenticated ロールに EXECUTE 権限が無い
-- （pg_catalog で直接権限確認。pgTAP の SET LOCAL role では pooler
--  経由の挙動が環境依存のため、権限 ACL を直接検証する）
-- ============================================================
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.insert_staff_member_with_limit(uuid, uuid, text, boolean, integer)',
    'EXECUTE'
  ),
  'authenticated role does NOT have EXECUTE privilege on insert_staff_member_with_limit'
);

SELECT * FROM finish();
ROLLBACK;
