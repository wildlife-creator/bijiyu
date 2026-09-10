-- ============================================================
-- 2026-09-10: 動画プラン整理（P10 / docs/requirements/video-plans-handoff-202609.md §4）
--
-- 1. 新オプション option_type = 'video_sns'（ビジ友公式SNS動画制作プラン。買い切り・期限なし。
--    運営が撮影・編集して公式 SNS に掲載する）を銀行振込の申込テーブルで受け付けられるようにする。
-- 2. 旧「職場紹介動画」（video_workplace）は「プロフィール動画制作プラン」（video）に統合し
--    新規販売を停止した。既存行・Webhook・ADM-026 の有効化は維持するため、列挙からは外さない
--    （新規申込の拒否はアプリ側 isDiscontinuedOption() が担う）。
--
-- option_subscriptions.option_type は CHECK 制約の無い text なので変更不要だが、
-- bank_transfer_requests は target_consistency CHECK でオプション種別を列挙しているため、
-- 許可リストに 'video_sns' を追加する（列挙を増やすだけ。既存行には影響しない）。
-- ============================================================

ALTER TABLE public.bank_transfer_requests
  DROP CONSTRAINT bank_transfer_requests_target_consistency;

ALTER TABLE public.bank_transfer_requests
  ADD CONSTRAINT bank_transfer_requests_target_consistency CHECK (
    (target_kind = 'plan'
      AND plan_type IN ('individual', 'small', 'corporate', 'corporate_premium')
      AND option_type IS NULL AND job_id IS NULL)
    OR
    (target_kind = 'option'
      AND option_type IN ('video', 'video_workplace', 'video_shooting', 'video_sns', 'urgent', 'compensation_5000', 'compensation_9800')
      AND plan_type IS NULL)
  );

COMMENT ON CONSTRAINT bank_transfer_requests_target_consistency ON public.bank_transfer_requests IS
  'plan は plan_type 必須・option_type/job_id NULL、option は option_type（video / video_workplace / video_shooting / video_sns / urgent / compensation_5000 / compensation_9800）必須・plan_type NULL。新オプションを足すときはここの列挙も更新する（src/lib/billing/options.ts の OptionType と一致させる）。video_workplace は P10 で新規販売停止だが既存行のため残す';
