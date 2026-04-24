-- ============================================================
-- Task 2.5: avatars バケットの組織アバター書き込み RLS
-- ============================================================
-- CLI-021（発注者情報編集）で組織 Owner/Admin が所属組織 Owner の
-- avatars フォルダへ画像をアップロードできるようにする。
-- Storage パスは `{owner_user_id}/client-profile.{ext}` 想定。
-- ポリシー評価内で organization_members / organizations を直接
-- サブクエリすると RLS 再帰を誘発するため、SECURITY DEFINER 関数
-- is_org_admin_or_owner_of() を先に導入してカプセル化する。
-- （既存 20260402100000_fix_org_members_rls_recursion.sql の教訓）

-- ------------------------------------------------------------
-- SECURITY DEFINER helper: is_org_admin_or_owner_of
-- 引数:
--   uid                   — 操作者 (auth.uid())
--   target_owner_user_id  — avatars フォルダのオーナーとして見立てる
--                            組織 Owner の user_id（= フォルダ名の UUID）
-- true を返す条件:
--   (a) uid 自身が target_owner_user_id と一致する場合
--       → 組織 Owner 本人が自分のフォルダに書くケース
--   (b) uid が target_owner_user_id の所有する組織に owner/admin
--       として所属している場合
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_org_admin_or_owner_of(
  uid uuid,
  target_owner_user_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uid IS NOT NULL
    AND target_owner_user_id IS NOT NULL
    AND (
      uid = target_owner_user_id
      OR EXISTS (
        SELECT 1
          FROM public.organizations o
          JOIN public.organization_members om
            ON om.organization_id = o.id
         WHERE o.owner_id = target_owner_user_id
           AND o.deleted_at IS NULL
           AND om.user_id = uid
           AND om.org_role IN ('owner', 'admin')
      )
    );
$$;

REVOKE ALL ON FUNCTION is_org_admin_or_owner_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_org_admin_or_owner_of(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- avatars バケット: 組織 Owner/Admin 用の INSERT/UPDATE/DELETE ポリシー
-- 既存の avatars_owner_* ポリシー（自己フォルダ書き込み）と
-- PERMISSIVE OR 結合される。どちらか一方が真なら許可される。
-- ------------------------------------------------------------

CREATE POLICY "avatars_client_profile_write_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND is_org_admin_or_owner_of(
          auth.uid(),
          ((storage.foldername(name))[1])::uuid
        )
  );

CREATE POLICY "avatars_client_profile_write_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND is_org_admin_or_owner_of(
          auth.uid(),
          ((storage.foldername(name))[1])::uuid
        )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND is_org_admin_or_owner_of(
          auth.uid(),
          ((storage.foldername(name))[1])::uuid
        )
  );

CREATE POLICY "avatars_client_profile_write_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND is_org_admin_or_owner_of(
          auth.uid(),
          ((storage.foldername(name))[1])::uuid
        )
  );
