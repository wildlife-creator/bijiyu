-- pgTAP tests for migration 20260910120000_video_plans_consolidation（ビジ友公式SNS動画制作プラン P10）
--
-- 検証:
--   1. bank_transfer_requests の target_consistency CHECK が option_type = 'video_sns' を受け付ける
--   2. 未知の option_type は引き続き拒否される（列挙の拡張であって緩和ではない）
--   3. 旧 video_workplace は既存行のため引き続き受け付ける（新規申込の拒否はアプリ側）
--   4. option_subscriptions に 'video_sns' の買い切り行（one_time・期限なし）を作れる
--
-- Run with: supabase test db
-- seed と重複しない UUID（f8000000-…）を使用する。

BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('f8000000-0000-0000-0000-000000000001', 'sns-buyer@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'contractor', last_name = '公式', first_name = '花子'
 WHERE id = 'f8000000-0000-0000-0000-000000000001';

-- 1. 銀行振込の申込に video_sns を入れられる
SELECT lives_ok(
  $$INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status)
    VALUES ('f8000000-0000-0000-0000-000000000001', 'option', NULL, 'video_sns', 'monthly', 120000, 0, 'requested')$$,
  'bank_transfer_requests accepts option_type = video_sns'
);

SELECT is(
  (SELECT count(*)::int FROM bank_transfer_requests
    WHERE user_id = 'f8000000-0000-0000-0000-000000000001' AND option_type = 'video_sns' AND status = 'requested'),
  1,
  'the video_sns request row exists'
);

-- 2. 未知の option_type は拒否（CHECK 違反 23514）
SELECT throws_ok(
  $$INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status)
    VALUES ('f8000000-0000-0000-0000-000000000001', 'option', NULL, 'video_bogus', 'monthly', 120000, 0, 'requested')$$,
  '23514',
  NULL,
  'unknown option_type is still rejected by target_consistency CHECK'
);

-- 3. 旧 video_workplace は既存行の整合のため列挙に残っている（同じ対象の処理中 index を避けるため取消済みで入れる）
SELECT lives_ok(
  $$INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status)
    VALUES ('f8000000-0000-0000-0000-000000000001', 'option', NULL, 'video_workplace', 'monthly', 100000, 0, 'cancelled')$$,
  'legacy video_workplace rows are still accepted by the CHECK (new sales are refused in the app layer)'
);

-- 4. option_subscriptions の買い切り行（銀行振込・期限なし）
SELECT lives_ok(
  $$INSERT INTO option_subscriptions (user_id, payment_type, payment_method, option_type, status, start_date, end_date)
    VALUES ('f8000000-0000-0000-0000-000000000001', 'one_time', 'bank_transfer', 'video_sns', 'active', NOW(), NULL)$$,
  'option_subscriptions accepts a one_time bank_transfer video_sns row with no end_date'
);

SELECT * FROM finish();
ROLLBACK;
