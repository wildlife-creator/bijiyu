-- ============================================================
-- 2026-09-02: 管理運営アカウント（P5 / docs/requirements/spec-changes-202608.md §2.4、
--             docs/requirements/p5-ops-account-implementation-notes.md）
--
-- 1. users.is_hidden（一覧・検索・導線からの非表示フラグ）を追加
--    - 管理運営アカウント（運営が使う最上位プラン相当の一般会員）を、職人一覧・発注者一覧・
--      マイリスト等の「他の会員が人を探す画面」から除外するためのフラグ
--    - RLS（users_select_public）は変更しない。メッセージ相手・応募者・案件の発注者名として
--      正当に見える必要があるため、除外は各画面のクエリ側で行う
-- 2. messages の SELECT / INSERT ポリシーを identity ペア対応に更新
--    - message_threads は 2026-07-07 に organization_1_id / organization_2_id ベースへ移行済みだが、
--      messages のポリシーは旧 organization_id（片側の代表組織）だけを見ていた
--    - 組織⇔組織のスレッド（運営の組織 ⇔ 法人発注者の組織）では、organization_id に入らなかった
--      側の組織メンバー（担当者）がスレッド一覧には出るのに本文を読めず返信もできない
--    - 条件を message_threads_select と同じ式に広げる（旧条件を包含するため既存挙動は不変）
-- ============================================================

-- ------------------------------------------------------------
-- 1. users.is_hidden
-- ------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_hidden IS
  '管理運営アカウント等を職人一覧・発注者一覧・検索・マイリスト・スカウト対象から除外するフラグ。RLS では絞らず各画面のクエリで .eq(is_hidden, false) する。管理画面（ADM-009）で設定';

CREATE INDEX users_is_hidden_idx ON users (id) WHERE is_hidden = true;

-- ------------------------------------------------------------
-- 2. messages RLS を identity ペア対応に
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;

CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = messages.thread_id
      AND (
        t.participant_1_id = auth.uid()
        OR t.participant_2_id = auth.uid()
        OR (t.organization_1_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_1_id))
        OR (t.organization_2_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_2_id))
        OR (t.organization_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_id))
      )
    )
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = messages.thread_id
      AND (
        t.participant_1_id = auth.uid()
        OR t.participant_2_id = auth.uid()
        OR (t.organization_1_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_1_id))
        OR (t.organization_2_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_2_id))
        OR (t.organization_id IS NOT NULL AND is_same_org(auth.uid(), t.organization_id))
      )
    )
  );
