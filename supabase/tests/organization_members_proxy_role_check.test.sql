-- pgTAP tests for organization_members_proxy_role_check CHECK constraint
-- (proxy-account-multi-org-support Phase 1 / Task 1.1 + 1.5)
--
-- R6-5 / R6-6: `NOT (is_proxy_account = true AND org_role = 'admin')` を
-- DB レベルで強制する CHECK 制約。INSERT / UPDATE 両方で違反は拒否する。
--
-- 注意: 既存の partial UNIQUE index `organization_members_proxy_unique`
-- (`is_proxy_account = true` の 1 組織 1 件) と SQLSTATE が混ざらないよう、
-- 違反テスト用に専用組織を分離して使う。
--
-- Run with: supabase test db

BEGIN;
SELECT plan(7);

-- ============================================================
-- Setup: テスト専用 UUID（seed と重複しない）
-- 3 つの独立した法人を用意し、UNIQUE 制約と CHECK 制約が混ざらないようにする。
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('77777777-aaaa-bbbb-cccc-000000000001', 'r6-owner1@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000002', 'r6-owner2@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000003', 'r6-owner3@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000011', 'r6-staff1@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000012', 'r6-staff2@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000013', 'r6-staff3@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77777777-aaaa-bbbb-cccc-000000000014', 'r6-staff4@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id IN (
   '77777777-aaaa-bbbb-cccc-000000000001',
   '77777777-aaaa-bbbb-cccc-000000000002',
   '77777777-aaaa-bbbb-cccc-000000000003'
 );

INSERT INTO organizations (id, owner_id) VALUES
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000001'),
  ('77777777-aaaa-bbbb-cccc-100000000002', '77777777-aaaa-bbbb-cccc-000000000002'),
  ('77777777-aaaa-bbbb-cccc-100000000003', '77777777-aaaa-bbbb-cccc-000000000003');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('77777777-aaaa-bbbb-cccc-100000000001', '77777777-aaaa-bbbb-cccc-000000000001', 'owner'),
  ('77777777-aaaa-bbbb-cccc-100000000002', '77777777-aaaa-bbbb-cccc-000000000002', 'owner'),
  ('77777777-aaaa-bbbb-cccc-100000000003', '77777777-aaaa-bbbb-cccc-000000000003', 'owner');

-- ============================================================
-- Test 1: 制約が存在することを確認
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_proxy_role_check'
      AND conrelid = 'public.organization_members'::regclass
  ),
  'organization_members_proxy_role_check CHECK 制約が存在する'
);

-- ============================================================
-- Test 2: INSERT で代理 OFF + admin は受理される（org 1 にセットアップ）
-- ============================================================
SELECT lives_ok(
  $$INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account)
    VALUES (
      '77777777-aaaa-bbbb-cccc-100000000001'::uuid,
      '77777777-aaaa-bbbb-cccc-000000000011'::uuid,
      'admin',
      false
    );$$,
  'INSERT: 代理 OFF + admin は受理される'
);

-- ============================================================
-- Test 3: INSERT で代理 ON + staff は受理される（org 2 にセットアップ）
-- ============================================================
SELECT lives_ok(
  $$INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account)
    VALUES (
      '77777777-aaaa-bbbb-cccc-100000000002'::uuid,
      '77777777-aaaa-bbbb-cccc-000000000012'::uuid,
      'staff',
      true
    );$$,
  'INSERT: 代理 ON + staff は受理される'
);

-- ============================================================
-- Test 4: INSERT で代理 ON + admin は CHECK 制約 (23514) で拒否される
-- 新しい org 3（既存の proxy_on 行なし）を使うことで UNIQUE と分離。
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account)
    VALUES (
      '77777777-aaaa-bbbb-cccc-100000000003'::uuid,
      '77777777-aaaa-bbbb-cccc-000000000013'::uuid,
      'admin',
      true
    );$$,
  '23514',
  NULL,
  'INSERT: 代理 ON + admin は CHECK 制約 (23514) で拒否される'
);

-- ============================================================
-- Test 5: 既存の staff 代理 ON 行を admin に UPDATE しようとすると拒否される
-- Test 3 で投入した org 2 の row を使う。is_proxy_account は変更しない
-- (UNIQUE には触れない) → 純粋に CHECK 違反になる。
-- ============================================================
SELECT throws_ok(
  $$UPDATE organization_members
    SET org_role = 'admin'
    WHERE organization_id = '77777777-aaaa-bbbb-cccc-100000000002'::uuid
      AND user_id = '77777777-aaaa-bbbb-cccc-000000000012'::uuid;$$,
  '23514',
  NULL,
  'UPDATE: 代理 ON 行を admin に変更しようとすると CHECK 制約で拒否される'
);

-- ============================================================
-- Test 6: 既存の admin (代理 OFF) 行に代理 ON を UPDATE しようとすると拒否される
-- 新しい org 3 で Owner 1 名のみ → Test 2 と同じ admin 行を入れた後 UPDATE。
-- ただし org 1 には既に Test 2 で admin が入っているが proxy_on の既存行は無いので、
-- proxy_on にセットすると UNIQUE OK / CHECK NG になる。
-- ============================================================
SELECT throws_ok(
  $$UPDATE organization_members
    SET is_proxy_account = true
    WHERE organization_id = '77777777-aaaa-bbbb-cccc-100000000001'::uuid
      AND user_id = '77777777-aaaa-bbbb-cccc-000000000011'::uuid;$$,
  '23514',
  NULL,
  'UPDATE: 代理 OFF + admin 行に代理 ON をセットしようとすると CHECK 制約で拒否される'
);

-- ============================================================
-- Test 7: 既存環境（seed.sql 投入後）に代理 ON + admin の組み合わせが残存しない
-- migration の Step 1 (正規化 UPDATE) が完了している証拠。
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM organization_members
   WHERE is_proxy_account = true AND org_role = 'admin'),
  0,
  '既存データに 代理 ON + admin の組み合わせが 0 件（migration 正規化済み）'
);

SELECT * FROM finish();
ROLLBACK;
