-- ============================================================
-- pgTAP: 定期実行（expire-options / close-expired-jobs）の中身を実データに流す
-- - これまでは cron.job に登録されていることの確認だけで、処理内容はどこでも
--   実行されていなかった（2026-09-29 テスト不足の調査）
-- - cron.job に登録されている command をそのまま EXECUTE するので、
--   登録内容が変わってもこのテストが追従する
-- ============================================================
BEGIN;
SELECT plan(9);

-- ------------------------------------------------------------
-- 準備: seed の掲載中案件 2 件（別オーナー）
--   J1 = 77777777-… （owner 22222222-…）: 急募の期限切れ → 解除される
--   J2 = f6660000-…-0001（owner f6000000-…）: 急募の期限内 → 残る
-- 既存の急募行は影響しないよう先に expired にしておく
-- ------------------------------------------------------------
UPDATE option_subscriptions SET status = 'expired'
WHERE option_type = 'urgent'
  AND user_id IN ('22222222-2222-2222-2222-222222222222', 'f6000000-0000-4000-8000-000000000001');

INSERT INTO option_subscriptions (id, user_id, job_id, payment_type, payment_method, option_type, status, start_date, end_date)
VALUES
  ('c0c0c0c0-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777',
   'one_time', 'bank_transfer', 'urgent', 'active', now() - interval '8 days', now() - interval '1 day'),
  ('c0c0c0c0-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000001', 'f6660000-0000-4000-8000-000000000001',
   'one_time', 'stripe', 'urgent', 'active', now() - interval '4 days', now() + interval '3 days'),
  -- 銀行振込の補償（販売停止中・既存契約）は期限を過ぎても自動で expired にしない
  ('c0c0c0c0-0000-4000-8000-000000000003', '22222222-2222-2222-2222-222222222222', NULL,
   'subscription', 'bank_transfer', 'compensation_5000', 'active', now() - interval '40 days', now() - interval '10 days');

UPDATE jobs SET is_urgent = true
WHERE id IN ('77777777-7777-7777-7777-777777777777', 'f6660000-0000-4000-8000-000000000001');
UPDATE client_profiles SET is_urgent_option = true
WHERE user_id IN ('22222222-2222-2222-2222-222222222222', 'f6000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  EXECUTE (SELECT command FROM cron.job WHERE jobname = 'expire-options');
END $$;

SELECT is((SELECT status::text FROM option_subscriptions WHERE id = 'c0c0c0c0-0000-4000-8000-000000000001'),
  'expired', 'expire-options: 期限切れの急募は expired になる');
SELECT is((SELECT is_urgent FROM jobs WHERE id = '77777777-7777-7777-7777-777777777777'),
  false, 'expire-options: 期限切れの急募の案件は is_urgent = false');
SELECT is((SELECT is_urgent_option FROM client_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  false, 'expire-options: 有効な急募が無くなった発注者は is_urgent_option = false');
SELECT is((SELECT status::text FROM option_subscriptions WHERE id = 'c0c0c0c0-0000-4000-8000-000000000002'),
  'active', 'expire-options: 期限内の急募は active のまま');
SELECT is((SELECT is_urgent FROM jobs WHERE id = 'f6660000-0000-4000-8000-000000000001'),
  true, 'expire-options: 期限内の急募の案件は is_urgent のまま');
SELECT is((SELECT status::text FROM option_subscriptions WHERE id = 'c0c0c0c0-0000-4000-8000-000000000003'),
  'active', 'expire-options: 銀行振込の補償は期限を過ぎても active のまま');

-- ------------------------------------------------------------
-- close-expired-jobs: 募集締切（JST の暦日）が昨日 → closed / 今日 → open のまま / 未設定 → open のまま
-- ------------------------------------------------------------
UPDATE jobs SET status = 'open', recruit_end_date = (now() AT TIME ZONE 'Asia/Tokyo')::date - 1
WHERE id = '77777777-7777-7777-7777-777777777777';
UPDATE jobs SET status = 'open', recruit_end_date = (now() AT TIME ZONE 'Asia/Tokyo')::date
WHERE id = 'f6660000-0000-4000-8000-000000000001';
UPDATE jobs SET status = 'open', recruit_end_date = NULL
WHERE id = 'f6660000-0000-4000-8000-000000000002';

DO $$
BEGIN
  EXECUTE (SELECT command FROM cron.job WHERE jobname = 'close-expired-jobs');
END $$;

SELECT is((SELECT status::text FROM jobs WHERE id = '77777777-7777-7777-7777-777777777777'),
  'closed', 'close-expired-jobs: 締切が昨日（JST）の案件は closed');
SELECT is((SELECT status::text FROM jobs WHERE id = 'f6660000-0000-4000-8000-000000000001'),
  'open', 'close-expired-jobs: 締切が今日（JST）の案件は open のまま');
SELECT is((SELECT status::text FROM jobs WHERE id = 'f6660000-0000-4000-8000-000000000002'),
  'open', 'close-expired-jobs: 締切未設定の案件は open のまま');

SELECT * FROM finish();
ROLLBACK;
