-- pgTAP tests for migration 20260715120000_thread_deleted_visibility_org_aware
-- 退会済みユーザー / 解散済み組織のスレッド経由 SELECT の組織対応 (v2) を検証。
--
-- シナリオ A (メインの修正): 組織共有スレッドの相手 (受注者) が退会したとき、
--   スレッド当事者でない同組織スタッフからも退会済みユーザーの行が見える
--   (= 宛先「実名（退会済み）」表示・送信ガードが機能する)。
-- シナリオ B (同族の穴): スタッフが作ったスレッドで組織が解散 (Owner 退会) した
--   とき、Owner は participant でないが、受注者から Owner の行が見える。
--
-- Run with: supabase test db

BEGIN;
SELECT plan(8);

-- ============================================================
-- Setup
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  -- シナリオ A: orgA (存続) の Owner / Staff + 退会済み受注者
  ('77770715-aaaa-0000-0000-000000000001', 'tdv-owner-a@test.local',      crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77770715-aaaa-0000-0000-000000000002', 'tdv-staff-a@test.local',      crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77770715-aaaa-0000-0000-000000000003', 'tdv-contractor-x@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  -- シナリオ B: orgB (解散済み) の Owner / Staff + 存命の受注者
  ('77770715-bbbb-0000-0000-000000000001', 'tdv-owner-b@test.local',      crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('77770715-bbbb-0000-0000-000000000002', 'tdv-staff-b@test.local',      crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{"invited_role":"staff"}'::jsonb, NOW(), NOW()),
  ('77770715-bbbb-0000-0000-000000000003', 'tdv-contractor-z@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  -- どのスレッドにも関与しない部外者
  ('77770715-cccc-0000-0000-000000000001', 'tdv-outsider@test.local',     crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- シナリオ A: Owner / Staff は存命、受注者 X は退会済み
UPDATE public.users SET role = 'client', last_name = '大家', first_name = '甲'
 WHERE id = '77770715-aaaa-0000-0000-000000000001';
UPDATE public.users SET role = 'staff', last_name = '社員', first_name = '甲'
 WHERE id = '77770715-aaaa-0000-0000-000000000002';
UPDATE public.users SET role = 'contractor', last_name = '田中', first_name = '太郎',
       deleted_at = NOW() - interval '1 day'
 WHERE id = '77770715-aaaa-0000-0000-000000000003';

-- シナリオ B: Owner B / Staff B は退会済み (C 案: 組織解散 + 連動凍結)、受注者 Z は存命
UPDATE public.users SET role = 'client', last_name = '大家', first_name = '乙',
       deleted_at = NOW() - interval '1 day'
 WHERE id = '77770715-bbbb-0000-0000-000000000001';
UPDATE public.users SET role = 'staff', last_name = '社員', first_name = '乙',
       deleted_at = NOW() - interval '1 day'
 WHERE id = '77770715-bbbb-0000-0000-000000000002';
UPDATE public.users SET role = 'contractor', last_name = '職人', first_name = '丙'
 WHERE id = '77770715-bbbb-0000-0000-000000000003';

-- orgA は存続、orgB はソフト削除済み
INSERT INTO organizations (id, owner_id, deleted_at) VALUES
  ('77770715-aaaa-1000-0000-000000000001', '77770715-aaaa-0000-0000-000000000001', NULL),
  ('77770715-bbbb-1000-0000-000000000001', '77770715-bbbb-0000-0000-000000000001', NOW() - interval '1 day');

-- orgA のメンバー (orgB は C 案でメンバー全削除済みのため INSERT しない)
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('77770715-aaaa-1000-0000-000000000001', '77770715-aaaa-0000-0000-000000000001', 'owner'),
  ('77770715-aaaa-1000-0000-000000000001', '77770715-aaaa-0000-0000-000000000002', 'staff');

-- スレッド A: 退会済み受注者 X × orgA (当事者は Owner A、Staff A は非当事者)
-- スレッド B: 存命受注者 Z × orgB (当事者は Staff B、Owner B は非当事者)
INSERT INTO message_threads (id, participant_1_id, participant_2_id, organization_id, organization_1_id, organization_2_id, thread_type, created_at, updated_at)
VALUES
  ('77770715-eeee-0000-0000-000000000001',
   '77770715-aaaa-0000-0000-000000000003', '77770715-aaaa-0000-0000-000000000001',
   '77770715-aaaa-1000-0000-000000000001', NULL, '77770715-aaaa-1000-0000-000000000001',
   'message', NOW() - interval '10 days', NOW() - interval '4 days'),
  ('77770715-eeee-0000-0000-000000000002',
   '77770715-bbbb-0000-0000-000000000003', '77770715-bbbb-0000-0000-000000000002',
   '77770715-bbbb-1000-0000-000000000001', NULL, '77770715-bbbb-1000-0000-000000000001',
   'message', NOW() - interval '10 days', NOW() - interval '4 days');

-- ============================================================
-- シナリオ A: Staff A (非当事者・同組織メンバー) から退会済み受注者 X が見える
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"77770715-aaaa-0000-0000-000000000002","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-aaaa-0000-0000-000000000003'),
  1,
  'A-1: same-org staff (non-participant) can SELECT withdrawn counterparty user row'
);

SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM public.users WHERE id = '77770715-aaaa-0000-0000-000000000003'),
  'A-2: staff can read deleted_at (withdrawal guard in sendMessageAction works)'
);

-- ============================================================
-- シナリオ A: Owner A (当事者) は従来どおり見える (回帰確認)
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"77770715-aaaa-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-aaaa-0000-0000-000000000003'),
  1,
  'A-3: direct participant (owner) can still SELECT withdrawn counterparty (regression)'
);

-- ============================================================
-- シナリオ B: 受注者 Z から、participant でない解散組織 Owner B が見える
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"77770715-bbbb-0000-0000-000000000003","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-bbbb-0000-0000-000000000001'),
  1,
  'B-1: contractor can SELECT withdrawn owner of dissolved org on thread (owner is not participant)'
);

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = '77770715-bbbb-1000-0000-000000000001'),
  1,
  'B-2: contractor can SELECT soft-deleted organization via thread org columns'
);

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-bbbb-0000-0000-000000000002'),
  1,
  'B-3: contractor can still SELECT withdrawn staff who is direct participant (regression)'
);

-- ============================================================
-- 部外者 (スレッド無関係) からは退会済みユーザーが見えない
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"77770715-cccc-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-aaaa-0000-0000-000000000003'),
  0,
  'N-1: unrelated user cannot SELECT withdrawn contractor X'
);

SELECT is(
  (SELECT count(*)::int FROM public.users WHERE id = '77770715-bbbb-0000-0000-000000000001'),
  0,
  'N-2: unrelated user cannot SELECT withdrawn owner B'
);

SELECT * FROM finish();
ROLLBACK;
