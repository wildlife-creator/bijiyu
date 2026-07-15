-- ============================================================
-- 退会済みユーザー / 解散済み組織のスレッド経由 SELECT を組織対応にする (v2)
-- ============================================================
-- 背景:
--   20260424010000 で追加した users / organizations の
--   "*_select_thread_participant_deleted" ポリシーは、閲覧者が
--   「スレッドの直接の当事者 (participant_1/2)」である場合しか許可していない。
--   組織共有スレッド (message_threads_select は is_same_org で組織メンバー全員に
--   開放済み) を、当事者でない同組織メンバー (招待スタッフ等) が開くと:
--     - 退会済み counterparty の users embed が RLS で silent null になり
--       宛先が「未設定」表示になる (実名（退会済み）が出ない)
--     - sendMessageAction の isCounterpartWithdrawn も deleted_at を取れず
--       非ブロック扱いになり、退会済みユーザーへ送信できてしまう
--
-- 対策 (このマイグレーション):
--   (a) users ポリシー v2:
--       - 閲覧者条件を「当事者 OR スレッド組織の同組織メンバー (is_same_org)」に拡張
--       - 対象ユーザー条件を「スレッド当事者 OR スレッドに載っている組織の Owner」に
--         拡張 (スタッフが作ったスレッドで組織が解散した場合、Owner は participant
--         ではないため、受注者側から Owner の表示名が引けなかった同族の穴を塞ぐ)
--   (b) organizations ポリシー v2:
--       - スレッドとの一致を organization_id に加え organization_1_id /
--         organization_2_id (Phase 2 identity pair) でも判定
--       - 閲覧者条件を users と同じく同組織メンバーまで拡張 (対称化)
--
--   message_threads_select 自体が「当事者 OR 同組織メンバー」なので、
--   本ポリシーの閲覧範囲は「そもそもスレッドが見える人」と完全に一致する。
--   退会者の実名を残して「実名（退会済み）」表示する方針 (d777b00) とも整合。
-- ============================================================

DROP POLICY IF EXISTS "users_select_thread_participant_deleted" ON public.users;

CREATE POLICY "users_select_thread_participant_deleted" ON public.users
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.message_threads mt
      WHERE
        -- 対象 (退会済みユーザー) がスレッドの当事者、
        -- またはスレッドに載っている組織の Owner
        (
          mt.participant_1_id = public.users.id
          OR mt.participant_2_id = public.users.id
          OR EXISTS (
            SELECT 1
            FROM public.organizations o
            WHERE o.owner_id = public.users.id
              AND (
                o.id = mt.organization_id
                OR o.id = mt.organization_1_id
                OR o.id = mt.organization_2_id
              )
          )
        )
        -- 閲覧者がそのスレッドの当事者、または同組織メンバー
        AND (
          mt.participant_1_id = auth.uid()
          OR mt.participant_2_id = auth.uid()
          OR (mt.organization_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_id))
          OR (mt.organization_1_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_1_id))
          OR (mt.organization_2_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_2_id))
        )
    )
  );

DROP POLICY IF EXISTS "organizations_select_thread_participant_deleted" ON public.organizations;

CREATE POLICY "organizations_select_thread_participant_deleted" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.message_threads mt
      WHERE
        (
          mt.organization_id = public.organizations.id
          OR mt.organization_1_id = public.organizations.id
          OR mt.organization_2_id = public.organizations.id
        )
        AND (
          mt.participant_1_id = auth.uid()
          OR mt.participant_2_id = auth.uid()
          OR (mt.organization_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_id))
          OR (mt.organization_1_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_1_id))
          OR (mt.organization_2_id IS NOT NULL
              AND public.is_same_org(auth.uid(), mt.organization_2_id))
        )
    )
  );
