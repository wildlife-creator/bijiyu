-- pgTAP: 掲載終了(closed)案件を関係者(応募/お気に入り/スカウト)に公開する
-- ポリシー jobs_select_related_closed の回帰テスト
-- Run with: supabase test db

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup: users (seed と重複しない UUID を使用)
-- ============================================================

-- Owner (client, 案件オーナー)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('f0000001-0001-0001-0001-000000000001', 'closed-owner@test.com', crypt('password123', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());
UPDATE public.users SET role = 'client' WHERE id = 'f0000001-0001-0001-0001-000000000001';

-- 応募した受注者
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('f0000002-0002-0002-0002-000000000002', 'closed-applicant@test.com', crypt('password123', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- お気に入り登録した受注者
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('f0000003-0003-0003-0003-000000000003', 'closed-favoriter@test.com', crypt('password123', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- スカウトを受け取った受注者
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('f0000004-0004-0004-0004-000000000004', 'closed-scouted@test.com', crypt('password123', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- 無関係な受注者
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('f0000005-0005-0005-0005-000000000005', 'closed-unrelated@test.com', crypt('password123', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- ============================================================
-- Setup: jobs (service role として INSERT)
-- ============================================================

-- 掲載終了案件
INSERT INTO public.jobs (id, owner_id, title, description, status)
VALUES ('f1000001-0001-0001-0001-000000000001', 'f0000001-0001-0001-0001-000000000001',
  'Closed Job', 'closed job desc', 'closed');

-- 掲載中案件 (無関係ユーザーが読めることの回帰確認用)
INSERT INTO public.jobs (id, owner_id, title, description, status)
VALUES ('f1000002-0002-0002-0002-000000000002', 'f0000001-0001-0001-0001-000000000001',
  'Open Job', 'open job desc', 'open');

-- ============================================================
-- Setup: 関係性データ
-- ============================================================

-- 応募 (applicant → closed job)
INSERT INTO public.applications (job_id, applicant_id, status)
VALUES ('f1000001-0001-0001-0001-000000000001', 'f0000002-0002-0002-0002-000000000002', 'applied');

-- お気に入り (favoriter → closed job)
INSERT INTO public.favorites (user_id, target_type, target_id)
VALUES ('f0000003-0003-0003-0003-000000000003', 'job', 'f1000001-0001-0001-0001-000000000001');

-- スカウト (owner → scouted): thread + is_scout メッセージ
INSERT INTO public.message_threads (id, participant_1_id, participant_2_id)
VALUES ('f2000001-0001-0001-0001-000000000001',
  'f0000001-0001-0001-0001-000000000001', 'f0000004-0004-0004-0004-000000000004');
INSERT INTO public.messages (thread_id, sender_id, body, job_id, is_scout)
VALUES ('f2000001-0001-0001-0001-000000000001', 'f0000001-0001-0001-0001-000000000001',
  'スカウトです', 'f1000001-0001-0001-0001-000000000001', true);

-- ============================================================
-- Test 1: 応募した受注者は掲載終了案件を読める
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f0000002-0002-0002-0002-000000000002","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000001-0001-0001-0001-000000000001'),
  1,
  '応募した受注者は掲載終了案件を読める'
);

-- ============================================================
-- Test 2: お気に入り登録した受注者は掲載終了案件を読める
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"f0000003-0003-0003-0003-000000000003","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000001-0001-0001-0001-000000000001'),
  1,
  'お気に入り登録した受注者は掲載終了案件を読める'
);

-- ============================================================
-- Test 3: スカウトを受け取った受注者は掲載終了案件を読める
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"f0000004-0004-0004-0004-000000000004","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000001-0001-0001-0001-000000000001'),
  1,
  'スカウトを受け取った受注者は掲載終了案件を読める'
);

-- ============================================================
-- Test 4: 無関係な受注者は掲載終了案件を読めない
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"f0000005-0005-0005-0005-000000000005","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000001-0001-0001-0001-000000000001'),
  0,
  '無関係な受注者は掲載終了案件を読めない'
);

-- ============================================================
-- Test 5: 無関係な受注者でも掲載中案件は読める (回帰)
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000002-0002-0002-0002-000000000002'),
  1,
  '無関係な受注者でも掲載中案件は読める (jobs_select_open 回帰)'
);

-- ============================================================
-- Test 6: オーナーは自分の掲載終了案件を読める (既存挙動維持)
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"f0000001-0001-0001-0001-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'f1000001-0001-0001-0001-000000000001'),
  1,
  'オーナーは自分の掲載終了案件を読める'
);

SELECT * FROM finish();
ROLLBACK;
