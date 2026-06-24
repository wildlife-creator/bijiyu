-- ============================================================
-- delete_staff_member v3
-- (email-recycle-on-delete spec / Task 4)
--
-- 変更点（v2 比）:
--   1. 戻り値型を void → jsonb に変更。
--      `jsonb_build_object('user_id', p_target_user_id, 'globally_deleted', v_globally_deleted)`
--      を返す。
--   2. `v_globally_deleted` は「本 RPC 呼び出しで users.deleted_at を
--      NULL → now() に遷移させた場合のみ true」。残存メンバーシップが
--      1 件以上 / 既に deleted_at セット済み / 行未存在のいずれでも false。
--   3. 戻り値型変更のため CREATE OR REPLACE FUNCTION は使えず、
--      DROP FUNCTION + CREATE FUNCTION の順で再作成する。
--   4. DROP に伴い GRANT/REVOKE が消えるため migration 内で再付与する
--      (REVOKE FROM PUBLIC + GRANT TO service_role + REVOKE FROM anon,
--       authenticated)。
--
-- v2 の挙動（FOR UPDATE / 残存判定 / 条件付き deleted_at セット /
--          scout_templates Owner 移譲）は完全維持。
--
-- 呼び出し元 (`/mypage/members/actions.ts` の `deleteMemberAction`) は
-- 戻り値の globally_deleted=true を見て applyDeletedSuffix を呼ぶ
-- 新パスを追加する (Task 7)。
-- ============================================================

DROP FUNCTION IF EXISTS delete_staff_member(uuid, uuid, uuid);

CREATE FUNCTION delete_staff_member(
  p_target_user_id    uuid,
  p_organization_id   uuid,
  p_owner_user_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_locked uuid;
  v_remaining_count integer;
  v_globally_deleted boolean := false;
BEGIN
  -- 0. 対象ユーザー行に悲観ロックを取る (並行削除の直列化)
  SELECT id INTO v_target_locked
    FROM public.users
   WHERE id = p_target_user_id
   FOR UPDATE;

  -- 1. scout_templates の owner を Owner に移譲
  UPDATE scout_templates
     SET owner_id = p_owner_user_id
   WHERE owner_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 2. organization_members を物理削除
  DELETE FROM organization_members
   WHERE user_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 3. 残存メンバーシップ判定
  SELECT count(*)::int INTO v_remaining_count
    FROM organization_members
   WHERE user_id = p_target_user_id;

  -- 4. 残存 0 件のときのみ users.deleted_at をセット
  --    UPDATE が実際に行を更新した場合のみ FOUND=true、つまり
  --    deleted_at が NULL → now() に遷移した場合のみ globally_deleted=true。
  IF v_remaining_count = 0 THEN
    UPDATE public.users
       SET deleted_at = now()
     WHERE id = p_target_user_id
       AND deleted_at IS NULL;

    IF FOUND THEN
      v_globally_deleted := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'globally_deleted', v_globally_deleted
  );
END;
$$;

-- DROP 時に消えた GRANT/REVOKE を再付与
-- (20260419100500_staff_management_rpc_functions.sql /
--  20260420100100_organization_rpc_revoke_explicit.sql と整合)
REVOKE ALL ON FUNCTION delete_staff_member(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_staff_member(uuid, uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.delete_staff_member(uuid, uuid, uuid)
  FROM anon, authenticated;

COMMENT ON FUNCTION delete_staff_member(uuid, uuid, uuid) IS
  'v3 (email-recycle-on-delete): 戻り値型を void → jsonb に変更し、本 RPC で users.deleted_at が NULL → now() に遷移した場合のみ globally_deleted=true を返す。呼び出し元はこれを見て applyDeletedSuffix を発火する。v2 の FOR UPDATE / 残存判定 / 条件付き deleted_at セットの挙動は完全維持。';
