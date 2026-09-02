-- ============================================================
-- 2026-09-02: 一覧のプラン順ランク列（P6 / docs/requirements/spec-changes-202608.md §2.5(1)、
--             docs/requirements/p6-list-sorting-implementation-notes.md §2.1）
--
-- 発注者一覧（CON-005）と案件一覧（CON-002 おすすめ順）を「ハイエンド → プレミアム → その他」
-- の順に並べるため、契約プランから導いたランクを users / jobs に非正規化して持つ。
--
--   users.list_plan_rank   : 0 = その他（無料 / ライト / スタンダード）、1 = プレミアム、2 = ハイエンド
--   jobs.owner_plan_rank   : 案件の契約主体（organization_id があれば組織オーナー、無ければ owner_id）のランク
--
-- ランクは subscriptions（status IN ('active','past_due')）の plan_type から計算し、
-- 契約の作成・変更・解約・組織作成・案件の所有者変更にトリガーで追従させる（手動更新や cron に頼らない）。
-- 契約を書き換える経路（Stripe Webhook の RPC / 銀行振込・管理運営アカウントの管理画面 / 退会 / cron）は
-- すべて subscriptions への SQL 書き込みなので、トリガーで漏れなく拾える。
--
-- PLAN_LIMITS.rank（0〜4、src/lib/constants/plans.ts）とは別物。仕様はライト / スタンダード / 無料を
-- 同じ「その他」に置くため、ここでは 3 段階のみ持つ。
--
-- ビュー案（subscriptions の RLS が本人行のみで invoker 権限では他人のランクが常に 0 になる）、
-- RPC 案（2 画面分のフィルタ・埋込を SQL に書き直す大改修）は不採用。
--
-- users.list_plan_rank は誰でも読める列になるが、並び順とプランバッジから既に推測できる情報なので許容。
-- ============================================================

-- ------------------------------------------------------------
-- 1. ランク列
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN list_plan_rank smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.list_plan_rank IS
  '一覧のプラン順ランク（0 = その他 / 1 = プレミアム / 2 = ハイエンド）。subscriptions の active/past_due 行から list_plan_rank_of() で計算し、トリガーで自動更新。CON-005 の既定順に使用';

ALTER TABLE public.jobs
  ADD COLUMN owner_plan_rank smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.jobs.owner_plan_rank IS
  '案件の契約主体（organization_id があれば組織オーナー、無ければ owner_id）のプラン順ランク（0 / 1 / 2）。jobs_set_owner_plan_rank トリガーと subscriptions / organizations のトリガーで自動更新。CON-002 おすすめ順に使用';

