-- ============================================================
-- 会員セッションからの「保護列」書き換えを DB で禁止する（2026-09-29）
-- ============================================================
--
-- 背景: RLS は「どの行を触れるか」しか守っておらず、「どの列を変えられるか」を
-- 守っていなかった。会員（role = authenticated）が PostgREST を直接叩くと、
-- 自分の行なら課金・審査・運営系の列も書き換えられた（手元 DB で実証）:
--   - jobs.is_urgent（急募を無料で付与）
--   - users.role / identity_verified / ccus_verified / is_hidden（確認済みバッジ・運営なりすまし）
--   - client_profiles.admin_memo（運営メモを全会員が読み書き）/ is_urgent_option
--   - identity_verifications を status='approved' で INSERT
--   - applications を status='accepted' で INSERT
--   - 関与していない取引への user_reviews / client_reviews INSERT
--   - messages を is_proxy / is_scout 付きで INSERT
--   - complete_registration（SECURITY DEFINER・PUBLIC 実行可）で他人のプロフィールを上書き
--
-- 方針:
--   - BEFORE INSERT/UPDATE トリガー（guard_*）で、会員の直接リクエスト
--     （current_user が authenticated / anon）のときだけ保護列の変更を拒否する。
--     service_role（admin client・Webhook）、pg_cron（postgres）、SECURITY DEFINER 関数の
--     中（current_user = 関数所有者）はこれまでどおり通す。
--   - アプリが会員セッションで行っている書き込み（全 122 か所を棚卸し済み）は
--     すべてこのガードを通過する値だけを送っている。
--   - 列権限（REVOKE UPDATE(col)）ではなくトリガーにしたのは、
--     20260617120000_grant_public_schema_to_supabase_roles.sql の GRANT ALL で
--     列権限が黙って戻る事故を避けるため。
--   - BEFORE トリガーは名前順に発火する。guard_* は jobs_set_owner_plan_rank /
--     set_updated_at より先に走るため、会員が送った生の値を検査できる。
--   - 拒否は SQLSTATE 42501（insufficient_privilege）で返す。
-- 回帰テスト: supabase/tests/member_write_guards.test.sql

-- ------------------------------------------------------------
-- 共通: 会員（authenticated / anon）の直接リクエストかどうか
--   SECURITY INVOKER 必須（current_user を呼び出し元のまま見るため）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_member_request()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT current_user IN ('authenticated', 'anon');
$$;

