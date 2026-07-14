-- ============================================================
-- 掲載終了(status='closed')案件を、関係者に閲覧許可する
-- ============================================================
-- 背景:
--   既存の jobs_select_open ポリシーは status='open' の案件だけを
--   オーナー/同組織/管理者以外に公開する。案件が closed になると、
--   その案件に応募した受注者・お気に入り(マイリスト)登録者・スカウト
--   受信者が案件行を SELECT できなくなり、以下の不具合が発生していた:
--     - 応募履歴/応募詳細で「不明な案件」表示
--     - マイリストから案件がサイレントに消える
--     - スカウト/メッセージの案件カードが受注者側で消える
--     - 完了報告・評価の送信が失敗する
--       (submitContractorReportAction が jobs を読めず reviewee_id が空になる)
--     - 通知メールの発注者名が「不明」で解決される
-- 対策:
--   案件に「関係」を持つ受注者(応募/お気に入り/スカウト)に限って
--   closed 案件の SELECT を追加で許可する。無関係な認証ユーザーには
--   引き続き非公開(募集案件一覧・検索は元々 status='open' で絞っている)。

-- ------------------------------------------------------------
-- 関係性判定ヘルパー
-- ------------------------------------------------------------
-- SECURITY DEFINER で RLS をバイパスして参照するため、jobs RLS ポリシー
-- から applications/favorites/messages を参照しても無限再帰しない
-- (is_same_org 等と同じパターン)。
-- CLAUDE.md ルール: SECURITY DEFINER は SET search_path = public 必須 +
-- テーブルは public. で完全修飾する。
CREATE OR REPLACE FUNCTION public.has_job_relationship(uid uuid, target_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- (1) 応募した (キャンセル済みも含む: 関わった事実は残る)
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.job_id = target_job_id
        AND a.applicant_id = uid
    )
    -- (2) お気に入り(マイリスト)に登録した
    OR EXISTS (
      SELECT 1 FROM public.favorites f
      WHERE f.user_id = uid
        AND f.target_type = 'job'
        AND f.target_id = target_job_id
    )
    -- (3) スカウトを受け取った/やり取りした (スレッド参加者)
    OR EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.message_threads t ON t.id = m.thread_id
      WHERE m.job_id = target_job_id
        AND m.is_scout = true
        AND (t.participant_1_id = uid OR t.participant_2_id = uid)
    );
$$;

-- ------------------------------------------------------------
-- closed 案件を関係者に公開する SELECT ポリシー
-- ------------------------------------------------------------
-- 既存 SELECT ポリシー(open/owner/org/admin)へ PERMISSIVE(OR)で追加される。
-- status='closed' に限定することで draft/open には影響しない
-- (open は元々 jobs_select_open で公開済み)。
CREATE POLICY "jobs_select_related_closed" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    status = 'closed'
    AND deleted_at IS NULL
    AND public.has_job_relationship(auth.uid(), id)
  );