-- ------------------------------------------------------------
-- 2. ランク計算関数
-- ------------------------------------------------------------
-- 本人の有効な契約（active / past_due）の plan_type からランクを返す。
-- SECURITY DEFINER: subscriptions の RLS は本人行のみのため、他人のランクを引くにはバイパスが必要
--（is_paid_user と同じ構造）。
CREATE OR REPLACE FUNCTION public.list_plan_rank_of(uid uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE((
    SELECT CASE s.plan_type
             WHEN 'corporate_premium' THEN 2
             WHEN 'corporate'         THEN 1
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
  '一覧のプラン順ランク（0 = その他 / 1 = プレミアム / 2 = ハイエンド）。active/past_due の subscriptions.plan_type から算出';

-- 案件の契約主体を解決してランクを返す（organization_id があれば組織オーナー、無ければ owner_id）。
-- 担当者（staff）が作成した案件も会社（契約主体）のプランで判定される。
CREATE OR REPLACE FUNCTION public.job_owner_plan_rank_of(p_owner_id uuid, p_organization_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.list_plan_rank_of(
    COALESCE(
      (SELECT o.owner_id
         FROM public.organizations o
        WHERE o.id = p_organization_id
          AND o.deleted_at IS NULL),
      p_owner_id
    )
  );
$function$;

COMMENT ON FUNCTION public.job_owner_plan_rank_of(uuid, uuid) IS
  '案件の契約主体（組織オーナー or owner_id）のプラン順ランク';

-- 契約者 1 人分のランクを再計算して users と、その契約者の案件（本人名義 + 所属組織の案件）に反映する。
CREATE OR REPLACE FUNCTION public.refresh_list_plan_rank(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rank smallint;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_rank := public.list_plan_rank_of(p_user_id);

  UPDATE public.users
     SET list_plan_rank = v_rank
   WHERE id = p_user_id
     AND list_plan_rank <> v_rank;

  UPDATE public.jobs j
     SET owner_plan_rank = public.job_owner_plan_rank_of(j.owner_id, j.organization_id)
   WHERE (
           j.owner_id = p_user_id
           OR j.organization_id IN (
             SELECT o.id FROM public.organizations o WHERE o.owner_id = p_user_id
           )
         )
     AND j.owner_plan_rank <> public.job_owner_plan_rank_of(j.owner_id, j.organization_id);
END;
$function$;

COMMENT ON FUNCTION public.refresh_list_plan_rank(uuid) IS
  '契約者のプラン順ランクを再計算し users.list_plan_rank と関連案件の jobs.owner_plan_rank に反映（subscriptions トリガーから呼ばれる）';

-- ------------------------------------------------------------
-- 3. トリガー
-- ------------------------------------------------------------
-- 3-1. subscriptions: 契約の作成 / プラン・状態・契約者の変更 / 削除 → 契約者（新旧）のランクを再計算
CREATE OR REPLACE FUNCTION public.subscriptions_refresh_list_plan_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_list_plan_rank(OLD.user_id);
  END IF;
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM public.refresh_list_plan_rank(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER subscriptions_refresh_list_plan_rank
  AFTER INSERT OR UPDATE OF plan_type, status, user_id OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_refresh_list_plan_rank();

-- 3-2. jobs: 作成時・所有者 / 組織の変更時に契約主体のランクを設定
--（organization_id は ensure_organization_exists の昇格時にも UPDATE されるため UPDATE OF に含める）
CREATE OR REPLACE FUNCTION public.jobs_set_owner_plan_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.owner_plan_rank := public.job_owner_plan_rank_of(NEW.owner_id, NEW.organization_id);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER jobs_set_owner_plan_rank
  BEFORE INSERT OR UPDATE OF owner_id, organization_id, owner_plan_rank ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_set_owner_plan_rank();

-- 3-3. organizations: 組織の作成 / オーナー変更 / 解散 → その組織の案件を再計算
--（契約付与 → 組織作成の順で進む昇格フローでも案件のランクが付くように）
CREATE OR REPLACE FUNCTION public.organizations_refresh_owner_plan_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.jobs j
     SET owner_plan_rank = public.job_owner_plan_rank_of(j.owner_id, j.organization_id)
   WHERE j.organization_id = NEW.id
     AND j.owner_plan_rank <> public.job_owner_plan_rank_of(j.owner_id, j.organization_id);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER organizations_refresh_owner_plan_rank
  AFTER INSERT OR UPDATE OF owner_id, deleted_at ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_refresh_owner_plan_rank();

-- 書き込みを伴う関数は PostgREST 経由で呼ばせない（値は常に正しく再計算されるだけだが、権限は絞る）
REVOKE EXECUTE ON FUNCTION public.refresh_list_plan_rank(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscriptions_refresh_list_plan_rank() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_set_owner_plan_rank() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.organizations_refresh_owner_plan_rank() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. 索引（既定順のページネーション用）
-- ------------------------------------------------------------
CREATE INDEX jobs_recommended_order_idx
  ON public.jobs (status, is_urgent DESC, owner_plan_rank DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX users_client_list_rank_idx
  ON public.users (list_plan_rank DESC, created_at DESC)
  WHERE deleted_at IS NULL AND is_hidden = false AND role = 'client';

-- ------------------------------------------------------------
-- 5. バックフィル（既存データ）
-- ------------------------------------------------------------
-- 一括更新で users / jobs の updated_at を動かさないよう、set_updated_at だけ一時的に止める
ALTER TABLE public.users DISABLE TRIGGER set_updated_at;
ALTER TABLE public.jobs  DISABLE TRIGGER set_updated_at;

UPDATE public.users u
   SET list_plan_rank = r.rank
  FROM (SELECT id, public.list_plan_rank_of(id) AS rank FROM public.users) r
 WHERE r.id = u.id
   AND u.list_plan_rank <> r.rank;

UPDATE public.jobs j
   SET owner_plan_rank = public.job_owner_plan_rank_of(j.owner_id, j.organization_id)
 WHERE j.owner_plan_rank <> public.job_owner_plan_rank_of(j.owner_id, j.organization_id);

ALTER TABLE public.users ENABLE TRIGGER set_updated_at;
ALTER TABLE public.jobs  ENABLE TRIGGER set_updated_at;
