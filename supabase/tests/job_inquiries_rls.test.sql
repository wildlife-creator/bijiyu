-- pgTAP tests for job-inquiry RLS (job_inquiries テーブル)
-- Run with: supabase test db
-- seed と重複しない専用 UUID を使用する（7b99 prefix）。

BEGIN;
SELECT plan(13);

-- ============================================================
-- Setup（privileged role = RLS バイパスで下準備）
-- ============================================================
-- 送信者・宛先・組織メンバー・第三者を作成（handle_new_user が public.users を作る）
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('7b990000-0000-0000-0000-0000000000a1'::uuid, 'ji-sender@test.local',     crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('7b990000-0000-0000-0000-0000000000a2'::uuid, 'ji-target-indiv@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('7b990000-0000-0000-0000-0000000000a3'::uuid, 'ji-target-corp@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('7b990000-0000-0000-0000-0000000000a4'::uuid, 'ji-org-staff@test.local',    crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('7b990000-0000-0000-0000-0000000000a5'::uuid, 'ji-third@test.local',        crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- 法人組織（owner = corp client、member = staff）
INSERT INTO organizations (id, owner_id) VALUES
  ('7b990000-0000-0000-0000-0000000000c1'::uuid, '7b990000-0000-0000-0000-0000000000a3'::uuid);
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('7b990000-0000-0000-0000-0000000000c1'::uuid, '7b990000-0000-0000-0000-0000000000a3'::uuid, 'owner'),
  ('7b990000-0000-0000-0000-0000000000c1'::uuid, '7b990000-0000-0000-0000-0000000000a4'::uuid, 'staff');

-- 問い合わせ2件: 個人プラン宛（org NULL）と法人プラン宛（org あり）
INSERT INTO job_inquiries (id, sender_id, target_client_id, target_organization_id, name, email, topics, content)
VALUES
  ('7b990000-0000-0000-0000-0000000000e1'::uuid, '7b990000-0000-0000-0000-0000000000a1'::uuid, '7b990000-0000-0000-0000-0000000000a2'::uuid, NULL,                                          '送信者', 'ji-sender@test.local', ARRAY['その他']::text[], '個人宛'),
  ('7b990000-0000-0000-0000-0000000000e2'::uuid, '7b990000-0000-0000-0000-0000000000a1'::uuid, '7b990000-0000-0000-0000-0000000000a3'::uuid, '7b990000-0000-0000-0000-0000000000c1'::uuid, '送信者', 'ji-sender@test.local', ARRAY['その他']::text[], '法人宛');

-- admin（seed）= 44444444-4444-4444-4444-444444444444 (role='admin')

SET LOCAL role TO authenticated;

-- ============================================================
-- SELECT 可視性
-- ============================================================
-- Test 1: admin は全件 SELECT 可
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT ok(
  (SELECT count(*)::int FROM job_inquiries WHERE id IN ('7b990000-0000-0000-0000-0000000000e1','7b990000-0000-0000-0000-0000000000e2')) = 2,
  'admin can SELECT all job_inquiries'
);

-- Test 2: 個人プラン宛 client 本人は自分宛のみ可（個人宛1件のみ）
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries),
  1,
  'individual target client sees only own inquiry (target_organization_id IS NULL)'
);
SELECT is(
  (SELECT target_client_id::text FROM job_inquiries),
  '7b990000-0000-0000-0000-0000000000a2',
  'individual target client sees exactly the inquiry addressed to them'
);

-- Test 4: 法人プラン宛 client 本人（owner）は法人宛を SELECT 可
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a3","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries),
  1,
  'corporate owner sees the corporate inquiry'
);

-- Test 5: 同一組織メンバー（staff、宛先本人ではない）も法人宛を SELECT 可
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a4","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries),
  1,
  'org member (staff) sees the corporate inquiry via is_same_org'
);
SELECT is(
  (SELECT id::text FROM job_inquiries),
  '7b990000-0000-0000-0000-0000000000e2',
  'org member sees only the corporate inquiry, not the individual one'
);

-- Test 7: 第三者（無関係ユーザー）は 0 件
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a5","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries),
  0,
  'unrelated third party sees 0 job_inquiries'
);

-- Test 8: 送信者本人も自分の送信は SELECT できない（sender に SELECT ポリシー無し）
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries),
  0,
  'sender cannot SELECT own sent inquiries (no sender SELECT policy)'
);

-- ============================================================
-- INSERT
-- ============================================================
-- Test 9: sender = self の INSERT は可
SELECT lives_ok(
  $$INSERT INTO job_inquiries (sender_id, target_client_id, name, email, topics)
    VALUES ('7b990000-0000-0000-0000-0000000000a1', '7b990000-0000-0000-0000-0000000000a2', '送信者', 'ji-sender@test.local', ARRAY['その他']::text[]);$$,
  'sender can INSERT own job_inquiry (WITH CHECK sender_id = auth.uid())'
);

-- Test 10: 他人を sender_id にした INSERT は不可
SELECT throws_ok(
  $$INSERT INTO job_inquiries (sender_id, target_client_id, name, email, topics)
    VALUES ('7b990000-0000-0000-0000-0000000000a5', '7b990000-0000-0000-0000-0000000000a2', 'なりすまし', 'spoof@test.local', ARRAY['その他']::text[]);$$,
  '42501',
  NULL,
  'cannot INSERT job_inquiry with someone else as sender_id'
);

-- ============================================================
-- UPDATE / DELETE: 一般ユーザーは不可（サイレントブロック → データ不変を検証）
-- ============================================================
-- Test 11: 宛先 client が UPDATE してもデータは変わらない（UPDATE ポリシー無し）
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a2","role":"authenticated"}';
UPDATE job_inquiries SET content = 'hacked' WHERE id = '7b990000-0000-0000-0000-0000000000e1';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT content FROM job_inquiries WHERE id = '7b990000-0000-0000-0000-0000000000e1'),
  '個人宛',
  'non-privileged UPDATE does not change job_inquiries (no update policy)'
);

-- Test 12: 宛先 client が DELETE してもレコードは消えない（DELETE ポリシー無し）
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DELETE FROM job_inquiries WHERE id = '7b990000-0000-0000-0000-0000000000e1';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries WHERE id = '7b990000-0000-0000-0000-0000000000e1'),
  1,
  'non-privileged DELETE does not remove job_inquiries row (no delete policy)'
);

-- Test 13: org メンバーでない第三者は法人宛も SELECT 不可（再確認）
SET LOCAL request.jwt.claims TO '{"sub":"7b990000-0000-0000-0000-0000000000a5","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM job_inquiries WHERE id = '7b990000-0000-0000-0000-0000000000e2'),
  0,
  'third party cannot SELECT corporate inquiry'
);

SELECT * FROM finish();
ROLLBACK;
