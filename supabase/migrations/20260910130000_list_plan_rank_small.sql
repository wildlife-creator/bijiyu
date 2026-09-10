-- ============================================================
-- 2026-09-10: 上位表示にスタンダードを追加（P11 / プラン比較表の確定内容）
--
-- 一覧のプラン順ランク（users.list_plan_rank / jobs.owner_plan_rank）を
--   旧: 0 = その他（無料 / ライト / スタンダード）、1 = プレミアム、2 = ハイエンド
--   新: 0 = その他（無料 / ライト）、1 = スタンダード、2 = プレミアム、3 = ハイエンド
-- に変更する。並び順は「ハイエンド → プレミアム → スタンダード → その他（新着順）」。
-- ランク列の再計算経路（トリガー・refresh_list_plan_rank）は 20260902140000 のまま。
-- 関数を差し替えたあと、既存行を全件再計算する。
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_plan_rank_of(uid uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE((
    SELECT CASE s.plan_type
             WHEN 'corporate_premium' THEN 3
             WHEN 'corporate'         THEN 2
             WHEN 'small'             THEN 1
             ELSE 0
           END
    FROM public.subscriptions s
    WHERE s.user_id = uid
      AND s.status IN ('active', 'past_due')
    ORDER BY s.created_at DESC
    LIMIT 1
  ), 0)::smallint;
$function$;

COMMENT ON FUNCTION public.list_plan_rank_of(uuid) IS
  '一覧のプラン順ランク（0 = その他 / 1 = スタンダード / 2 = プレミアム / 3 = ハイエンド。P11 でスタンダードを追加）。active/past_due の subscriptions.plan_type から算出';

COMMENT ON COLUMN public.users.list_plan_rank IS
  '一覧のプラン順ランク（0 = その他 / 1 = スタンダード / 2 = プレミアム / 3 = ハイエンド）。subscriptions のトリガーで自動更新。TS 側から書き込まない';

COMMENT ON COLUMN public.jobs.owner_plan_rank IS
  '案件の契約主体（組織オーナー or owner_id）のプラン順ランク（0 = その他 / 1 = スタンダード / 2 = プレミアム / 3 = ハイエンド）。トリガーで自動更新';

-- 既存行の再計算（スタンダード契約者とその案件が 0 → 1 になる）
UPDATE public.users u
   SET list_plan_rank = public.list_plan_rank_of(u.id)
 WHERE u.list_plan_rank IS DISTINCT FROM public.list_plan_rank_of(u.id);

UPDATE public.jobs j
   SET owner_plan_rank = public.job_owner_plan_rank_of(j.owner_id, j.organization_id)
 WHERE j.owner_plan_rank IS DISTINCT FROM public.job_owner_plan_rank_of(j.owner_id, j.organization_id);
