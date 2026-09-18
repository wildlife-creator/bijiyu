-- pgTAP tests for migration 20260916120000_bank_transfer_onoff（銀行振込のオン／オフ）
--
-- 検証:
--   1. 申込テーブル・専用 enum・期限通知 cron・期限 index が無いこと
--   2. contacts.bank_transfer_plan 列があること
--   3. handle_checkout_completed_plan v3: 有効な銀行振込行があれば後処理なしで cancelled にしてから
--      Stripe 行を INSERT する（role・案件は触らない。監査 bank_transfer_ended_by_stripe_checkout）
--   4. 銀行振込行が無い会員は従来どおり（二重 active は例外）
--
-- Run with: supabase test db

BEGIN;
SELECT plan(14);

-- ============================================================
-- 1. 廃止されたもの
-- ============================================================
SELECT hasnt_table('public', 'bank_transfer_requests', 'bank_transfer_requests は廃止されている');
SELECT hasnt_type('public', 'bank_transfer_request_status', 'bank_transfer_request_status 型は廃止されている');
SELECT hasnt_type('public', 'bank_transfer_target_kind', 'bank_transfer_target_kind 型は廃止されている');
SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'bank-transfer-expiry-notify'),
  0,
  '期限通知 cron（bank-transfer-expiry-notify）は登録されていない'
);
SELECT hasnt_index('public', 'subscriptions', 'subscriptions_bank_transfer_expiry_idx', '期限 index は廃止されている');
-- 契約行の仕組み（payment_method / CHECK）は据え置き
SELECT has_column('public', 'subscriptions', 'payment_method', 'subscriptions.payment_method は残る');
SELECT has_column('public', 'option_subscriptions', 'payment_method', 'option_subscriptions.payment_method は残る');

-- ============================================================
-- 2. contacts.bank_transfer_plan
-- ============================================================
SELECT has_column('public', 'contacts', 'bank_transfer_plan', 'contacts.bank_transfer_plan が存在する');

-- ============================================================
-- Setup（seed と重複しない UUID）
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('bb120916-0000-4000-8000-000000000001', 'p12-bank@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('bb120916-0000-4000-8000-000000000002', 'p12-fresh@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client', last_name = '振込', first_name = '甲' WHERE id = 'bb120916-0000-4000-8000-000000000001';
UPDATE public.users SET role = 'contractor', last_name = '振込', first_name = '乙' WHERE id = 'bb120916-0000-4000-8000-000000000002';

-- 銀行振込で契約中（期限なし）+ 掲載中の案件 1 件
INSERT INTO subscriptions (id, user_id, plan_type, status, payment_method, billing_cycle, stripe_subscription_id, current_period_start, current_period_end)
VALUES ('bb120916-0000-4000-8000-0000000000c1', 'bb120916-0000-4000-8000-000000000001', 'small', 'active', 'bank_transfer', 'monthly', NULL, NOW() - interval '10 days', NULL);

INSERT INTO client_profiles (user_id, display_name) VALUES ('bb120916-0000-4000-8000-000000000001', '振込商店');

INSERT INTO jobs (id, owner_id, title, trade_types, status)
VALUES ('bb120916-0000-4000-8000-0000000000a1', 'bb120916-0000-4000-8000-000000000001', '銀行振込テスト 掲載中案件', ARRAY['建築/躯体｜大工']::text[], 'open');

-- ============================================================
-- 3. 銀行振込 → カード（Checkout 完了）
-- ============================================================
SELECT lives_ok(
  $$ SELECT handle_checkout_completed_plan(jsonb_build_object(
       'user_id', 'bb120916-0000-4000-8000-000000000001',
       'plan_type', 'corporate',
       'billing_cycle', 'yearly',
       'stripe_subscription_id', 'sub_p12_switch',
       'stripe_customer_id', 'cus_p12',
       'current_period_start', NOW(),
       'current_period_end', NOW() + interval '1 year'
     )) $$,
  '銀行振込で契約中でも Checkout 完了処理が例外にならない'
);

SELECT is(
  (SELECT status::text FROM subscriptions WHERE id = 'bb120916-0000-4000-8000-0000000000c1'),
  'cancelled',
  '銀行振込行は cancelled になる'
);

SELECT is(
  (SELECT count(*)::int FROM subscriptions
    WHERE user_id = 'bb120916-0000-4000-8000-000000000001'
      AND status = 'active' AND payment_method = 'stripe'
      AND stripe_subscription_id = 'sub_p12_switch' AND plan_type = 'corporate'),
  1,
  'Stripe 行が active で 1 行だけ作られる（同時に有効な行は 1 つ）'
);

-- 後処理なし: role は client のまま、案件は open のまま
SELECT is(
  (SELECT status::text FROM jobs WHERE id = 'bb120916-0000-4000-8000-0000000000a1'),
  'open',
  '掲載中の案件は閉じない（有料が途切れないため後処理は走らない）'
);

SELECT is(
  (SELECT count(*)::int FROM audit_logs
    WHERE action = 'bank_transfer_ended_by_stripe_checkout'
      AND target_id = 'bb120916-0000-4000-8000-0000000000c1'),
  1,
  '監査ログ bank_transfer_ended_by_stripe_checkout が残る'
);

-- ============================================================
-- 4. 銀行振込行が無い会員は従来どおり
-- ============================================================
SELECT lives_ok(
  $$ SELECT handle_checkout_completed_plan(jsonb_build_object(
       'user_id', 'bb120916-0000-4000-8000-000000000002',
       'plan_type', 'individual',
       'stripe_subscription_id', 'sub_p12_fresh',
       'stripe_customer_id', 'cus_p12_fresh'
     )) $$,
  '契約の無い会員は従来どおり Stripe 行が作られる'
);

SELECT * FROM finish();
ROLLBACK;
