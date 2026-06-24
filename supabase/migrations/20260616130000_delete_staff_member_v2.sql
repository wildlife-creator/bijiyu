-- ============================================================
-- proxy-account-multi-org-support Phase 4 / Task 4.1
--
-- delete_staff_member v2
--
-- 変更点（v1 比）:
--   1. トランザクション冒頭で SELECT id FROM users WHERE id = p_target_user_id
--      FOR UPDATE を実行し、対象ユーザー行に悲観ロックを取る。同一ユーザー
--      への並行削除トランザクション (例: 2 法人が同時に同じ代理スタッフを
--      削除) を直列化し、READ COMMITTED 分離レベル下での残存判定の
--      race condition を防止する。
--   2. organization_members 行削除後に、対象 user_id の残存メンバーシップ
--      件数を SELECT count(*) で同一トランザクション内に判定。
--   3. 残存 0 件のときのみ users.deleted_at = now() をセット (条件付き
--      ソフト削除)。残存 1 件以上なら deleted_at は変更しない (他組織で
--      代理として継続)。
--
-- 旧挙動の「削除直後に無条件 deleted_at セット」は撤廃。
-- scout_templates の Owner 移譲は変更なし。
--
-- 既存 GRANT/REVOKE は CREATE OR REPLACE FUNCTION で保持される。
-- ============================================================

CREATE OR REPLACE FUNCTION delete_staff_member(
  p_target_user_id    uuid,
  p_organization_id   uuid,
  p_owner_user_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_locked uuid;
  v_remaining_count integer;
BEGIN
  -- 0. 対象ユーザー行に悲観ロックを取る (並行削除の直列化)
  --    v_target_locked が NULL の場合 (auth.users 上にしか存在しない / 完全
  --    に未存在) でも以降の UPDATE / DELETE は WHERE 句がマッチせず NO-OP
  --    となるため、冪等性は維持される。
  SELECT id INTO v_target_locked
    FROM public.users
   WHERE id = p_target_user_id
   FOR UPDATE;

  -- 1. scout_templates の owner を Owner に移譲 (v1 から変更なし)
  UPDATE scout_templates
     SET owner_id = p_owner_user_id
   WHERE owner_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 2. organization_members を物理削除 (v1 から変更なし)
  DELETE FROM organization_members
   WHERE user_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 3. 残存メンバーシップ判定 (同一トランザクション内の SELECT)
  SELECT count(*)::int INTO v_remaining_count
    FROM organization_members
   WHERE user_id = p_target_user_id;

  -- 4. 残存 0 件のときのみ users.deleted_at をセット
  IF v_remaining_count = 0 THEN
    UPDATE public.users
       SET deleted_at = now()
     WHERE id = p_target_user_id
       AND deleted_at IS NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION delete_staff_member(uuid, uuid, uuid) IS
  'v2 (proxy-account-multi-org-support Phase 4): 対象ユーザーに FOR UPDATE で悲観ロックを取り、削除後の残存メンバーシップが 0 件のときのみ users.deleted_at をセットする (条件付きソフト削除)。N 組織兼任の代理スタッフが 1 法人から削除されても、他法人で在籍中なら deleted_at は NULL のまま維持される。';
