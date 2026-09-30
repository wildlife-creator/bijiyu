-- ============================================================
-- pgTAP: 毎日の定期実行（expire-options / close-expired-jobs）の中身を実データに流して確認する
--   既存のテストは「登録されているか・文字列に何が含まれるか」だけだったため、
--   cron.job に登録された SQL をそのまま実行し、結果を検証する（登録内容が変わっても追従する）
-- ============================================================
BEGIN;
SELECT plan(10);

-- ------------------------------------------------------------
-- 準備: 発注者 client@test.local（2222…）の案件 2 件を急募にする
--   7777…: 急募の期限切れ（昨日まで）/ 8881…: 急募の期限内（あと 3 日）
--   銀行振込の補償（期限切れ）は運営の手動運用のため自動で止めない
-- ------------------------------------------------------------
UPDATE public.jobs SET is_urgent = true
WHERE id IN ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888881');
UPDATE public.client_profiles SET is_urgent_option = true
WHERE user_id = '22222222-2222-2222-2222-222222222222';

INSERT INTO public.option_subscriptions (id, user_id, job_id, payment_type, option_type, status, start_date, end_date, payment_method)
VALUES
  ('d0d0d0d0-1001-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777',
   'one_time', 'urgent', 'active', now() - interval '8 days', now() - interval '1 day', 'stripe'),
  ('d0d0d0d0-1001-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', '88888888-8888-8888-8888-888888888881',
   'one_time', 'urgent', 'active', now() - interval '4 days', now() + interval '3 days', 'bank_transfer'),
  ('d0d0d0d0-1001-4000-8000-000000000003', '22222222-2222-2222-2222-222222222222', NULL,
   'subscription', 'compensation_5000', 'active', now() - interval '40 days', now() - interval '10 days', 'bank_transfer');

DO $$ BEGIN EXECUTE (SELECT command FROM cron.job WHERE jobname = 'expire-options'); END $$;

SELECT is((SELECT status::text FROM public.option_subscriptions WHERE id = 'd0d0d0d0-1001-4000-8000-000000000001'), 'expired', '期限切れの急募は expired になる');
SELECT is((SELECT status::text FROM public.option_subscriptions WHERE id = 'd0d0d0d0-1001-4000-8000-000000000002'), 'active', '期限内の急募（銀行振込でも）は active のまま');
SELECT is((SELECT status::text FROM public.option_subscriptions WHERE id = 'd0d0d0d0-1001-4000-8000-000000000003'), 'active', '銀行振込の補償は期限を過ぎても自動で止めない');
SELECT is((SELECT is_urgent FROM public.jobs WHERE id = '77777777-7777-7777-7777-777777777777'), false, '期限切れの急募の案件は「急募」が外れる');
SELECT is((SELECT is_urgent FROM public.jobs WHERE id = '88888888-8888-8888-8888-888888888881'), true, '期限内の急募の案件は「急募」のまま');
SELECT is((SELECT is_urgent_option FROM public.client_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'), true, '有効な急募が残っていれば発注者の急募フラグは残る');

-- 残りの急募も期限切れにして、もう一度実行 → 発注者の急募フラグも外れる
UPDATE public.option_subscriptions SET end_date = now() - interval '1 minute'
WHERE id = 'd0d0d0d0-1001-4000-8000-000000000002';
DO $$ BEGIN EXECUTE (SELECT command FROM cron.job WHERE jobname = 'expire-options'); END $$;

SELECT is((SELECT is_urgent FROM public.jobs WHERE id = '88888888-8888-8888-8888-888888888881'), false, '最後の急募が切れると案件の「急募」も外れる');
SELECT is((SELECT is_urgent_option FROM public.client_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'), false, '有効な急募がなくなると発注者の急募フラグも外れる');

-- ------------------------------------------------------------
-- close-expired-jobs: 応募締切が「日本時間の今日より前」の掲載中案件だけ掲載終了にする
-- ------------------------------------------------------------
UPDATE public.jobs SET status = 'open', recruit_end_date = (now() AT TIME ZONE 'Asia/Tokyo')::date - 1
WHERE id = '88888888-8888-8888-8888-888888888882';
UPDATE public.jobs SET status = 'open', recruit_end_date = (now() AT TIME ZONE 'Asia/Tokyo')::date
WHERE id = '88888888-8888-8888-8888-888888888883';

DO $$ BEGIN EXECUTE (SELECT command FROM cron.job WHERE jobname = 'close-expired-jobs'); END $$;

SELECT is((SELECT status::text FROM public.jobs WHERE id = '88888888-8888-8888-8888-888888888882'), 'closed', '応募締切が昨日（日本時間）の案件は掲載終了になる');
SELECT is((SELECT status::text FROM public.jobs WHERE id = '88888888-8888-8888-8888-888888888883'), 'open', '応募締切が今日（日本時間）の案件は掲載中のまま');

SELECT * FROM finish();
ROLLBACK;
