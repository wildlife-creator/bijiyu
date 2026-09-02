-- pgTAP tests for migration 20260902150000_bank_transfer_video_shooting（ユーザー撮影プラン P7）
--
-- 検証:
--   1. bank_transfer_requests の target_consistency CHECK が option_type = 'video_shooting' を受け付ける
--   2. 未知の option_type は引き続き拒否される（列挙の拡張であって緩和ではない）
--   3. option_subscriptions に 'video_shooting' の買い切り行（one_time・期限なし）を作れる
--
-- Run with: supabase test db
-- seed と重複しない UUID（f7000000-…）を使用する。

BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('f7000000-0000-0000-0000-000000000001', 'shooting-buyer@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'contractor', last_name = '撮影', first_name = '太郎'
 WHERE id = 'f7000000-0000-0000-0000-000000000001';

-- 1. 銀行振込の申込に video_shooting を入れられる
SELECT lives_ok(
  $$INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status)
    VALUES ('f7000000-0000-0000-0000-000000000001', 'option', NULL, 'video_shooting', 'monthly', 20000, 0, 'requested')$$,
  'bank_transfer_requests accepts option_type = video_shooting'
);

SELECT is(
  (SELECT count(*)::int FROM bank_transfer_requests
    WHERE user_id = 'f7000000-0000-0000-0000-000000000001' AND option_type = 'video_shooting' AND status = 'requested'),
  1,
  'the video_shooting request row exists'
);

-- 2. 未知の option_type は拒否（CHECK 違反 23514）
SELECT throws_ok(
  $$INSERT INTO bank_transfer_requests (user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status)
    VALUES ('f7000000-0000-0000-0000-000000000001', 'option', NULL, 'video_bogus', 'monthly', 20000, 0, 'requested')$$,
  '23514',
  NULL,
  'unknown option_type is still rejected by target_consistency CHECK'
);

-- 3. option_subscriptions の買い切り行（銀行振込・期限なし）
SELECT lives_ok(
  $$INSERT INTO option_subscriptions (user_id, payment_type, payment_method, option_type, status, start_date, end_date)
    VALUES ('f7000000-0000-0000-0000-000000000001', 'one_time', 'bank_transfer', 'video_shooting', 'active', NOW(), NULL)$$,
  'option_subscriptions accepts a one_time bank_transfer video_shooting row with no end_date'
);

SELECT * FROM finish();
ROLLBACK;
