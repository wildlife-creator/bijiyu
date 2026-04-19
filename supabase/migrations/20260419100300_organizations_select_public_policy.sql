-- ============================================================
-- Task 2.4: organizations SELECT RLS ポリシー刷新
-- ============================================================
-- 発注者表示名は client_profiles.display_name に一本化し、
-- organizations テーブルは担当者管理や権限判定にしか使われなくなる。
-- そのため「所属組織メンバーのみ閲覧可」という旧 organizations_select
-- の閉じ方は過剰（messaging spec が organizations_select_thread_participant
-- を別途追加したのが証拠）。生存中の組織は認証済み全員に公開する方式に
-- 切り替える。
--
-- - organizations_select                     : 旧（is_same_org ベース）を DROP
-- - organizations_select_thread_participant : 旧（messaging spec で追加）を DROP
-- - organizations_select_public             : 生存中の組織を全認証済みユーザーに公開
-- - organizations_select_admin               : 維持（admin はソフト削除済みも閲覧可）

DROP POLICY IF EXISTS "organizations_select" ON organizations;
DROP POLICY IF EXISTS "organizations_select_thread_participant" ON organizations;

CREATE POLICY "organizations_select_public" ON organizations
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- organizations_select_admin は既存のまま維持
