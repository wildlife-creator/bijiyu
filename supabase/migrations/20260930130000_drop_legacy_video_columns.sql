-- ============================================================
-- 廃止済みの動画カラムを削除する
--   users.video_url（受注者 PR 動画）/ client_profiles.workplace_video_url（職場紹介動画）
--
-- 動画は 20260902120000_videos.sql で videos テーブル（1 行 = 1 本）に移し、既存の値も
-- その時点で videos にコピー済み。アプリはどちらの列も参照していない（【廃止予定】）。
-- 列が残っていると「どちらが正か」の混乱と、会員の書き込み・読み取りの保護対象を
-- 無駄に増やすだけなので、依頼人チェック前（staging）に削除して本番と同じ形で確認する。
--
-- users の書き込み保護（guard_users_member_write）が NEW.video_url を参照しているため、
-- 先に関数からその 1 行を外してから列を削除する（順序を逆にすると以後の users UPDATE が
-- 「record "new" has no field "video_url"」で全部失敗する）。
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_users_member_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_member_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 通常は handle_new_user（DEFINER）が作る。会員が直接作る場合は初期値のみ
    IF NEW.role IS DISTINCT FROM 'contractor'::public.user_role THEN PERFORM public.raise_protected_column('users', 'role'); END IF;
    IF NEW.is_active IS DISTINCT FROM true THEN PERFORM public.raise_protected_column('users', 'is_active'); END IF;
    IF NEW.identity_verified IS DISTINCT FROM false THEN PERFORM public.raise_protected_column('users', 'identity_verified'); END IF;
    IF NEW.ccus_verified IS DISTINCT FROM false THEN PERFORM public.raise_protected_column('users', 'ccus_verified'); END IF;
    IF NEW.ccus_worker_id IS NOT NULL THEN PERFORM public.raise_protected_column('users', 'ccus_worker_id'); END IF;
    IF NEW.stripe_customer_id IS NOT NULL THEN PERFORM public.raise_protected_column('users', 'stripe_customer_id'); END IF;
    IF NEW.deleted_at IS NOT NULL THEN PERFORM public.raise_protected_column('users', 'deleted_at'); END IF;
    IF NEW.password_set_at IS NOT NULL THEN PERFORM public.raise_protected_column('users', 'password_set_at'); END IF;
    IF NEW.is_hidden IS DISTINCT FROM false THEN PERFORM public.raise_protected_column('users', 'is_hidden'); END IF;
    IF NEW.list_plan_rank IS DISTINCT FROM 0 THEN PERFORM public.raise_protected_column('users', 'list_plan_rank'); END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('users', 'id'); END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN PERFORM public.raise_protected_column('users', 'role'); END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN PERFORM public.raise_protected_column('users', 'email'); END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN PERFORM public.raise_protected_column('users', 'is_active'); END IF;
  IF NEW.identity_verified IS DISTINCT FROM OLD.identity_verified THEN PERFORM public.raise_protected_column('users', 'identity_verified'); END IF;
  IF NEW.ccus_verified IS DISTINCT FROM OLD.ccus_verified THEN PERFORM public.raise_protected_column('users', 'ccus_verified'); END IF;
  IF NEW.ccus_worker_id IS DISTINCT FROM OLD.ccus_worker_id THEN PERFORM public.raise_protected_column('users', 'ccus_worker_id'); END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN PERFORM public.raise_protected_column('users', 'stripe_customer_id'); END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN PERFORM public.raise_protected_column('users', 'deleted_at'); END IF;
  IF NEW.password_set_at IS DISTINCT FROM OLD.password_set_at THEN PERFORM public.raise_protected_column('users', 'password_set_at'); END IF;
  IF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN PERFORM public.raise_protected_column('users', 'is_hidden'); END IF;
  IF NEW.list_plan_rank IS DISTINCT FROM OLD.list_plan_rank THEN PERFORM public.raise_protected_column('users', 'list_plan_rank'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('users', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.users DROP COLUMN IF EXISTS video_url;
ALTER TABLE public.client_profiles DROP COLUMN IF EXISTS workplace_video_url;
