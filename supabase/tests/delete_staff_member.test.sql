-- pgTAP tests for delete_staff_member RPC (organization spec Task 15.4)
-- Run with: supabase test db

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('55555555-aaaa-bbbb-cccc-000000000001', 'dsm-owner@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('55555555-aaaa-bbbb-cccc-000000000002', 'dsm-staff@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = '55555555-aaaa-bbbb-cccc-000000000001';

INSERT INTO organizations (id, owner_id) VALUES
  ('55555555-aaaa-bbbb-cccc-100000000001', '55555555-aaaa-bbbb-cccc-000000000001');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('55555555-aaaa-bbbb-cccc-100000000001', '55555555-aaaa-bbbb-cccc-000000000001', 'owner'),
  ('55555555-aaaa-bbbb-cccc-100000000001', '55555555-aaaa-bbbb-cccc-000000000002', 'staff');

-- Staff が作成したテンプレート
INSERT INTO scout_templates (id, owner_id, organization_id, title, body) VALUES
  ('55555555-aaaa-bbbb-cccc-900000000001', '55555555-aaaa-bbbb-cccc-000000000002', '55555555-aaaa-bbbb-cccc-100000000001', 'StaffTmpl', '本文');

-- ============================================================
-- Test 1: 正常系 — 3 つの UPDATE/DELETE が atomic に実行される
-- ============================================================
SELECT lives_ok(
  $$SELECT delete_staff_member(
    '55555555-aaaa-bbbb-cccc-000000000002'::uuid,
    '55555555-aaaa-bbbb-cccc-100000000001'::uuid,
    '55555555-aaaa-bbbb-cccc-000000000001'::uuid
  );$$,
  'delete_staff_member executes successfully'
);

-- ============================================================
-- Test 2: scout_templates.owner_id が Owner に移譲されている
-- ============================================================
SELECT is(
  (SELECT owner_id FROM scout_templates WHERE id = '55555555-aaaa-bbbb-cccc-900000000001'),
  '55555555-aaaa-bbbb-cccc-000000000001'::uuid,
  'scout_templates owner_id transferred to organization Owner'
);

-- ============================================================
-- Test 3: organization_members が物理削除されている
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE organization_id = '55555555-aaaa-bbbb-cccc-100000000001'
     AND user_id = '55555555-aaaa-bbbb-cccc-000000000002'),
  0,
  'organization_members row physically deleted'
);

-- ============================================================
-- Test 4: users.deleted_at がセットされている
-- ============================================================
SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users
   WHERE id = '55555555-aaaa-bbbb-cccc-000000000002'),
  'users.deleted_at is set (soft delete)'
);

-- ============================================================
-- Test 5: 冪等性 — 存在しない user_id でも例外を投げない
-- ============================================================
SELECT lives_ok(
  $$SELECT delete_staff_member(
    '99999999-aaaa-bbbb-cccc-999999999999'::uuid,
    '55555555-aaaa-bbbb-cccc-100000000001'::uuid,
    '55555555-aaaa-bbbb-cccc-000000000001'::uuid
  );$$,
  'delete_staff_member is idempotent for non-existent user_id'
);

-- ============================================================
-- Test 6: authenticated ロールに EXECUTE 権限が無い
-- ============================================================
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.delete_staff_member(uuid, uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated role does NOT have EXECUTE on delete_staff_member'
);

SELECT * FROM finish();
ROLLBACK;
