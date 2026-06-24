-- ============================================================
-- pgTAP tests for delete_staff_member v3
-- (email-recycle-on-delete spec / Task 4)
--
-- v3 で新規追加された挙動:
--   1. 戻り値型 jsonb で { user_id, globally_deleted } を返す
--   2. globally_deleted は「本 RPC で users.deleted_at を NULL → now() に
--      遷移させた場合のみ true」(残存 1 件以上 / 既削除 / 行未存在は false)
--
-- v2 の挙動 (FOR UPDATE / 残存判定 / scout_templates 移譲) は完全維持。
-- v2 既存テスト (delete_staff_member_v2.test.sql) と同じ fixture pattern を踏襲。
--
-- Run with: supabase test db
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Setup
-- N 組織在籍 (兼任) + 単一組織 (1 法人のみ) の 2 ユーザーで検証
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aa030001-0001-4001-8001-000000000001', 'dsm-v3-owner-x@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa030002-0002-4002-8002-000000000002', 'dsm-v3-owner-y@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('aa030099-0099-4099-8099-000000000099', 'dsm-v3-proxy@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb,
   '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('aa030088-0088-4088-8088-000000000088', 'dsm-v3-single@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb,
   '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client'
 WHERE id IN (
   'aa030001-0001-4001-8001-000000000001',
   'aa030002-0002-4002-8002-000000000002'
 );

INSERT INTO organizations (id, owner_id) VALUES
  ('aa030aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa030001-0001-4001-8001-000000000001'),
  ('aa030bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa030002-0002-4002-8002-000000000002');

INSERT INTO organization_members (organization_id, user_id, org_role,
  is_proxy_account) VALUES
  ('aa030aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa030001-0001-4001-8001-000000000001', 'owner', false),
  ('aa030bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa030002-0002-4002-8002-000000000002', 'owner', false),
  -- proxy: 法人 X / Y 兼任
  ('aa030aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa030099-0099-4099-8099-000000000099', 'staff', true),
  ('aa030bbb-0000-4000-8000-bbbbbbbbbbbb',
   'aa030099-0099-4099-8099-000000000099', 'staff', true),
  -- single: 法人 X のみ
  ('aa030aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa030088-0088-4088-8088-000000000088', 'staff', false);

-- ============================================================
-- Test 1: N 組織在籍ユーザーを法人 X から削除
--         → 法人 Y に残存中なので globally_deleted=false
-- ============================================================
SELECT is(
  (SELECT delete_staff_member(
    'aa030099-0099-4099-8099-000000000099'::uuid,
    'aa030aaa-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    'aa030001-0001-4001-8001-000000000001'::uuid
  ) -> 'globally_deleted')::text::boolean,
  false,
  'Test 1: N 組織兼任 → 1 法人削除では globally_deleted=false'
);

-- ============================================================
-- Test 2: 続けて法人 Y から削除 = 最後の 1 件
--         → 残存 0 件、deleted_at が NULL → now() に遷移
--         → globally_deleted=true
-- ============================================================
SELECT is(
  (SELECT delete_staff_member(
    'aa030099-0099-4099-8099-000000000099'::uuid,
    'aa030bbb-0000-4000-8000-bbbbbbbbbbbb'::uuid,
    'aa030002-0002-4002-8002-000000000002'::uuid
  ) -> 'globally_deleted')::text::boolean,
  true,
  'Test 2: 最後のメンバーシップ削除 → globally_deleted=true'
);

-- ============================================================
-- Test 3: 単一組織ユーザーの削除 → 即座に deleted_at セット
--         → globally_deleted=true
-- ============================================================
SELECT is(
  (SELECT delete_staff_member(
    'aa030088-0088-4088-8088-000000000088'::uuid,
    'aa030aaa-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    'aa030001-0001-4001-8001-000000000001'::uuid
  ) -> 'globally_deleted')::text::boolean,
  true,
  'Test 3: 単一組織 → globally_deleted=true'
);

-- ============================================================
-- Test 4: 戻り値 jsonb に user_id が含まれること
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aa030077-0077-4077-8077-000000000077', 'dsm-v3-shape@test.local',
   crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb,
   '{"invited_role":"staff"}'::jsonb, NOW(), NOW());

INSERT INTO organization_members (organization_id, user_id, org_role,
  is_proxy_account) VALUES
  ('aa030aaa-0000-4000-8000-aaaaaaaaaaaa',
   'aa030077-0077-4077-8077-000000000077', 'staff', false);

SELECT is(
  (SELECT delete_staff_member(
    'aa030077-0077-4077-8077-000000000077'::uuid,
    'aa030aaa-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    'aa030001-0001-4001-8001-000000000001'::uuid
  ) ->> 'user_id'),
  'aa030077-0077-4077-8077-000000000077',
  'Test 4: 戻り値 jsonb に user_id が含まれる'
);

-- ============================================================
-- Test 5: 既に deleted_at セット済みの user 再削除 → globally_deleted=false
-- 単一組織ユーザーを 1 度削除 → deleted_at セット済み → 別組織から再呼び出し
-- (実運用では起きないが、condition 分岐の挙動を明示)
--
-- 注: 残存 organization_members は既に空なので 4 番目の UPDATE で
-- WHERE deleted_at IS NULL がマッチせず FOUND=false → globally_deleted=false
-- ============================================================
SELECT is(
  (SELECT delete_staff_member(
    'aa030088-0088-4088-8088-000000000088'::uuid,
    'aa030bbb-0000-4000-8000-bbbbbbbbbbbb'::uuid,
    'aa030002-0002-4002-8002-000000000002'::uuid
  ) -> 'globally_deleted')::text::boolean,
  false,
  'Test 5: 既に deleted_at セット済み user の再呼び出し → globally_deleted=false'
);

SELECT * FROM finish();
ROLLBACK;
