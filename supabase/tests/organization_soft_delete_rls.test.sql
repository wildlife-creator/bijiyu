-- pgTAP tests for C 案 soft-delete RLS (organization spec Task 15.7)
-- Owner 退会済み（organizations.deleted_at + users.deleted_at セット、
-- organization_members 全削除）状態で各テーブルの RLS 挙動を検証。
-- Run with: supabase test db

BEGIN;
SELECT plan(5);

-- ============================================================
-- Setup: 退会済み Owner + 配下冷凍（users.deleted_at セット）+
-- 組織ソフトデリート + 過去メッセージスレッド
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('88888888-aaaa-bbbb-cccc-000000000001', 'sd-owner@test.local',     crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('88888888-aaaa-bbbb-cccc-000000000002', 'sd-admin@test.local',     crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('88888888-aaaa-bbbb-cccc-000000000003', 'sd-contractor@test.local',crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users
   SET role = 'client', deleted_at = NOW() - interval '1 day'
 WHERE id = '88888888-aaaa-bbbb-cccc-000000000001';

UPDATE public.users
   SET role = 'staff', deleted_at = NOW() - interval '1 day'
 WHERE id = '88888888-aaaa-bbbb-cccc-000000000002';

-- 組織はソフト削除済み
INSERT INTO organizations (id, owner_id, deleted_at) VALUES
  ('88888888-aaaa-bbbb-cccc-100000000001', '88888888-aaaa-bbbb-cccc-000000000001', NOW() - interval '1 day');

-- organization_members は C 案で全削除済み（INSERT しない）

-- client_profiles は保持
INSERT INTO client_profiles (user_id, display_name)
VALUES ('88888888-aaaa-bbbb-cccc-000000000001', '退会済み組織');

-- 過去のメッセージスレッド + メッセージ（受注者が読めるように残す）
INSERT INTO message_threads (id, participant_1_id, participant_2_id, organization_id, thread_type, created_at, updated_at)
VALUES (
  '88888888-eeee-eeee-eeee-000000000001',
  '88888888-aaaa-bbbb-cccc-000000000001',
  '88888888-aaaa-bbbb-cccc-000000000003',
  '88888888-aaaa-bbbb-cccc-100000000001',
  'message',
  NOW() - interval '10 days',
  NOW() - interval '4 days'
);

INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at)
VALUES
  ('88888888-eeee-eeee-eeee-000000000001', '88888888-aaaa-bbbb-cccc-000000000001', 'ご挨拶',     false, false, NOW() - interval '5 days'),
  ('88888888-eeee-eeee-eeee-000000000001', '88888888-aaaa-bbbb-cccc-000000000003', '了解しました', false, false, NOW() - interval '4 days');

-- 退会組織の scout_templates（Owner 作成、組織 ID セット）
INSERT INTO scout_templates (id, owner_id, organization_id, title, body)
VALUES (
  '88888888-aaaa-bbbb-cccc-900000000001',
  '88888888-aaaa-bbbb-cccc-000000000001',
  '88888888-aaaa-bbbb-cccc-100000000001',
  '退会済みテンプレ',
  '本文'
);

-- ============================================================
-- Test 1: organizations_select_public で該当組織が除外される
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"88888888-aaaa-bbbb-cccc-000000000003","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = '88888888-aaaa-bbbb-cccc-100000000001'),
  0,
  'soft-deleted organization is hidden by organizations_select_public'
);

-- ============================================================
-- Test 2: 受注者が過去スレッドの messages を引き続き SELECT 可
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = '88888888-eeee-eeee-eeee-000000000001'),
  2,
  'contractor can still SELECT historical messages after owner withdrawal'
);

-- ============================================================
-- Test 3: 受注者が client_profiles を SELECT して display_name 取得可
-- ============================================================
SELECT is(
  (SELECT display_name FROM client_profiles WHERE user_id = '88888888-aaaa-bbbb-cccc-000000000001'),
  '退会済み組織',
  'contractor can SELECT client_profiles.display_name (preserved)'
);

-- ============================================================
-- Test 4: 退会組織の scout_templates は RLS でアクセス不能
--   （organization_members 全削除 + Owner users.deleted_at セット
--    → scout_templates_select の条件を満たす人が誰もいない）
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM scout_templates
   WHERE organization_id = '88888888-aaaa-bbbb-cccc-100000000001'),
  0,
  'scout_templates of soft-deleted org are inaccessible via RLS'
);

-- ============================================================
-- Test 5: 退会済み Admin の users row は users_select_public から除外される
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '88888888-aaaa-bbbb-cccc-000000000002'),
  0,
  'withdrawn user row is excluded by users_select_public (deleted_at filter)'
);

SELECT * FROM finish();
ROLLBACK;
