-- pgTAP tests for is_org_admin_or_owner_of function (organization spec Task 15.6)
-- SECURITY DEFINER 関数の単体動作検証（RLS 再帰回避の動作確認）
-- Run with: supabase test db

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('77777777-aaaa-bbbb-cccc-000000000001', 'ioa-owner@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000002', 'ioa-admin@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000003', 'ioa-staff@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000004', 'ioa-other@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id IN (
  '77777777-aaaa-bbbb-cccc-000000000001',
  '77777777-aaaa-bbbb-cccc-000000000004'
);

INSERT INTO organizations (id, owner_id) VALUES
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000001'),
  ('77777777-aaaa-bbbb-cccc-100000000004', '77777777-aaaa-bbbb-cccc-000000000004');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000001', 'owner'),
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000002', 'admin'),
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000003', 'staff'),
  ('77777777-aaaa-bbbb-cccc-100000000004', '77777777-aaaa-bbbb-cccc-000000000004', 'owner');

-- ============================================================
-- Test 1: Owner 自身が target_owner の場合 true（uid = target_owner）
-- ============================================================
SELECT ok(
  is_org_admin_or_owner_of(
    '77777777-aaaa-bbbb-cccc-000000000001'::uuid,
    '77777777-aaaa-bbbb-cccc-000000000001'::uuid
  ),
  'Owner self returns true (uid = target_owner)'
);

-- ============================================================
-- Test 2: Admin が同組織 Owner の target_owner について true
-- ============================================================
SELECT ok(
  is_org_admin_or_owner_of(
    '77777777-aaaa-bbbb-cccc-000000000002'::uuid,
    '77777777-aaaa-bbbb-cccc-000000000001'::uuid
  ),
  'Admin in same org returns true for target_owner'
);

-- ============================================================
-- Test 3: Staff は false（owner/admin 制約）
-- ============================================================
SELECT ok(
  NOT is_org_admin_or_owner_of(
    '77777777-aaaa-bbbb-cccc-000000000003'::uuid,
    '77777777-aaaa-bbbb-cccc-000000000001'::uuid
  ),
  'Staff returns false (owner/admin restriction)'
);

-- ============================================================
-- Test 4: 他組織の Admin は false
-- ============================================================
SELECT ok(
  NOT is_org_admin_or_owner_of(
    '77777777-aaaa-bbbb-cccc-000000000002'::uuid,
    '77777777-aaaa-bbbb-cccc-000000000004'::uuid
  ),
  'Admin in different org returns false'
);

-- ============================================================
-- Test 5: 存在しない user_id で false
-- ============================================================
SELECT ok(
  NOT is_org_admin_or_owner_of(
    '99999999-9999-9999-9999-999999999999'::uuid,
    '77777777-aaaa-bbbb-cccc-000000000001'::uuid
  ),
  'non-existent uid returns false'
);

-- ============================================================
-- Test 6: authenticated ロールが EXECUTE 可能（RLS 評価経路で呼べる）
-- ============================================================
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.is_org_admin_or_owner_of(uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated role HAS EXECUTE (needed for RLS evaluation)'
);

SELECT * FROM finish();
ROLLBACK;
