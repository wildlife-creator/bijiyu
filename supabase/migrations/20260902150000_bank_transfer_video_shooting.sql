-- ============================================================
-- 2026-09-02: ユーザー撮影プラン（P7 / docs/requirements/spec-changes-202608.md §2.3(4)、
--             docs/requirements/p7-video-shooting-option-implementation-notes.md）
--
-- 新オプション option_type = 'video_shooting'（買い切り・期限なし。ユーザーが撮影した素材を
-- 運営が編集して掲載する）を銀行振込の申込テーブルで受け付けられるようにする。
--
-- option_subscriptions.option_type は CHECK 制約の無い text なので変更不要だが、
-- bank_transfer_requests は target_consistency CHECK でオプション種別を列挙しているため、
-- 許可リストに 'video_shooting' を追加する（列挙を増やすだけ。既存行には影響しない）。
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
      AND option_type IN ('video', 'video_workplace', 'video_shooting', 'urgent', 'compensation_5000', 'compensation_9800')
      AND plan_type IS NULL)
  );

COMMENT ON CONSTRAINT bank_transfer_requests_target_consistency ON public.bank_transfer_requests IS
  'plan は plan_type 必須・option_type/job_id NULL、option は option_type（video / video_workplace / video_shooting / urgent / compensation_5000 / compensation_9800）必須・plan_type NULL。新オプションを足すときはここの列挙も更新する（src/lib/billing/options.ts の OptionType と一致させる）';
