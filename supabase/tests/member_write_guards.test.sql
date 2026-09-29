-- ============================================================
-- pgTAP: 会員セッションからの保護列の書き換え禁止（20260929130000_member_write_guards.sql）
-- - 穴だった操作が 42501 で拒否されること
-- - アプリが会員セッションで行う正規の書き込みはこれまでどおり通ること
-- - service_role / postgres（運営・Webhook・cron）の書き込みは通ること
-- seed のユーザー:
--   contractor@test.local = 11111111-… / client@test.local = 22222222-…（組織 55555555-…）
--   staff@test.local = 33333333-…（組織 55555555-… の代理アカウント）
--   応募 adf10000-…04/05/06 = client の案件への applied（応募者 adf11111-…）
-- ============================================================
BEGIN;
SELECT plan(39);

-- 会員として振る舞う
CREATE OR REPLACE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
END;
$$;

-- テスト用データ（運営側で作る）
INSERT INTO jobs (id, owner_id, organization_id, title, status)
VALUES ('9a9a0000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '【guard test】案件', 'open');
-- スレッドは seed の eeeeeeee-…01（client の組織 55555555-… × contractor 11111111-…）を使う

-- ============================================================
-- A. 拒否されること（穴だった操作）
-- ============================================================
SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');

SELECT throws_ok($$UPDATE users SET identity_verified = NOT identity_verified WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員は本人確認済みの印を自分で変えられない');
SELECT throws_ok($$UPDATE users SET ccus_verified = NOT ccus_verified WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員は CCUS 登録済みの印を自分で変えられない');
SELECT throws_ok($$UPDATE users SET role = 'client' WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員は役割（role）を変えられない');
SELECT throws_ok($$UPDATE users SET is_hidden = true WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員は運営アカウント扱い（is_hidden）にできない');
SELECT throws_ok($$UPDATE users SET list_plan_rank = 3 WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員は一覧の並び順ランクを変えられない');
SELECT throws_ok($$UPDATE users SET email = 'x@example.com' WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', NULL, 'users: 会員はメールアドレス列を直接変えられない（認証経由のみ）');

SELECT throws_ok($$INSERT INTO identity_verifications (user_id, document_type, document_url_1, status)
  VALUES ('11111111-1111-1111-1111-111111111111', 'identity', '11111111-1111-1111-1111-111111111111/a.png', 'approved')$$,
  '42501', NULL, 'identity_verifications: 承認済みで申請できない');

SELECT throws_ok($$INSERT INTO applications (job_id, applicant_id, headcount, status)
  VALUES ('9a9a0000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'accepted')$$,
  '42501', NULL, 'applications: 発注済みの状態で応募を作れない');

SELECT throws_ok($$INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, operating_status, rating_overall)
  VALUES ('adf10000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'adf11111-1111-1111-1111-111111111111', 'completed', 1)$$,
  '42501', NULL, 'user_reviews: 会員セッションからは評価を書けない（完了報告は運営権限で書く）');
SELECT throws_ok($$INSERT INTO client_reviews (application_id, reviewer_id, reviewee_id, operating_status)
  VALUES ('adf10000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'completed')$$,
  '42501', NULL, 'client_reviews: 会員セッションからは評価を書けない');

SELECT throws_ok($$INSERT INTO messages (thread_id, sender_id, body, is_proxy)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '11111111-1111-1111-1111-111111111111', 'x', true)$$,
  '42501', NULL, 'messages: 代理アカウントでない会員は「代理」印を付けられない');
SELECT throws_ok($$INSERT INTO messages (thread_id, sender_id, body, is_scout, scout_status)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '11111111-1111-1111-1111-111111111111', 'x', true, 'pending')$$,
  '42501', NULL, 'messages: 受注者はスカウトを送れない');
SELECT throws_ok($$INSERT INTO messages (thread_id, sender_id, body, read_at)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '11111111-1111-1111-1111-111111111111', 'x', now())$$,
  '42501', NULL, 'messages: 既読の状態で送れない');
SELECT throws_ok($$UPDATE message_threads SET last_email_to_contractor_at = now() WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'$$,
  '42501', NULL, 'message_threads: メール通知の時刻は会員が変えられない');
SELECT throws_ok($$UPDATE message_threads SET participant_1_id = '33333333-3333-3333-3333-333333333333' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'$$,
  '42501', NULL, 'message_threads: 参加者は後から変えられない');

SELECT throws_ok($$SELECT public.complete_registration('22222222-2222-2222-2222-222222222222', 'ハック', '太郎', '男性', '1990-01-01'::date, '東京都')$$,
  '42501', NULL, 'complete_registration: 他人のプロフィールは上書きできない');

SELECT throws_ok($$SELECT count(*) FROM client_admin_memos$$,
  '42501', NULL, 'client_admin_memos: 会員は運営メモを読めない');

-- 発注者として
SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');

SELECT throws_ok($$UPDATE jobs SET is_urgent = true WHERE id = '9a9a0000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'jobs: 会員は急募を自分で付けられない');
SELECT throws_ok($$INSERT INTO jobs (owner_id, title, status, is_urgent)
  VALUES ('22222222-2222-2222-2222-222222222222', '急募つき', 'open', true)$$,
  '42501', NULL, 'jobs: 急募つきで案件を作れない');
SELECT throws_ok($$INSERT INTO jobs (owner_id, organization_id, title, status)
  VALUES ('22222222-2222-2222-2222-222222222222', 'f777a111-1111-1111-1111-111111111111', '他社の組織で作成', 'open')$$,
  '42501', NULL, 'jobs: 所属していない組織の案件を作れない');
SELECT throws_ok($$UPDATE jobs SET owner_id = '11111111-1111-1111-1111-111111111111' WHERE id = '9a9a0000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'jobs: 所有者は変えられない');
SELECT throws_ok($$UPDATE client_profiles SET is_urgent_option = true WHERE user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', NULL, 'client_profiles: 会員は急募フラグを変えられない');
SELECT throws_ok($$UPDATE applications SET status = 'accepted', applicant_id = '11111111-1111-1111-1111-111111111111'
  WHERE id = 'adf10000-0000-4000-8000-000000000004'$$,
  '42501', NULL, 'applications: 発注時に応募者を差し替えられない');

-- ============================================================
-- B. これまでどおりできること（アプリの正規の書き込み）
-- ============================================================
SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');

SELECT lives_ok($$UPDATE users SET last_name = '田中', bio = '自己紹介', skill_tags = ARRAY['型枠設置工'], avatar_url = NULL, updated_at = now()
  WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  'users: プロフィール編集の項目は変えられる');
SELECT lives_ok($$INSERT INTO identity_verifications (user_id, document_type, document_url_1, document_url_2, status)
  VALUES ('11111111-1111-1111-1111-111111111111', 'identity', '11111111-1111-1111-1111-111111111111/a.png', '11111111-1111-1111-1111-111111111111/b.png', 'pending')$$,
  'identity_verifications: 申請中での申請はできる');
SELECT lives_ok($$INSERT INTO applications (job_id, applicant_id, headcount, working_type, message, status)
  VALUES ('9a9a0000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 1, '平日', 'よろしくお願いします', 'applied')$$,
  'applications: 応募はできる');
SELECT lives_ok($$INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '11111111-1111-1111-1111-111111111111', 'こんにちは', false, false)$$,
  'messages: 通常のメッセージは送れる');
SELECT lives_ok($$UPDATE message_threads SET updated_at = now() WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'$$,
  'message_threads: 更新日時は更新できる');
SELECT lives_ok($$SELECT public.complete_registration('11111111-1111-1111-1111-111111111111', '田中', '一郎', '男性', '1990-01-01'::date, '東京都')$$,
  'complete_registration: 本人の登録はできる');

-- 応募者本人の取り下げ（RLS applications_update_cancel）
SELECT pg_temp.act_as('adf11111-1111-1111-1111-111111111111');
SELECT lives_ok($$UPDATE applications SET status = 'cancelled' WHERE id = 'adf10000-0000-4000-8000-000000000006'$$,
  'applications: 応募者は自分の応募を取り下げられる');

-- 発注者として
SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT lives_ok($$INSERT INTO jobs (owner_id, organization_id, title, status)
  VALUES ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '【guard test】通常の案件', 'open')$$,
  'jobs: 所属組織の案件は作れる');
SELECT lives_ok($$UPDATE jobs SET title = '【guard test】タイトル変更', status = 'closed' WHERE id = '9a9a0000-0000-4000-8000-000000000001'$$,
  'jobs: 内容の編集・掲載終了はできる');
SELECT lives_ok($$INSERT INTO client_profiles (user_id, display_name) VALUES ('22222222-2222-2222-2222-222222222222', '表示名テスト')
  ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name$$,
  'client_profiles: 発注者情報の保存（upsert・user_id を含む）はできる');
SELECT lives_ok($$UPDATE applications SET status = 'accepted', first_work_date = '2026-11-01', work_location = '東京都千代田区1-1', client_notes = 'よろしく'
  WHERE id = 'adf10000-0000-4000-8000-000000000004'$$,
  'applications: 発注可否で発注できる');
SELECT lives_ok($$UPDATE applications SET status = 'rejected', rejection_reason = '今回は見送り'
  WHERE id = 'adf10000-0000-4000-8000-000000000005'$$,
  'applications: 発注可否でお断りできる');
SELECT lives_ok($$INSERT INTO scout_templates (owner_id, organization_id, title, body)
  VALUES ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'テンプレ', '本文')$$,
  'scout_templates: 所属組織のテンプレートは作れる');

-- 代理アカウント（staff）
SELECT pg_temp.act_as('33333333-3333-3333-3333-333333333333');
SELECT lives_ok($$INSERT INTO messages (thread_id, sender_id, body, is_scout, scout_status, is_proxy)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '33333333-3333-3333-3333-333333333333', 'スカウトです', true, 'pending', true)$$,
  'messages: 代理アカウントは「代理」印つきでスカウトを送れる');

-- ============================================================
-- C. 運営側（postgres / service_role）はこれまでどおり
-- ============================================================
RESET role;
RESET request.jwt.claims;
SELECT lives_ok($$UPDATE jobs SET is_urgent = true WHERE id = '9a9a0000-0000-4000-8000-000000000001'$$,
  '運営側は急募を付けられる');
SELECT hasnt_column('public', 'client_profiles', 'admin_memo', '運営メモは全会員が読める client_profiles に無い');

SELECT * FROM finish();
ROLLBACK;
