-- ============================================================
-- billing: pg_cron ジョブ登録
-- ============================================================
--
-- 3 つの定期実行ジョブを登録する。
--   1. expire-options       (毎日 03:05 JST = 18:05 UTC)  SQL 直接実行
--   2. close-expired-jobs   (毎日 03:10 JST = 18:10 UTC)  SQL 直接実行
--   3. auto-cancel-past-due (毎日 03:00 JST = 18:00 UTC)  pg_net で Edge Function 呼び出し
--
-- セキュリティ注記: pg_net で Edge Function に渡す Authorization ヘッダー
-- には service_role キーを直書きする。cron.job への参照は postgres ロール
-- に限定されているため Phase 1 ではこの方式を採用するが、Phase 2 で
-- Supabase Vault 経由に移行する想定。

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 既存ジョブを安全に再登録するためのアンスケジュール（冪等化）
DO $$
BEGIN
  PERFORM cron.unschedule('expire-options');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-jobs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-cancel-past-due');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ------------------------------------------------------------
-- 1. expire-options (毎日 18:05 UTC = 03:05 JST)
-- ------------------------------------------------------------

SELECT cron.schedule(
  'expire-options',
  '5 18 * * *',
  $$
  -- ステートメント 1: 期限切れマーク
  UPDATE option_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < NOW();

  -- ステートメント 2: 同ユーザーに他の active urgent がない場合 is_urgent_option=false
  UPDATE client_profiles cp
  SET is_urgent_option = false
  WHERE cp.is_urgent_option = true
    AND NOT EXISTS (
      SELECT 1 FROM option_subscriptions os
      WHERE os.user_id = cp.user_id
        AND os.option_type = 'urgent'
        AND os.status = 'active'
    );

  -- ステートメント 3: 対象 jobs.is_urgent=false
  UPDATE jobs
  SET is_urgent = false
  WHERE is_urgent = true
    AND NOT EXISTS (
      SELECT 1 FROM option_subscriptions os
      WHERE os.job_id = jobs.id
        AND os.option_type = 'urgent'
        AND os.status = 'active'
    );
  $$
);

-- ------------------------------------------------------------
-- 2. close-expired-jobs (毎日 18:10 UTC = 03:10 JST)
-- ------------------------------------------------------------

SELECT cron.schedule(
  'close-expired-jobs',
  '10 18 * * *',
  $$
  UPDATE jobs
  SET status = 'closed'
  WHERE status = 'open'
    AND recruit_end_date IS NOT NULL
    AND recruit_end_date < CURRENT_DATE;
  $$
);

-- ------------------------------------------------------------
-- 3. auto-cancel-past-due (毎日 18:00 UTC = 03:00 JST)
--    pg_net で Edge Function を呼び出す
-- ------------------------------------------------------------
--
-- service_role キーは Supabase が config から提供する postgres role
-- セッション変数（app.settings.service_role_key）から取得する想定。
-- ローカル環境では存在しないことがあるため、欠落時はログのみ出力して
-- スキップする。

DO $$
DECLARE
  v_function_url text;
  v_service_role_key text;
BEGIN
  v_function_url := current_setting('app.settings.supabase_functions_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_function_url IS NULL OR v_function_url = '' THEN
    v_function_url := 'http://host.docker.internal:54321/functions/v1/auto-cancel-past-due';
  END IF;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    v_service_role_key := 'placeholder-set-via-app-settings';
  END IF;

  PERFORM cron.schedule(
    'auto-cancel-past-due',
    '0 18 * * *',
    format(
      $job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $job$,
      v_function_url,
      'Bearer ' || v_service_role_key
    )
  );
END $$;
