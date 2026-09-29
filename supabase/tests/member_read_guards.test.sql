-- ============================================================
-- pgTAP: 会員セッションから他人に見せない情報を読めないこと（20260929140000_member_read_guards.sql）
-- - Storage: 応募書類・メッセージ添付は「関係する行が見える人」だけが読める
-- - users: メールアドレス・生年月日等の非公開列は会員セッションから読めない（本人の行も）
--   本人は get_my_private_profile()、年齢は get_user_ages() で読める
-- - videos: admin_label は会員セッションから読めない
-- seed のユーザー:
--   contractor@test.local = 11111111-… / client@test.local = 22222222-…（組織 55555555-…）
--   staff@test.local = 33333333-…（組織 55555555-…）/ individual-client@test.local = dd111111-…（無関係）
--   スレッド eeeeeeee-…01 = client の組織 × contractor
--   応募 adf10000-…04 = client の案件への応募（応募者 adf11111-…）
-- ============================================================
BEGIN;
SELECT plan(28);

CREATE OR REPLACE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_postgres() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- テスト用データ（運営側で作る）
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('message-attachments', '22222222-2222-2222-2222-222222222222/rg-attach.png', '22222222-2222-2222-2222-222222222222'),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/rg-unsent.png', '22222222-2222-2222-2222-222222222222'),
  ('application-documents', '22222222-2222-2222-2222-222222222222/rg-doc.pdf', '22222222-2222-2222-2222-222222222222'),
  ('application-documents', '22222222-2222-2222-2222-222222222222/rg-legacy.pdf', '22222222-2222-2222-2222-222222222222'),
  ('application-documents', '22222222-2222-2222-2222-222222222222/rg-other.pdf', '22222222-2222-2222-2222-222222222222');

INSERT INTO messages (thread_id, sender_id, body, image_url)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '22222222-2222-2222-2222-222222222222', '', '22222222-2222-2222-2222-222222222222/rg-attach.png');

UPDATE applications
SET document_urls = ARRAY[
  '22222222-2222-2222-2222-222222222222/rg-doc.pdf',
  'http://127.0.0.1:54321/storage/v1/object/public/application-documents/22222222-2222-2222-2222-222222222222/rg-legacy.pdf'
]
WHERE id = 'adf10000-0000-4000-8000-000000000004';

-- ============================================================
-- A. Storage: message-attachments
-- ============================================================
SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = '22222222-2222-2222-2222-222222222222/rg-attach.png'),
  1, 'message-attachments: スレッドの相手（受注者）は添付を読める');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = '22222222-2222-2222-2222-222222222222/rg-unsent.png'),
  0, 'message-attachments: メッセージに付いていない他人のファイルは読めない');

SELECT pg_temp.act_as('33333333-3333-3333-3333-333333333333');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = '22222222-2222-2222-2222-222222222222/rg-attach.png'),
  1, 'message-attachments: 同じ組織の担当者は添付を読める');

SELECT pg_temp.act_as('dd111111-1111-2222-3333-444455556666');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments' AND name LIKE '22222222-2222-2222-2222-222222222222/%'),
  0, 'message-attachments: 別のスレッドの参加者は読めない（以前は読めた）');

SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments' AND name LIKE '22222222-2222-2222-2222-222222222222/rg-%'),
  2, 'message-attachments: 自分のフォルダは送信前のものも読める（送信直後の署名 URL 用）');

-- ============================================================
-- B. Storage: application-documents
-- ============================================================
SELECT pg_temp.act_as('adf11111-1111-1111-1111-111111111111');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name = '22222222-2222-2222-2222-222222222222/rg-doc.pdf'),
  1, 'application-documents: 応募者は自分の応募に付いた書類を読める');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name = '22222222-2222-2222-2222-222222222222/rg-legacy.pdf'),
  1, 'application-documents: 旧形式（公開 URL で保存）の書類も読める');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name = '22222222-2222-2222-2222-222222222222/rg-other.pdf'),
  0, 'application-documents: 自分の応募に付いていない書類は読めない');

SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name LIKE '22222222-2222-2222-2222-222222222222/rg-%'),
  0, 'application-documents: 無関係の会員は読めない（以前は全件読めた）');

SELECT pg_temp.act_as('33333333-3333-3333-3333-333333333333');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name = '22222222-2222-2222-2222-222222222222/rg-doc.pdf'),
  1, 'application-documents: 案件の組織の担当者は読める');

SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'application-documents' AND name LIKE '22222222-2222-2222-2222-222222222222/rg-%'),
  3, 'application-documents: アップロードした本人は自分のフォルダを読める');

-- ============================================================
-- C. users の列権限
-- ============================================================
SELECT pg_temp.act_as_postgres();
SELECT ok(NOT has_column_privilege('authenticated', 'public.users', 'email', 'SELECT'), 'users.email: 会員セッションは読めない');
SELECT ok(NOT has_column_privilege('authenticated', 'public.users', 'birth_date', 'SELECT'), 'users.birth_date: 会員セッションは読めない');
SELECT ok(NOT has_column_privilege('authenticated', 'public.users', 'stripe_customer_id', 'SELECT'), 'users.stripe_customer_id: 会員セッションは読めない');
SELECT ok(NOT has_column_privilege('authenticated', 'public.users', 'ccus_worker_id', 'SELECT'), 'users.ccus_worker_id: 会員セッションは読めない');
SELECT ok(NOT has_column_privilege('authenticated', 'public.users', 'password_set_at', 'SELECT'), 'users.password_set_at: 会員セッションは読めない');
SELECT ok(NOT has_column_privilege('anon', 'public.users', 'email', 'SELECT'), 'users.email: 未ログインも読めない');
SELECT ok(has_column_privilege('authenticated', 'public.users', 'last_name', 'SELECT'), 'users.last_name: 会員セッションは読める（公開列）');
SELECT ok(has_column_privilege('service_role', 'public.users', 'email', 'SELECT'), 'users.email: service_role（admin client）は読める');
SELECT ok(has_column_privilege('authenticated', 'public.users', 'birth_date', 'UPDATE'), 'users.birth_date: 本人の生年月日の更新はこれまでどおりできる');

SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');
SELECT throws_ok($$SELECT email FROM users WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', NULL, 'users: 他の会員のメールアドレスは読めない');
SELECT lives_ok($$SELECT id, last_name, first_name, avatar_url FROM users WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  'users: 他の会員の公開列は読める');
SELECT is((SELECT email FROM get_my_private_profile()), 'contractor@test.local',
  'get_my_private_profile: 本人のメールアドレスを返す');
SELECT is((SELECT count(*)::int FROM get_my_private_profile()), 1,
  'get_my_private_profile: 本人の 1 行だけを返す');
SELECT is(
  (SELECT age FROM get_user_ages(ARRAY['dd111111-1111-2222-3333-444455556666']::uuid[])),
  date_part('year', age((now() AT TIME ZONE 'Asia/Tokyo')::date, '1988-07-22'::date))::int,
  'get_user_ages: 他の会員の年齢（生年月日ではなく）を返す');

SELECT pg_temp.act_as_postgres();
SELECT ok(NOT has_function_privilege('anon', 'public.get_user_ages(uuid[])', 'EXECUTE'), 'get_user_ages: 未ログインは呼べない');

-- ============================================================
-- D. videos.admin_label
-- ============================================================
SELECT ok(NOT has_column_privilege('authenticated', 'public.videos', 'admin_label', 'SELECT'), 'videos.admin_label: 会員セッションは読めない');
SELECT ok(has_column_privilege('authenticated', 'public.videos', 'cloudflare_uid', 'SELECT'), 'videos.cloudflare_uid: 会員セッションは読める（再生に必要）');

SELECT * FROM finish();
ROLLBACK;
