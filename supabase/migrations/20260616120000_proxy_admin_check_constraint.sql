-- ============================================================
-- proxy-account-multi-org-support Phase 1 / Task 1.1
--
-- R6-5 / R6-6: organization_members に
-- `NOT (is_proxy_account = true AND org_role = 'admin')` の CHECK 制約を追加し、
-- DB レベルで「代理 + admin」の組み合わせを物理的に拒否する（最終防衛線）。
--
-- 手順:
--   Step 1. 既存データに違反行が残っていれば org_role = 'staff' に正規化する
--   Step 2. CHECK 制約を NOT VALID で追加（既存行のスキャンを後段に遅延）
--   Step 3. VALIDATE CONSTRAINT で全行検証
--
-- 注意:
--   - 末尾固定 grant migration (20260617120000_grant_public_schema_to_supabase_roles.sql)
--     より前のタイムスタンプで配置する必要がある
--   - 既存 partial UNIQUE index `organization_members_proxy_unique`
--     （`is_proxy_account = true` の 1 組織 1 件）とは独立に動作する
-- ============================================================

-- 影響行数のログ用カウント（ロールバック検討用に migration 開始時点の件数を記録）
DO $$
DECLARE
  v_violation_count integer;
BEGIN
  SELECT count(*) INTO v_violation_count
    FROM organization_members
   WHERE is_proxy_account = true AND org_role = 'admin';

  RAISE NOTICE
    '[proxy_admin_check_constraint] normalizing % rows (is_proxy_account=true AND org_role=admin)',
    v_violation_count;
END
$$;

-- Step 1: 既存データを正規化（代理 ON + admin → 代理 ON + staff）
UPDATE organization_members
   SET org_role = 'staff'
 WHERE is_proxy_account = true
   AND org_role = 'admin';

-- Step 2: CHECK 制約を NOT VALID で追加
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_proxy_role_check
  CHECK (NOT (is_proxy_account = true AND org_role = 'admin'))
  NOT VALID;

-- Step 3: VALIDATE CONSTRAINT で全行スキャン検証
ALTER TABLE organization_members
  VALIDATE CONSTRAINT organization_members_proxy_role_check;

COMMENT ON CONSTRAINT organization_members_proxy_role_check ON organization_members IS
  'R6 (proxy-account-multi-org-support): 代理アカウント (is_proxy_account = true) は org_role = ''staff'' でなければならない。組織の社員管理権限 (admin) と代理を兼任させない。';
