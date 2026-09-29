-- ============================================================
-- 会員セッションから「他人に見せない情報」を読めないようにする（2026-09-29）
-- ============================================================
--
-- 背景（20260929130000_member_write_guards.sql の「読む側」）:
--   1. Storage `application-documents`（発注者が応募者だけに渡す書類）の SELECT ポリシーが
--      bucket_id だけを見ており、ログイン会員なら全応募の書類を一覧・取得できた
--   2. Storage `message-attachments` の SELECT ポリシーがオブジェクトと無関係で、
--      どこかのスレッドの参加者なら全スレッドの添付を読めた
--   3. users の全列が全会員に読めた（メールアドレス・生年月日・Stripe 顧客 ID・
--      CCUS 技能者 ID・招待完了日時）
--   4. videos.admin_label（運営用のメモ）が全会員に読めた
--
-- 方針:
--   - Storage はポリシーで「本人のフォルダ」か「その添付を参照している行が
--     自分に見えるか（行の RLS に判定を任せる）」に絞る
--   - users / videos は列権限（REVOKE SELECT → GRANT SELECT(公開列)）。
--     列権限は行を問わないため、本人の行でも非公開列は読めなくなる。
--     本人が自分の非公開列を読む必要がある箇所は get_my_private_profile()、
--     年齢表示は get_user_ages()（どちらも SECURITY DEFINER）を使う
--   - サーバー側でメール送信等のために他人のメールアドレスが必要な処理は
--     admin client（service_role）で読む（service_role は列権限の対象外）
--
-- 注意（列を足すとき）:
--   - users / videos に列を足しても、会員セッションからは読めない（ここで列を
--     列挙して GRANT しているため）。会員に見せてよい列なら GRANT SELECT(col) を
--     新しい migration で足し、supabase/tests/member_read_guards.test.sql にも追記する
--   - 20260617120000_grant_public_schema_to_supabase_roles.sql の GRANT ALL を
--     再実行すると表単位の SELECT が戻り、この制限が黙って外れる。再実行したら
--     この migration の 3・4 も再実行すること
-- 回帰テスト: supabase/tests/member_read_guards.test.sql

-- ------------------------------------------------------------
-- 1. Storage: application-documents
--   読めるのは「自分がアップロードしたもの（自分のフォルダ）」と
--   「自分に見える応募（applications の RLS = 応募者本人・案件の発注者・同組織）が
--   document_urls で参照しているもの」だけ。
--   旧データは公開 URL 形式（…/object/public/application-documents/<path>）で
--   保存されているため末尾一致も見る。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_users_select_application_documents" ON storage.objects;

CREATE POLICY "application_documents_select_related"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'application-documents'
    AND (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        CROSS JOIN LATERAL unnest(a.document_urls) AS d(path)
        WHERE a.document_urls IS NOT NULL
          AND (
            d.path = objects.name
            OR d.path LIKE '%/object/public/application-documents/' || objects.name
          )
      )
    )
  );

-- ------------------------------------------------------------
-- 2. Storage: message-attachments
--   読めるのは「自分がアップロードしたもの」と「自分に見えるメッセージ
--   （messages の RLS = スレッドの当事者・同組織）が image_url で参照しているもの」だけ。
--   署名 URL はブラウザ（Realtime 受信時）でも作るため、ポリシーで守る必要がある。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "msg_attachments_participant_select" ON storage.objects;

CREATE POLICY "msg_attachments_related_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.image_url = objects.name
      )
    )
  );

CREATE INDEX IF NOT EXISTS messages_image_url_idx
  ON public.messages (image_url)
  WHERE image_url IS NOT NULL;

-- ------------------------------------------------------------
-- 3. users: 会員セッションが読める列を公開列だけにする
--   非公開: email, birth_date, video_url（廃止予定）, ccus_worker_id,
--           stripe_customer_id, password_set_at
--   INSERT / UPDATE の権限は変えない（書き込みの保護は guard_users_member_write）
-- ------------------------------------------------------------
REVOKE SELECT ON public.users FROM anon, authenticated;
GRANT SELECT (
  id, role, last_name, first_name, gender, prefecture, municipality,
  company_name, bio, avatar_url, is_active, identity_verified, ccus_verified,
  created_at, updated_at, deleted_at, skill_tags, is_hidden, list_plan_rank
) ON public.users TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. videos: admin_label（運営用のメモ）を会員から隠す
-- ------------------------------------------------------------
REVOKE SELECT ON public.videos FROM anon, authenticated;
GRANT SELECT (
  id, user_id, placement, sort_order, provider, cloudflare_uid,
  embed_source_url, status, created_at, updated_at
) ON public.videos TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. 本人の非公開列を読む関数
--   プロフィール（生年月日の編集・年齢表示）、お問い合わせ等のメール初期入力、
--   招待承諾画面（password_set_at）で使う。auth.uid() の行だけを返す
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE (email text, birth_date date, password_set_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email, u.birth_date, u.password_set_at
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. 年齢を返す関数（生年月日そのものは返さない）
--   一覧・詳細の「〇歳」表示用。年齢は日本時間の今日で数える。
--   生年月日が未登録の会員は age = NULL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_ages(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, age integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    CASE
      WHEN u.birth_date IS NULL THEN NULL
      ELSE date_part('year', age((now() AT TIME ZONE 'Asia/Tokyo')::date, u.birth_date))::integer
    END
  FROM public.users u
  WHERE auth.uid() IS NOT NULL
    AND u.id = ANY (p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.get_user_ages(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_ages(uuid[]) TO authenticated, service_role;
