-- ============================================================
-- pgTAP tests for close-expired-jobs cron（締切判定の JST 統一）
-- - 20260711130000_close_expired_jobs_jst.sql の回帰防止
-- - 締切判定が UTC 依存の CURRENT_DATE から JST(Asia/Tokyo) に置き換わっていること
-- ============================================================
BEGIN;
SELECT plan(3);

-- Test 1: close-expired-jobs cron が登録されている
SELECT isnt(
  (SELECT command FROM cron.job WHERE jobname = 'close-expired-jobs'),
  NULL,
  'close-expired-jobs cron job is scheduled'
);

-- Test 2: 締切判定が JST（Asia/Tokyo）基準になっている
SELECT ok(
  (SELECT command FROM cron.job WHERE jobname = 'close-expired-jobs')
    LIKE '%Asia/Tokyo%',
  'close-expired-jobs compares recruit_end_date against JST date'
);

-- Test 3: UTC 依存の CURRENT_DATE 比較に戻っていない（回帰防止）
SELECT ok(
  (SELECT command FROM cron.job WHERE jobname = 'close-expired-jobs')
    NOT LIKE '%CURRENT_DATE%',
  'close-expired-jobs no longer uses UTC CURRENT_DATE'
);

SELECT * FROM finish();
ROLLBACK;
