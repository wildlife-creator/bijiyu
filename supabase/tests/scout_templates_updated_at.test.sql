-- ============================================================
-- pgTAP tests for scout_templates.updated_at trigger + updated_by
--
-- 既存バグの回帰防止:
--   scout_templates は updated_at カラムを持つのに set_updated_at トリガーが
--   貼られておらず、UPDATE しても updated_at が INSERT 時刻のまま前進せず、
--   一覧の ORDER BY updated_at DESC が実質「作成日順」に退化していた。
--   migration 20260711120000 でトリガー補填 + updated_by カラム追加。
--
--   1. updated_by カラムが存在する
--   2. UPDATE が成功する（set_updated_at トリガーが正常動作）
--   3. トリガーが updated_at を現在時刻へ前進させる
--   4. updated_by に別ユーザー（最終更新者）が記録・永続する
-- UUID は seed / 既存テスト未使用の専用値
-- ============================================================
BEGIN;
SELECT plan(4);

-- ============================================================
-- Test fixtures
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('5c000000-0000-4000-8000-000000000001', 'sctpl-owner@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('5c000000-0000-4000-8000-000000000002', 'sctpl-staff@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = '5c000000-0000-4000-8000-000000000001';
UPDATE public.users SET role = 'staff'  WHERE id = '5c000000-0000-4000-8000-000000000002';

INSERT INTO organizations (id, owner_id) VALUES
  ('5c000000-0000-4000-8000-000000000010', '5c000000-0000-4000-8000-000000000001');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('5c000000-0000-4000-8000-000000000010', '5c000000-0000-4000-8000-000000000001', 'owner'),
  ('5c000000-0000-4000-8000-000000000010', '5c000000-0000-4000-8000-000000000002', 'staff');

-- 意図的に古い updated_at を持つ行を INSERT（INSERT では BEFORE UPDATE トリガーは発火しない）。
-- updated_by は初期 NULL（未編集状態）。
INSERT INTO scout_templates (id, owner_id, organization_id, title, body, created_at, updated_at, updated_by)
VALUES (
  '5c000000-0000-4000-8000-000000000020',
  '5c000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000010',
  '最終更新テスト', '本文',
  '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z', NULL
);

-- ============================================================
-- Test 1: updated_by column exists
-- ============================================================
SELECT has_column(
  'public', 'scout_templates', 'updated_by',
  'scout_templates.updated_by column exists'
);

-- ============================================================
-- Test 2: UPDATE succeeds (set_updated_at trigger works)
-- 別ユーザー（staff）を最終更新者として記録する UPDATE
-- ============================================================
SELECT lives_ok(
  $$ UPDATE scout_templates
     SET updated_by = '5c000000-0000-4000-8000-000000000002'
     WHERE id = '5c000000-0000-4000-8000-000000000020' $$,
  'UPDATE on scout_templates succeeds (set_updated_at trigger works)'
);

-- ============================================================
-- Test 3: trigger advanced updated_at past the old literal
-- ============================================================
SELECT cmp_ok(
  (SELECT updated_at FROM scout_templates WHERE id = '5c000000-0000-4000-8000-000000000020'),
  '>',
  '2001-01-01T00:00:00Z'::timestamptz,
  'set_updated_at trigger advances updated_at on UPDATE'
);

-- ============================================================
-- Test 4: updated_by records the editing user (最終更新者が別ユーザーに)
-- ============================================================
SELECT is(
  (SELECT updated_by FROM scout_templates WHERE id = '5c000000-0000-4000-8000-000000000020'),
  '5c000000-0000-4000-8000-000000000002'::uuid,
  'updated_by records the editing user'
);

SELECT * FROM finish();
ROLLBACK;
