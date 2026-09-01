-- pgTAP tests for migration 20260901120000_bank_transfer（銀行振込 P2）
--
-- 検証:
--   1. subscriptions / option_subscriptions の payment_method / billing_cycle 列と CHECK 制約
--   2. bank_transfer_requests の RLS（本人と admin のみ SELECT、authenticated は INSERT 不可）
--   3. 処理中申込の部分ユニーク index（同じ対象を二重に受け付けない）
--   4. handle_subscription_lifecycle_deleted v4 が subscription_id で銀行振込行を解約できる
--
-- Run with: supabase test db

BEGIN;
SELECT plan(17);

-- ============================================================
-- Setup（seed と重複しない UUID）
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb010901-0000-0000-0000-000000000001', 'bt-owner@test.local',    crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb010901-0000-0000-0000-000000000002', 'bt-other@test.local',    crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb010901-0000-0000-0000-000000000003', 'bt-admin@test.local',    crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'contractor', last_name = '振込', first_name = '甲' WHERE id = 'bb010901-0000-0000-0000-000000000001';
UPDATE public.users SET role = 'contractor', last_name = '振込', first_name = '乙' WHERE id = 'bb010901-0000-0000-0000-000000000002';
UPDATE public.users SET role = 'admin',      last_name = '運営', first_name = '丙' WHERE id = 'bb010901-0000-0000-0000-000000000003';

-- ============================================================
-- 1. 列と CHECK 制約
-- ============================================================
SELECT has_column('public', 'subscriptions', 'payment_method', 'subscriptions.payment_method が存在する');
SELECT has_column('public', 'subscriptions', 'billing_cycle', 'subscriptions.billing_cycle が存在する');
SELECT has_column('public', 'option_subscriptions', 'payment_method', 'option_subscriptions.payment_method が存在する');

SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'payment_method'),
  $$'stripe'::payment_method_type$$,
  '既定の支払方法は stripe（既存 Stripe 行の互換）'
);

SELECT throws_ok(
  $$ INSERT INTO subscriptions (user_id, plan_type, status, payment_method, stripe_subscription_id)
     VALUES ('bb010901-0000-0000-0000-000000000001', 'individual', 'active', 'bank_transfer', 'sub_should_not_exist') $$,
  '23514',
  NULL,
  '銀行振込行に stripe_subscription_id を入れると CHECK 違反'
);

-- 正常な銀行振込行（後の解約テストで使う）
INSERT INTO subscriptions (id, user_id, plan_type, status, payment_method, billing_cycle, current_period_start, current_period_end)
VALUES ('bb010901-0000-0000-0000-00000000cc01', 'bb010901-0000-0000-0000-000000000001', 'individual', 'active', 'bank_transfer', 'yearly', NOW(), NOW() + interval '1 year');
UPDATE public.users SET role = 'client' WHERE id = 'bb010901-0000-0000-0000-000000000001';

SELECT is(
  (SELECT is_paid_user('bb010901-0000-0000-0000-000000000001')),
  true,
  '銀行振込の active 行でも is_paid_user は true（Stripe ID を要求しない）'
);

-- ============================================================
-- 2. bank_transfer_requests: 制約 + RLS
-- ============================================================
SELECT throws_ok(
  $$ INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, amount)
     VALUES ('bb010901-0000-0000-0000-000000000001', 'plan', 'individual', 'video', 3800) $$,
  '23514',
  NULL,
  'plan 申込に option_type が入ると target_consistency CHECK 違反'
);

-- service_role（Server Action）として申込を作る
INSERT INTO bank_transfer_requests (id, user_id, target_kind, plan_type, billing_cycle, amount, initial_fee, status)
VALUES ('bb010901-0000-0000-0000-00000000dd01', 'bb010901-0000-0000-0000-000000000001', 'plan', 'small', 'monthly', 14800, 20000, 'requested');

-- 3. 処理中の二重申込は部分ユニーク index で拒否（plan は種類を問わず 1 件）
SELECT throws_ok(
  $$ INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, billing_cycle, amount)
     VALUES ('bb010901-0000-0000-0000-000000000001', 'plan', 'corporate', 'monthly', 48000) $$,
  '23505',
  NULL,
  '処理中の plan 申込があるうちは別プランでも二重申込できない'
);

-- 取消済みなら同じ対象を再申込できる
INSERT INTO bank_transfer_requests (id, user_id, target_kind, option_type, amount, status)
VALUES ('bb010901-0000-0000-0000-00000000dd02', 'bb010901-0000-0000-0000-000000000001', 'option', 'video', 100000, 'cancelled');
SELECT lives_ok(
  $$ INSERT INTO bank_transfer_requests (user_id, target_kind, option_type, amount, status)
     VALUES ('bb010901-0000-0000-0000-000000000001', 'option', 'video', 100000, 'requested') $$,
  '取消済みの申込があっても同じオプションを再申込できる'
);

-- RLS: 本人
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bb010901-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM bank_transfer_requests WHERE id = 'bb010901-0000-0000-0000-00000000dd01'),
  1,
  '本人は自分の申込を SELECT できる'
);

SELECT throws_ok(
  $$ INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, amount)
     VALUES ('bb010901-0000-0000-0000-000000000001', 'plan', 'individual', 3800) $$,
  '42501',
  NULL,
  'authenticated は直接 INSERT できない（Server Action の service_role 専用）'
);

-- RLS: 他人
SELECT set_config('request.jwt.claims', '{"sub":"bb010901-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM bank_transfer_requests WHERE user_id = 'bb010901-0000-0000-0000-000000000001'),
  0,
  '他人の申込は見えない'
);

-- RLS: admin
SELECT set_config('request.jwt.claims', '{"sub":"bb010901-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM bank_transfer_requests WHERE user_id = 'bb010901-0000-0000-0000-000000000001'),
  3,
  'admin は全員の申込を SELECT できる'
);

RESET ROLE;

-- ============================================================
-- 4. handle_subscription_lifecycle_deleted v4: subscription_id で銀行振込行を解約
-- ============================================================
SELECT lives_ok(
  $$ SELECT handle_subscription_lifecycle_deleted(
       jsonb_build_object('subscription_id', 'bb010901-0000-0000-0000-00000000cc01', 'actor_id', 'bb010901-0000-0000-0000-000000000003')) $$,
  'v4: stripe_subscription_id なしでも subscription_id で解約できる'
);

SELECT is(
  (SELECT status::text FROM subscriptions WHERE id = 'bb010901-0000-0000-0000-00000000cc01'),
  'cancelled',
  '解約後は status=cancelled'
);

SELECT is(
  (SELECT role::text FROM public.users WHERE id = 'bb010901-0000-0000-0000-000000000001'),
  'contractor',
  '解約で Owner の role は contractor に戻る（Stripe 解約と同じ後処理）'
);

SELECT is(
  (SELECT actor_id FROM audit_logs WHERE action = 'subscription_cancelled' AND target_id = 'bb010901-0000-0000-0000-00000000cc01' LIMIT 1),
  'bb010901-0000-0000-0000-000000000003'::uuid,
  '監査ログの actor は操作した管理者'
);

SELECT * FROM finish();
ROLLBACK;
