-- pgTAP tests for videos（P4 動画基盤）: RLS と CHECK 制約
-- Run with: supabase test db
-- seed と重複しない専用 UUID を使用する。
--
-- 設計:
--   - SELECT: ログイン済みユーザーは他人の公開中（ready）動画も読める（表示 6 画面は通常クライアント）
--             処理中（processing）は管理者のみ
--   - INSERT / UPDATE / DELETE: service_role 専用（ポリシー無し = default deny）
--   - CHECK: provider と cloudflare_uid / embed_source_url の整合

BEGIN;
SELECT plan(11);

-- ============================================================
-- Setup（privileged role = RLS バイパス）
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('7d4e0000-0000-0000-0000-0000000000a1'::uuid, 'video-owner@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('7d4e0000-0000-0000-0000-0000000000a2'::uuid, 'video-viewer@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

INSERT INTO videos (id, user_id, placement, sort_order, provider, embed_source_url, cloudflare_uid, status) VALUES
  ('7d4e0000-0000-0000-0000-0000000000b1', '7d4e0000-0000-0000-0000-0000000000a1', 'contractor_page', 0, 'external', 'https://www.tiktok.com/@t/video/1', NULL, 'ready'),
  ('7d4e0000-0000-0000-0000-0000000000b2', '7d4e0000-0000-0000-0000-0000000000a1', 'contractor_page', 1, 'cloudflare', NULL, 'pgtapuid000000000000000000000001', 'processing');

-- 管理者（seed）: 44444444-4444-4444-4444-444444444444 = admin@test.local (role='admin')

-- ============================================================
-- CHECK 制約（privileged）
-- ============================================================
-- Test 1: cloudflare なのに uid が無い行は拒否
SELECT throws_ok(
  $$INSERT INTO videos (user_id, placement, provider, embed_source_url, status)
    VALUES ('7d4e0000-0000-0000-0000-0000000000a1', 'client_page', 'cloudflare', 'https://x', 'ready')$$,
  '23514',
  NULL,
  'CHECK: provider=cloudflare requires cloudflare_uid and no embed_source_url'
);

-- Test 2: external なのに URL が無い行は拒否
SELECT throws_ok(
  $$INSERT INTO videos (user_id, placement, provider, cloudflare_uid, status)
    VALUES ('7d4e0000-0000-0000-0000-0000000000a1', 'client_page', 'external', 'abc', 'ready')$$,
  '23514',
  NULL,
  'CHECK: provider=external requires embed_source_url and no cloudflare_uid'
);

-- Test 3: 同じ Cloudflare UID は 1 行だけ
SELECT throws_ok(
  $$INSERT INTO videos (user_id, placement, provider, cloudflare_uid, status)
    VALUES ('7d4e0000-0000-0000-0000-0000000000a1', 'client_page', 'cloudflare', 'pgtapuid000000000000000000000001', 'processing')$$,
  '23505',
  NULL,
  'UNIQUE: cloudflare_uid is unique among non-null values'
);

-- ============================================================
-- SELECT: 他人（viewer）は ready のみ
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"7d4e0000-0000-0000-0000-0000000000a2","role":"authenticated"}';

-- Test 4: 他人の ready 行は読める
SELECT is(
  (SELECT count(*)::int FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b1'),
  1,
  'other authenticated user can SELECT ready video'
);

-- Test 5: 他人の processing 行は読めない
SELECT is(
  (SELECT count(*)::int FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b2'),
  0,
  'other authenticated user cannot SELECT processing video'
);

-- Test 6: 本人でも processing は読めない（公開前は管理者のみ）
SET LOCAL request.jwt.claims TO '{"sub":"7d4e0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b2'),
  0,
  'owner cannot SELECT own processing video (admin-only until ready)'
);

-- Test 7: 管理者は processing も読める
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM videos WHERE user_id = '7d4e0000-0000-0000-0000-0000000000a1'),
  2,
  'admin can SELECT both ready and processing videos'
);

-- ============================================================
-- INSERT / UPDATE / DELETE: authenticated には不許可
-- ============================================================
-- Test 8: 本人でも INSERT 不可（登録は管理画面 = service_role）
SET LOCAL request.jwt.claims TO '{"sub":"7d4e0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO videos (user_id, placement, provider, embed_source_url, status)
    VALUES ('7d4e0000-0000-0000-0000-0000000000a1', 'contractor_page', 'external', 'https://www.tiktok.com/@t/video/2', 'ready')$$,
  '42501',
  NULL,
  'authenticated user cannot INSERT videos (service_role only)'
);

-- Test 9: 管理者セッションでも INSERT 不可（管理画面は service_role client を使う）
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO videos (user_id, placement, provider, embed_source_url, status)
    VALUES ('7d4e0000-0000-0000-0000-0000000000a1', 'contractor_page', 'external', 'https://www.tiktok.com/@t/video/3', 'ready')$$,
  '42501',
  NULL,
  'admin session cannot INSERT videos either (writes go through service_role)'
);

-- Test 10: 本人の UPDATE はデータを変えない（サイレントブロック）
SET LOCAL request.jwt.claims TO '{"sub":"7d4e0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
UPDATE videos SET admin_label = 'hacked' WHERE id = '7d4e0000-0000-0000-0000-0000000000b1';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT admin_label FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b1'),
  NULL,
  'authenticated UPDATE does not change videos (no update policy)'
);

-- Test 11: 本人の DELETE はレコードを消さない
SET LOCAL request.jwt.claims TO '{"sub":"7d4e0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DELETE FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b1';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM videos WHERE id = '7d4e0000-0000-0000-0000-0000000000b1'),
  1,
  'authenticated DELETE does not remove videos row (no delete policy)'
);

SELECT * FROM finish();
ROLLBACK;
