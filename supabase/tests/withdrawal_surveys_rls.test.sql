-- pgTAP tests for withdrawal_surveys RLS（退会理由アンケートの保存先）
-- Run with: supabase test db
-- seed と重複しない専用 UUID を使用する。
-- 退会処理の survey 保存は「失敗してもログのみ・退会自体は成功」する非ブロッキング設計のため、
-- RLS が想定外に弾くとデータが静かに失われる。ここで INSERT/SELECT の権限を実地に固める。

BEGIN;
SELECT plan(6);

-- ============================================================
-- Setup（privileged role = RLS バイパスで下準備）
-- ============================================================
-- 退会者（非 admin）。auth.users INSERT で handle_new_user トリガーが public.users を作る
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('7c770000-0000-0000-0000-0000000000aa'::uuid, 'withdraw-rls@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- SELECT 可視性 / UPDATE・DELETE ブロックの検証用に既存レコードを1件投入
INSERT INTO withdrawal_surveys (id, user_id, reason_code, reason_label, details, role, plan_type)
VALUES ('7c770000-0000-0000-0000-0000000000bb'::uuid, '7c770000-0000-0000-0000-0000000000aa'::uuid,
        'price_high', '料金が高い', '初期詳細', 'contractor', NULL);

-- 管理者（seed）: 44444444-4444-4444-4444-444444444444 = admin@test.local (role='admin')

-- ============================================================
-- INSERT: 本人のみ（WITH CHECK user_id = auth.uid()）
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"7c770000-0000-0000-0000-0000000000aa","role":"authenticated"}';

-- Test 1: 本人 user_id での INSERT は可
SELECT lives_ok(
  $$INSERT INTO withdrawal_surveys (user_id, reason_code, reason_label, details, role, plan_type)
    VALUES ('7c770000-0000-0000-0000-0000000000aa', 'got_busy', '仕事が忙しくなった', NULL, 'contractor', NULL);$$,
  'user can INSERT own withdrawal_survey (WITH CHECK user_id = auth.uid())'
);

-- Test 2: 他人 user_id での INSERT は不可（なりすまし防止）
SELECT throws_ok(
  $$INSERT INTO withdrawal_surveys (user_id, reason_code, reason_label, details, role, plan_type)
    VALUES ('44444444-4444-4444-4444-444444444444', 'price_high', '料金が高い', NULL, 'client', NULL);$$,
  '42501',
  NULL,
  'user cannot INSERT withdrawal_survey with someone else user_id'
);

-- ============================================================
-- SELECT: 管理者のみ
-- ============================================================
-- Test 3: 非 admin は SELECT できない（自分の退会理由でも 0件）
SELECT is(
  (SELECT count(*)::int FROM withdrawal_surveys),
  0,
  'non-admin (even the withdrawer) sees 0 withdrawal_surveys (admin-only SELECT)'
);

-- Test 4: admin は SELECT できる
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT ok(
  (SELECT count(*)::int FROM withdrawal_surveys) >= 1,
  'admin can SELECT withdrawal_surveys'
);

-- ============================================================
-- UPDATE / DELETE: 一般ユーザーに不許可（ポリシー無し = default deny / サイレントブロック）
-- ============================================================
-- Test 5: 非 admin の UPDATE はデータを変えない
SET LOCAL request.jwt.claims TO '{"sub":"7c770000-0000-0000-0000-0000000000aa","role":"authenticated"}';
UPDATE withdrawal_surveys SET details = 'hacked'
  WHERE id = '7c770000-0000-0000-0000-0000000000bb';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT details FROM withdrawal_surveys WHERE id = '7c770000-0000-0000-0000-0000000000bb'),
  '初期詳細',
  'non-admin UPDATE does not change withdrawal_surveys (no update policy)'
);

-- Test 6: 非 admin の DELETE はレコードを消さない
SET LOCAL request.jwt.claims TO '{"sub":"7c770000-0000-0000-0000-0000000000aa","role":"authenticated"}';
DELETE FROM withdrawal_surveys WHERE id = '7c770000-0000-0000-0000-0000000000bb';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM withdrawal_surveys WHERE id = '7c770000-0000-0000-0000-0000000000bb'),
  1,
  'non-admin DELETE does not remove withdrawal_surveys row (no delete policy)'
);

SELECT * FROM finish();
ROLLBACK;
