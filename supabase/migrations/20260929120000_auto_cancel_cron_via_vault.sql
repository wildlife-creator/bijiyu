-- ============================================================
-- auto-cancel-past-due cron: 呼び出し先 URL と鍵を Vault から読む形に登録し直す
-- ============================================================
--
-- 背景（2026-09-29 staging で確認）:
--   20260411100200 は登録時に app.settings.* から URL / service_role キーを読み、
--   無ければ開発用 URL（host.docker.internal）と仮の鍵で登録していた。
--   hosted Supabase では app.settings.* が設定されていないため、staging の
--   cron は毎日 "Couldn't resolve host name" で失敗していた。しかも
--   cron.job_run_details 上は net.http_post の「依頼」が成功した扱いで
--   status = succeeded と記録されるため、失敗に気づけなかった。
--
-- 方針:
--   - URL と鍵は実行のたびに Vault（vault.decrypted_secrets）から読む。
--     cron.job の command に鍵を平文で埋め込まない
--   - 環境ごとに人が Vault に 2 つの値を登録する（staging / 本番とも SQL Editor）:
--       select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--       select vault.create_secret('<Secret key（sb_secret_...）>', 'service_role_key');
--     service_role_key は Edge Function 側の SUPABASE_SERVICE_ROLE_KEY と完全一致で
--     照合される（supabase/functions/auto-cancel-past-due/index.ts）。hosted では
--     この環境変数に新形式の Secret key（sb_secret_...）が入っており、ダッシュボードの
--     Legacy API Keys の service_role（JWT）では 401 になる（2026-09-29 staging で確認）
--   - Vault 未登録なら例外を投げ、cron.job_run_details に failed として残す
--     （「成功に見えて実は失敗」を防ぐ）

DO $$
BEGIN
  PERFORM cron.unschedule('auto-cancel-past-due');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-cancel-past-due',
  '0 18 * * *',
  $job$
  DO $body$
  DECLARE
    v_project_url text;
    v_service_role_key text;
  BEGIN
    SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    IF v_project_url IS NULL OR v_project_url = ''
       OR v_service_role_key IS NULL OR v_service_role_key = '' THEN
      RAISE EXCEPTION 'auto-cancel-past-due: Vault に project_url / service_role_key が登録されていません';
    END IF;

    PERFORM net.http_post(
      url := rtrim(v_project_url, '/') || '/functions/v1/auto-cancel-past-due',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := '{}'::jsonb
    );
  END
  $body$;
  $job$
);
