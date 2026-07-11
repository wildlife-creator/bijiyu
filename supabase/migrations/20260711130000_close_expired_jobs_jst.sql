-- ============================================================
-- close-expired-jobs cron の締切判定を JST に統一
-- ============================================================
--
-- 既存の close-expired-jobs（20260411100200）は
--   recruit_end_date < CURRENT_DATE
-- で締切済み案件を閉じていた。CURRENT_DATE は DB セッションのタイムゾーン
-- （本番ホスティング・ローカルとも UTC）基準のため、JST では 1 日遅れて案件が
-- 閉じられていた（例: JST 7/11 でも UTC はまだ 7/10 のため、7/10 締切の案件が
-- `< CURRENT_DATE` を満たさず閉じられない → 実行ログが "UPDATE 0" になる）。
-- JST の暦日で比較するよう置き換える。
--
-- 他の cron は日付境界のズレを持たないため対象外:
--   - expire-options       : end_date < NOW() の timestamp 比較（TZ 非依存）
--   - auto-cancel-past-due  : Edge Function 呼び出し（日付比較なし）

-- 既存ジョブをアンスケジュール（冪等化）
DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-jobs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- JST 暦日で締切判定して再登録（実行時刻 03:10 JST = 18:10 UTC は据え置き）
SELECT cron.schedule(
  'close-expired-jobs',
  '10 18 * * *',
  $$
  UPDATE jobs
  SET status = 'closed'
  WHERE status = 'open'
    AND recruit_end_date IS NOT NULL
    AND recruit_end_date < (now() AT TIME ZONE 'Asia/Tokyo')::date;
  $$
);
