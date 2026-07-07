-- ============================================================
-- is_paid_user() を組織対応に拡張
-- ============================================================
--
-- 背景:
--   法人プランでは Owner だけが subscriptions 行を持ち、Staff / Admin
--   (org_role) は Owner のサブスクに相乗りする設計
--   （CLAUDE.md「Staff ユーザーの subscription 参照」/ REQ-ORG-011）。
--
-- 従来の is_paid_user() は本人 uid の subscriptions しか見ていないため、
-- Staff が jobs テーブルへ INSERT する際に jobs_insert RLS ポリシーで
--   `is_paid_user(auth.uid())`
-- が false となり、案件を保存できないバグがあった
-- （Server Action 側の subscription チェックを Owner に付け替えても
--  DB レベルの RLS で弾かれるため、コード側だけの修正では不十分）。
--
-- このマイグレーションで is_paid_user() を次のいずれかで true を返す形に
-- 拡張する:
--   (a) 本人が active/past_due の subscription を持つ（従来と同じ）
--   (b) 本人が organization_members に admin/staff として所属し、
--       その組織の Owner が active/past_due の subscription を持つ
--
-- 使用箇所:
--   - jobs.jobs_insert (RLS INSERT ポリシー)
--   本マイグレーション時点で is_paid_user() を参照する RLS ポリシーは
--   上記 1 件のみ（pg_policies で確認済み）。
--
-- SECURITY DEFINER + SET search_path = public は CLAUDE.md
-- 「SECURITY DEFINER 関数は SET search_path = public 必須」に従う。
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_paid_user(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    -- (a) 本人が有効なサブスクを持つ（Owner / 個人ユーザー）
    EXISTS (
      SELECT 1
      FROM public.subscriptions s
      JOIN public.users u ON u.id = s.user_id
      WHERE s.user_id = uid
        AND s.status IN ('active', 'past_due')
        AND u.deleted_at IS NULL
    )
    OR
    -- (b) 組織の Staff / Admin (org_role) で、Owner のサブスクが有効
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o
        ON o.id = om.organization_id
       AND o.deleted_at IS NULL
      JOIN public.subscriptions s ON s.user_id = o.owner_id
      JOIN public.users u ON u.id = o.owner_id
      WHERE om.user_id = uid
        AND om.org_role IN ('admin', 'staff')
        AND s.status IN ('active', 'past_due')
        AND u.deleted_at IS NULL
    );
$function$;

COMMENT ON FUNCTION public.is_paid_user(uid uuid) IS
  '有効なサブスクリプションを持つユーザー判定。'
  'Owner / 個人ユーザーは本人の subscriptions、'
  '法人 Staff / Admin (org_role) は所属組織 Owner の subscriptions を参照する。';
