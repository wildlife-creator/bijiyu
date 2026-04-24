-- ============================================================
-- Task 2.6: 担当者管理の SECURITY DEFINER 関数
-- ============================================================
--   insert_staff_member_with_limit : CLI-025 経由の担当者追加。
--                                    上限チェック + 代理一意性 +
--                                    organization_members INSERT を
--                                    FOR UPDATE ロック付き atomic 実行
--   delete_staff_member            : CLI-023 経由の担当者削除。
--                                    scout_templates 移譲 +
--                                    organization_members 物理削除 +
--                                    users ソフト削除を atomic 実行
--
-- D 採用により氏名・ロールは handle_new_user トリガーが
-- auth.users.raw_user_meta_data から INSERT 時に直接設定する。
-- 本 RPC は既存 public.users の role / last_name / first_name を
-- 一切 UPDATE しない（R3 の破壊的 UPDATE を構造的に回避）。

-- ------------------------------------------------------------
-- insert_staff_member_with_limit
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_staff_member_with_limit(
  p_user_id            uuid,
  p_organization_id    uuid,
  p_org_role           text,
  p_is_proxy_account   boolean,
  p_max_staff          integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_non_owner_count integer;
  v_user_exists boolean;
  v_existing_proxy_exists boolean;
BEGIN
  -- 引数バリデーション: org_role は admin / staff のみ受理
  IF p_org_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'INVALID_ORG_ROLE: org_role must be admin or staff, got %', p_org_role
      USING ERRCODE = 'P0001';
  END IF;

  -- 組織行を排他ロックして並行招待を直列化
  SELECT id INTO v_org_id
    FROM organizations
   WHERE id = p_organization_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: organization_id=%', p_organization_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 上限チェック（owner を除いた admin + staff の合計人数）
  SELECT count(*)
    INTO v_non_owner_count
    FROM organization_members
   WHERE organization_id = v_org_id
     AND org_role IN ('admin', 'staff');

  IF v_non_owner_count >= p_max_staff THEN
    RAISE EXCEPTION 'STAFF_LIMIT_EXCEEDED: current=%, max=%', v_non_owner_count, p_max_staff
      USING ERRCODE = 'P0001';
  END IF;

  -- R4: 代理アカウント一意性（true 指定時のみ）
  IF p_is_proxy_account THEN
    SELECT EXISTS (
      SELECT 1
        FROM organization_members
       WHERE organization_id = v_org_id
         AND is_proxy_account = true
    ) INTO v_existing_proxy_exists;

    IF v_existing_proxy_exists THEN
      RAISE EXCEPTION 'PROXY_ACCOUNT_ALREADY_EXISTS: organization_id=%', v_org_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- handle_new_user トリガーによる public.users の行が存在することを確認
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id)
    INTO v_user_exists;

  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: user_id=%', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- organization_members に挿入（既存 users 行は触らない）
  INSERT INTO organization_members (
    organization_id,
    user_id,
    org_role,
    is_proxy_account
  ) VALUES (
    v_org_id,
    p_user_id,
    p_org_role::org_role,
    p_is_proxy_account
  );
END;
$$;

REVOKE ALL ON FUNCTION insert_staff_member_with_limit(uuid, uuid, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_staff_member_with_limit(uuid, uuid, text, boolean, integer) TO service_role;

-- ------------------------------------------------------------
-- delete_staff_member
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_staff_member(
  p_target_user_id    uuid,
  p_organization_id   uuid,
  p_owner_user_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. scout_templates の owner を Owner に移譲
  UPDATE scout_templates
     SET owner_id = p_owner_user_id
   WHERE owner_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 2. organization_members を物理削除
  DELETE FROM organization_members
   WHERE user_id = p_target_user_id
     AND organization_id = p_organization_id;

  -- 3. users をソフト削除（ログイン不可化）
  UPDATE public.users
     SET deleted_at = now()
   WHERE id = p_target_user_id
     AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION delete_staff_member(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_staff_member(uuid, uuid, uuid) TO service_role;
