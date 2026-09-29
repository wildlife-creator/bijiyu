-- ============================================================
-- pgTAP tests for auto-cancel-past-due cron（Vault から URL と鍵を読む）
-- - 20260929120000_auto_cancel_cron_via_vault.sql の回帰防止
-- - 開発用 URL・仮の鍵が埋め込まれた登録に戻っていないこと
-- ============================================================
BEGIN;
SELECT plan(5);

SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'auto-cancel-past-due'),
  1,
  'auto-cancel-past-due cron job is scheduled exactly once'
);

SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'auto-cancel-past-due'),
  '0 18 * * *',
  'auto-cancel-past-due runs daily at 18:00 UTC (03:00 JST)'
);

SELECT ok(
  (SELECT command FROM cron.job WHERE jobname = 'auto-cancel-past-due')
    LIKE '%vault.decrypted_secrets%',
  'auto-cancel-past-due reads URL and key from Vault at run time'
);

SELECT ok(
  (SELECT command FROM cron.job WHERE jobname = 'auto-cancel-past-due')
    NOT LIKE '%host.docker.internal%',
  'auto-cancel-past-due does not embed the local dev URL'
);

SELECT ok(
  (SELECT command FROM cron.job WHERE jobname = 'auto-cancel-past-due')
    NOT LIKE '%placeholder-set-via-app-settings%',
  'auto-cancel-past-due does not embed the placeholder key'
);

SELECT * FROM finish();
ROLLBACK;
