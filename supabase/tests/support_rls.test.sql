-- pgTAP tests for support spec RLS (contacts 組み替え + trouble_reports + 添付バケット)
-- Run with: supabase test db
-- seed と重複しない専用 UUID を使用する。

BEGIN;
SELECT plan(12);

-- ============================================================
-- Setup（privileged role = RLS バイパスで下準備）
-- ============================================================
-- 報告者（非 admin）。auth.users INSERT で handle_new_user トリガーが public.users を作る
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('5a990000-0000-0000-0000-0000000000aa'::uuid, 'support-reporter@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- SELECT 可視性テスト用の既存レコードを1件ずつ投入
INSERT INTO contacts (company_name, name, phone, email, inquiry_type, purpose, industry, detail)
VALUES ('テスト工務店', 'テスト氏', '09000000000', 'seed-contact@test.local', '料金について', '仕事を依頼したい', '大工', 'テスト詳細');

INSERT INTO trouble_reports (id, user_id, reporter_name, counterparty_name, email, content)
VALUES ('5a990000-0000-0000-0000-0000000000bb'::uuid, '5a990000-0000-0000-0000-0000000000aa'::uuid, '報告者', '相手', 'tr@test.local', '初期内容');

-- 管理者（seed）
-- 44444444-4444-4444-4444-444444444444 = admin@test.local (role='admin')

-- ============================================================
-- contacts: 公開 INSERT は削除済み（書き込みは service role のみ）
-- ============================================================
-- Test 1: anon は INSERT 不可
SET LOCAL role TO anon;
SELECT throws_ok(
  $$INSERT INTO contacts (company_name, name, phone, email, inquiry_type, purpose, industry, detail)
    VALUES ('x','x','x','anon@test.local','料金について','仕事を依頼したい','大工','x');$$,
  '42501',
  NULL,
  'anon cannot INSERT into contacts (public insert policy removed)'
);

-- Test 2: 認証済み一般ユーザーも INSERT 不可
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"5a990000-0000-0000-0000-0000000000aa","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO contacts (company_name, name, phone, email, inquiry_type, purpose, industry, detail)
    VALUES ('x','x','x','auth@test.local','料金について','仕事を依頼したい','大工','x');$$,
  '42501',
  NULL,
  'authenticated non-admin cannot INSERT into contacts'
);

-- Test 3: 非 admin は contacts を SELECT できない（0件）
SELECT is(
  (SELECT count(*)::int FROM contacts),
  0,
  'non-admin sees 0 contacts (admin-only SELECT)'
);

-- Test 4: admin は contacts を SELECT できる
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT ok(
  (SELECT count(*)::int FROM contacts) >= 1,
  'admin can SELECT contacts'
);

-- ============================================================
-- trouble_reports: admin のみ SELECT / 本人のみ INSERT / UPDATE・DELETE 不可
-- ============================================================
-- Test 5: admin は trouble_reports を SELECT できる
SELECT ok(
  (SELECT count(*)::int FROM trouble_reports) >= 1,
  'admin can SELECT trouble_reports'
);

-- Test 6: 非 admin は trouble_reports を SELECT できない（自分の報告でも 0件）
SET LOCAL request.jwt.claims TO '{"sub":"5a990000-0000-0000-0000-0000000000aa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM trouble_reports),
  0,
  'non-admin (even reporter) sees 0 trouble_reports (admin-only SELECT)'
);

-- Test 7: 本人 user_id での INSERT は可
SELECT lives_ok(
  $$INSERT INTO trouble_reports (user_id, reporter_name, counterparty_name, email, content)
    VALUES ('5a990000-0000-0000-0000-0000000000aa', '本人', '相手', 'self@test.local', '本人の報告');$$,
  'user can INSERT own trouble_report (WITH CHECK user_id = auth.uid())'
);

-- Test 8: 他人 user_id での INSERT は不可
SELECT throws_ok(
  $$INSERT INTO trouble_reports (user_id, reporter_name, counterparty_name, email, content)
    VALUES ('44444444-4444-4444-4444-444444444444', 'なりすまし', '相手', 'spoof@test.local', '他人として');$$,
  '42501',
  NULL,
  'user cannot INSERT trouble_report with someone else user_id'
);

-- Test 9: 非 admin の UPDATE はデータを変えない（サイレントブロック）
UPDATE trouble_reports SET content = 'hacked'
  WHERE id = '5a990000-0000-0000-0000-0000000000bb';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT content FROM trouble_reports WHERE id = '5a990000-0000-0000-0000-0000000000bb'),
  '初期内容',
  'non-admin UPDATE does not change trouble_reports (no update policy)'
);

-- Test 10: 非 admin の DELETE はレコードを消さない
SET LOCAL request.jwt.claims TO '{"sub":"5a990000-0000-0000-0000-0000000000aa","role":"authenticated"}';
DELETE FROM trouble_reports WHERE id = '5a990000-0000-0000-0000-0000000000bb';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM trouble_reports WHERE id = '5a990000-0000-0000-0000-0000000000bb'),
  1,
  'non-admin DELETE does not remove trouble_reports row (no delete policy)'
);

-- ============================================================
-- support-attachments バケット: 非公開 + 本バケット向けポリシー無し（default deny）
-- ============================================================
SET LOCAL role TO postgres;

-- Test 11: バケットは public = false
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'support-attachments'),
  false,
  'support-attachments bucket is private (public = false)'
);

-- Test 12: storage.objects に support-attachments を許可するポリシーが存在しない
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (qual ILIKE '%support-attachments%' OR with_check ILIKE '%support-attachments%')),
  0,
  'no storage.objects policy references support-attachments (default deny = service role only)'
);

SELECT * FROM finish();
ROLLBACK;
