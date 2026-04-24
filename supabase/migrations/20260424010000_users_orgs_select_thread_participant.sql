-- ============================================================
-- 退会済ユーザー / 組織を過去スレッド経由で SELECT できるようにする
-- ============================================================
-- 背景:
--   organization spec の C 案（法人 Owner 退会 → 組織ソフト削除 +
--   Admin/Staff の users.deleted_at セット）を実装後、受注者が過去スレッドを
--   開くと発注者名（client_profiles.display_name）を引けない問題が発覚。
--   users / organizations の既存 SELECT RLS が deleted_at IS NULL で弾くため、
--   message_threads の participant embed が null になっていた。
--
-- 対策:
--   PERMISSIVE 追加ポリシーを 1 本ずつ追加:
--     (a) 退会済みユーザーでも、自分が参加している message_threads の相手
--         として参照される場合は SELECT 可能
--     (b) ソフト削除済み組織でも、自分が参加している message_threads の
--         organization_id 経由で参照される場合は SELECT 可能
--
--   これにより:
--     - 過去スレッド詳細 / 一覧で発注者名・画像が引き続き表示される
--     - /clients や発注者一覧など「現行の発注者」を出す画面は
--       クエリ側の .is('deleted_at', null) で除外され続ける
--     - その他の場所では副作用最小（PERMISSIVE の OR 結合で広がるだけ）
-- ============================================================

CREATE POLICY "users_select_thread_participant_deleted" ON public.users
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.message_threads mt
      WHERE (mt.participant_1_id = auth.uid() OR mt.participant_2_id = auth.uid())
        AND (mt.participant_1_id = public.users.id OR mt.participant_2_id = public.users.id)
    )
  );

CREATE POLICY "organizations_select_thread_participant_deleted" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.message_threads mt
      WHERE mt.organization_id = public.organizations.id
        AND (mt.participant_1_id = auth.uid() OR mt.participant_2_id = auth.uid())
    )
  );