CREATE OR REPLACE FUNCTION public.raise_protected_column(p_table text, p_column text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'column "%" of table "%" cannot be changed by members', p_column, p_table
    USING ERRCODE = '42501';
END;
$$;

-- ------------------------------------------------------------
-- 1. users
--   会員が変えてよい列: last_name, first_name, gender, birth_date, prefecture,
--   municipality, company_name, bio, avatar_url, skill_tags, updated_at
-- ------------------------------------------------------------
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
  IF NEW.video_url IS DISTINCT FROM OLD.video_url THEN PERFORM public.raise_protected_column('users', 'video_url'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('users', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_users_member_write ON public.users;
CREATE TRIGGER guard_users_member_write
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_member_write();

-- ------------------------------------------------------------
-- 2. jobs
--   会員は内容と status（draft / open / closed）を編集する。急募・所有者・組織・
--   削除は運営・Webhook・DEFINER 関数だけが変える。owner_plan_rank はトリガーが計算する
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_jobs_member_write()
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
    IF NEW.is_urgent IS DISTINCT FROM false THEN PERFORM public.raise_protected_column('jobs', 'is_urgent'); END IF;
    IF NEW.deleted_at IS NOT NULL THEN PERFORM public.raise_protected_column('jobs', 'deleted_at'); END IF;
    -- 組織は自分が所属する組織のみ（RLS は owner_id しか見ていない）
    IF NEW.organization_id IS NOT NULL
       AND NOT public.is_same_org(auth.uid(), NEW.organization_id) THEN
      PERFORM public.raise_protected_column('jobs', 'organization_id');
    END IF;
    -- owner_plan_rank は後続の jobs_set_owner_plan_rank が必ず上書きする
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('jobs', 'id'); END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN PERFORM public.raise_protected_column('jobs', 'owner_id'); END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN PERFORM public.raise_protected_column('jobs', 'organization_id'); END IF;
  IF NEW.is_urgent IS DISTINCT FROM OLD.is_urgent THEN PERFORM public.raise_protected_column('jobs', 'is_urgent'); END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN PERFORM public.raise_protected_column('jobs', 'deleted_at'); END IF;
  IF NEW.owner_plan_rank IS DISTINCT FROM OLD.owner_plan_rank THEN PERFORM public.raise_protected_column('jobs', 'owner_plan_rank'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('jobs', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_jobs_member_write ON public.jobs;
CREATE TRIGGER guard_jobs_member_write
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_jobs_member_write();

-- ------------------------------------------------------------
-- 3. client_profiles
--   運営メモは専用テーブルへ移す（下の 4.）。急募フラグは運営・Webhook・cron だけが変える。
--   CLI-021 の upsert は user_id を SET 句に含めるが値は変わらないので通る
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_client_profiles_member_write()
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
    IF NEW.is_urgent_option IS DISTINCT FROM false THEN PERFORM public.raise_protected_column('client_profiles', 'is_urgent_option'); END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('client_profiles', 'id'); END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN PERFORM public.raise_protected_column('client_profiles', 'user_id'); END IF;
  IF NEW.is_urgent_option IS DISTINCT FROM OLD.is_urgent_option THEN PERFORM public.raise_protected_column('client_profiles', 'is_urgent_option'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('client_profiles', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_profiles_member_write ON public.client_profiles;
CREATE TRIGGER guard_client_profiles_member_write
  BEFORE INSERT OR UPDATE ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_profiles_member_write();

-- ------------------------------------------------------------
-- 4. 運営メモ（ADM-005）を運営専用テーブルへ移す
--   client_profiles は全会員が SELECT できる（発注者表示名のため）ので、
--   同じ表に置く限り列が読まれる。RLS 有効・ポリシーなし = service_role のみ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_admin_memos (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  memo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_admin_memos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_admin_memos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_admin_memos TO service_role;

DROP TRIGGER IF EXISTS set_updated_at ON public.client_admin_memos;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.client_admin_memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO public.client_admin_memos (user_id, memo)
SELECT user_id, admin_memo
FROM public.client_profiles
WHERE admin_memo IS NOT NULL AND admin_memo <> ''
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.client_profiles DROP COLUMN IF EXISTS admin_memo;

-- ------------------------------------------------------------
-- 5. applications
--   会員の書き込みは 3 通りだけ:
--     - 応募（INSERT, status = 'applied'）
--     - 発注可否（applied → accepted / rejected。発注者側の項目のみ）
--     - 取り下げ（applied → cancelled。RLS applications_update_cancel）
--   受注者キャンセル・運営取消・完了は admin client
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_applications_member_write()
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
    IF NEW.status IS DISTINCT FROM 'applied'::public.application_status THEN PERFORM public.raise_protected_column('applications', 'status'); END IF;
    IF NEW.cancelled_by IS NOT NULL THEN PERFORM public.raise_protected_column('applications', 'cancelled_by'); END IF;
    IF NEW.first_work_date IS NOT NULL THEN PERFORM public.raise_protected_column('applications', 'first_work_date'); END IF;
    IF NEW.work_location IS NOT NULL THEN PERFORM public.raise_protected_column('applications', 'work_location'); END IF;
    IF NEW.client_notes IS NOT NULL THEN PERFORM public.raise_protected_column('applications', 'client_notes'); END IF;
    IF NEW.rejection_reason IS NOT NULL THEN PERFORM public.raise_protected_column('applications', 'rejection_reason'); END IF;
    IF NEW.document_urls IS NOT NULL AND cardinality(NEW.document_urls) > 0 THEN PERFORM public.raise_protected_column('applications', 'document_urls'); END IF;
    RETURN NEW;
  END IF;

  -- 応募者が入力した内容・紐づけは誰も変えない
  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('applications', 'id'); END IF;
  IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN PERFORM public.raise_protected_column('applications', 'job_id'); END IF;
  IF NEW.applicant_id IS DISTINCT FROM OLD.applicant_id THEN PERFORM public.raise_protected_column('applications', 'applicant_id'); END IF;
  IF NEW.headcount IS DISTINCT FROM OLD.headcount THEN PERFORM public.raise_protected_column('applications', 'headcount'); END IF;
  IF NEW.working_type IS DISTINCT FROM OLD.working_type THEN PERFORM public.raise_protected_column('applications', 'working_type'); END IF;
  IF NEW.preferred_first_work_date IS DISTINCT FROM OLD.preferred_first_work_date THEN PERFORM public.raise_protected_column('applications', 'preferred_first_work_date'); END IF;
  IF NEW.message IS DISTINCT FROM OLD.message THEN PERFORM public.raise_protected_column('applications', 'message'); END IF;
  IF NEW.scout_message_id IS DISTINCT FROM OLD.scout_message_id THEN PERFORM public.raise_protected_column('applications', 'scout_message_id'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('applications', 'created_at'); END IF;

  IF NEW.status = 'cancelled'::public.application_status THEN
    -- 応募者自身の取り下げ: 発注者側の項目は触れない
    IF NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by <> 'contractor' THEN PERFORM public.raise_protected_column('applications', 'cancelled_by'); END IF;
    IF NEW.first_work_date IS DISTINCT FROM OLD.first_work_date THEN PERFORM public.raise_protected_column('applications', 'first_work_date'); END IF;
    IF NEW.work_location IS DISTINCT FROM OLD.work_location THEN PERFORM public.raise_protected_column('applications', 'work_location'); END IF;
    IF NEW.client_notes IS DISTINCT FROM OLD.client_notes THEN PERFORM public.raise_protected_column('applications', 'client_notes'); END IF;
    IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN PERFORM public.raise_protected_column('applications', 'rejection_reason'); END IF;
    IF NEW.document_urls IS DISTINCT FROM OLD.document_urls THEN PERFORM public.raise_protected_column('applications', 'document_urls'); END IF;
  ELSE
    IF NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by THEN PERFORM public.raise_protected_column('applications', 'cancelled_by'); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_applications_member_write ON public.applications;
CREATE TRIGGER guard_applications_member_write
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_applications_member_write();

-- ------------------------------------------------------------
-- 6. identity_verifications: 会員の申請は必ず「申請中」から
--   （審査の UPDATE は RLS で運営のみ・管理画面は admin client）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_identity_verifications_member_write()
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
    IF NEW.status IS DISTINCT FROM 'pending'::public.verification_status THEN PERFORM public.raise_protected_column('identity_verifications', 'status'); END IF;
    IF NEW.rejection_reason IS NOT NULL THEN PERFORM public.raise_protected_column('identity_verifications', 'rejection_reason'); END IF;
    IF NEW.reviewed_by IS NOT NULL THEN PERFORM public.raise_protected_column('identity_verifications', 'reviewed_by'); END IF;
    IF NEW.reviewed_at IS NOT NULL THEN PERFORM public.raise_protected_column('identity_verifications', 'reviewed_at'); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_identity_verifications_member_write ON public.identity_verifications;
CREATE TRIGGER guard_identity_verifications_member_write
  BEFORE INSERT ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_identity_verifications_member_write();

-- ------------------------------------------------------------
-- 7. messages（会員の UPDATE ポリシーは無い。既読・スカウト返答は admin client）
--   - 既読・スカウトの返答状態は送信時に付けられない
--   - スカウトは発注者（client）・担当者（staff）だけが送れる（scout-send の役割チェックと同じ）
--   - 「代理」印は、送信者がそのスレッドの組織の代理アカウントであるときだけ付けられる
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_messages_member_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_thread record;
BEGIN
  IF NOT public.is_member_request() THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.read_at IS NOT NULL THEN PERFORM public.raise_protected_column('messages', 'read_at'); END IF;

  IF NEW.is_scout THEN
    IF NEW.scout_status IS DISTINCT FROM 'pending' THEN PERFORM public.raise_protected_column('messages', 'scout_status'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('client'::public.user_role, 'staff'::public.user_role)
    ) THEN
      PERFORM public.raise_protected_column('messages', 'is_scout');
    END IF;
  ELSIF NEW.scout_status IS NOT NULL THEN
    PERFORM public.raise_protected_column('messages', 'scout_status');
  END IF;

  IF NEW.is_proxy THEN
    SELECT organization_id, organization_1_id, organization_2_id INTO v_thread
    FROM public.message_threads WHERE id = NEW.thread_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_proxy_account = true
        AND om.organization_id IN (v_thread.organization_id, v_thread.organization_1_id, v_thread.organization_2_id)
    ) THEN
      PERFORM public.raise_protected_column('messages', 'is_proxy');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_messages_member_write ON public.messages;
CREATE TRIGGER guard_messages_member_write
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_messages_member_write();

-- ------------------------------------------------------------
-- 8. message_threads
--   会員が作るのは参加者・組織・種類（message / scout）。メール通知の時刻は admin client。
--   作成後に変えてよいのは種類（message → scout）と updated_at だけ
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_threads_member_write()
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
    IF NEW.last_email_to_contractor_at IS NOT NULL THEN PERFORM public.raise_protected_column('message_threads', 'last_email_to_contractor_at'); END IF;
    IF NEW.last_email_to_client_side_at IS NOT NULL THEN PERFORM public.raise_protected_column('message_threads', 'last_email_to_client_side_at'); END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('message_threads', 'id'); END IF;
  IF NEW.participant_1_id IS DISTINCT FROM OLD.participant_1_id THEN PERFORM public.raise_protected_column('message_threads', 'participant_1_id'); END IF;
  IF NEW.participant_2_id IS DISTINCT FROM OLD.participant_2_id THEN PERFORM public.raise_protected_column('message_threads', 'participant_2_id'); END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN PERFORM public.raise_protected_column('message_threads', 'organization_id'); END IF;
  IF NEW.organization_1_id IS DISTINCT FROM OLD.organization_1_id THEN PERFORM public.raise_protected_column('message_threads', 'organization_1_id'); END IF;
  IF NEW.organization_2_id IS DISTINCT FROM OLD.organization_2_id THEN PERFORM public.raise_protected_column('message_threads', 'organization_2_id'); END IF;
  IF NEW.last_email_to_contractor_at IS DISTINCT FROM OLD.last_email_to_contractor_at THEN PERFORM public.raise_protected_column('message_threads', 'last_email_to_contractor_at'); END IF;
  IF NEW.last_email_to_client_side_at IS DISTINCT FROM OLD.last_email_to_client_side_at THEN PERFORM public.raise_protected_column('message_threads', 'last_email_to_client_side_at'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('message_threads', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_threads_member_write ON public.message_threads;
CREATE TRIGGER guard_message_threads_member_write
  BEFORE INSERT OR UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_threads_member_write();

-- ------------------------------------------------------------
-- 9. scout_templates: 組織は自分の所属組織だけ。作成者・組織は後から変えない。
--   updated_by は自分（または変更なし）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_scout_templates_member_write()
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
    IF NEW.organization_id IS NOT NULL
       AND NOT public.is_same_org(auth.uid(), NEW.organization_id) THEN
      PERFORM public.raise_protected_column('scout_templates', 'organization_id');
    END IF;
    IF NEW.updated_by IS NOT NULL AND NEW.updated_by IS DISTINCT FROM auth.uid() THEN
      PERFORM public.raise_protected_column('scout_templates', 'updated_by');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN PERFORM public.raise_protected_column('scout_templates', 'id'); END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN PERFORM public.raise_protected_column('scout_templates', 'owner_id'); END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN PERFORM public.raise_protected_column('scout_templates', 'organization_id'); END IF;
  IF NEW.updated_by IS DISTINCT FROM OLD.updated_by AND NEW.updated_by IS DISTINCT FROM auth.uid() THEN
    PERFORM public.raise_protected_column('scout_templates', 'updated_by');
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN PERFORM public.raise_protected_column('scout_templates', 'created_at'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_scout_templates_member_write ON public.scout_templates;
CREATE TRIGGER guard_scout_templates_member_write
  BEFORE INSERT OR UPDATE ON public.scout_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_scout_templates_member_write();

-- ------------------------------------------------------------
-- 10. 評価: 会員セッションからの INSERT は使っていない（完了報告の Server Action が
--     取引の当事者であることを確かめたうえで admin client で書く）。
--     reviewer_id だけを見るポリシーだと無関係の取引に評価を付けられるため削除する
-- ------------------------------------------------------------
DROP POLICY IF EXISTS user_reviews_insert ON public.user_reviews;
DROP POLICY IF EXISTS client_reviews_insert ON public.client_reviews;

-- ------------------------------------------------------------
-- 11. complete_registration: 本人の行だけを更新できるようにする
--   以前は SECURITY DEFINER・PUBLIC 実行可・p_user_id を検査しておらず、
--   誰でも他人の氏名・生年月日などを上書きできた。
--   あわせて職種の `LIMIT 3` を外す（master-skills 仕様で件数制限は撤廃済み。
--   登録画面では 4 件以上選べるのに 4 件目以降が黙って捨てられていた）。
--   それ以外の本体（UPDATE / INSERT の中身）は 20260605100000 と同一
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_birth_date date,
  p_prefecture text,
  p_company_name text DEFAULT NULL,
  p_municipality text DEFAULT NULL,
  p_skills jsonb DEFAULT '[]'::jsonb,
  p_areas jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 会員として呼ばれたときは本人の行だけ（service_role / postgres からの呼び出しは従来どおり）
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'complete_registration: can only update your own profile'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.users SET
    last_name = p_last_name,
    first_name = p_first_name,
    gender = p_gender,
    birth_date = p_birth_date,
    prefecture = p_prefecture,
    municipality = NULLIF(p_municipality, ''),
    company_name = p_company_name,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.user_skills (id, user_id, trade_type, experience_years)
  SELECT
    gen_random_uuid(),
    p_user_id,
    (skill->>'trade_type')::text,
    (skill->>'experience_years')::integer
  FROM jsonb_array_elements(p_skills) AS skill;

  INSERT INTO public.user_available_areas (id, user_id, prefecture, municipality)
  SELECT
    gen_random_uuid(),
    p_user_id,
    (elem->>'prefecture')::text,
    NULLIF(elem->>'municipality', '')
  FROM jsonb_array_elements(p_areas) AS elem;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_registration(uuid, text, text, text, date, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_registration(uuid, text, text, text, date, text, text, text, jsonb, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 12. 使われていない旧 RPC update_profile を削除
--   （SECURITY DEFINER。マスタ検証を通さずに職種・資格・エリアを置き換えられた）
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_profile(uuid, text, text, text, text, text, text, jsonb, text[], text[], text[]);

-- ------------------------------------------------------------
-- 13. handle_new_user: 会員が自分で登録するときの metadata を信じない
--   以前は raw_user_meta_data の invited_role='staff' / invited_last_name / invited_first_name を
--   無条件に採用しており、GoTrue の /signup を直接呼べば自分を「担当者」にしたり、
--   氏名を先に入れてプロフィール入力（職種・対応エリア）を飛ばしたりできた。
--   GoTrue（supabase_auth_admin）経由の作成では metadata を使わず、受注者・氏名なしで作る。
--   招待（担当者招待 CLI-025・管理責任者招待 ADM-006）はアプリが admin client で
--   role / 氏名を設定する（mypage/members/actions.ts・admin/clients/new/actions.ts）。
--   seed・pgTAP など DB に直接 INSERT する場合（session_user ≠ supabase_auth_admin）は従来どおり
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_trust_metadata     boolean;
  v_invited_role       text;
  v_invited_last_name  text;
  v_invited_first_name text;
  v_role               public.user_role;
BEGIN
  v_trust_metadata := session_user IS DISTINCT FROM 'supabase_auth_admin';

  IF v_trust_metadata THEN
    v_invited_role       := NEW.raw_user_meta_data->>'invited_role';
    v_invited_last_name  := NEW.raw_user_meta_data->>'invited_last_name';
    v_invited_first_name := NEW.raw_user_meta_data->>'invited_first_name';
  END IF;

  IF v_invited_role = 'staff' THEN
    v_role := 'staff'::public.user_role;
  ELSE
    v_role := 'contractor'::public.user_role;
  END IF;

  INSERT INTO public.users (id, role, email, last_name, first_name)
  VALUES (
    NEW.id,
    v_role,
    NEW.email,
    v_invited_last_name,
    v_invited_first_name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
