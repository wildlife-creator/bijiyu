-- ============================================================
-- Task 2.8: ensure_organization_exists 本体書き換え
-- ============================================================
-- Task 2.1 で organizations.name の NOT NULL 制約を解除したため、
-- INSERT 文から name を省ける。シグネチャ（ensure_organization_exists(uuid)）は
-- 変更しないため、既存の呼び出し側（plan-actions.ts / handle_checkout_completed /
-- handle_checkout_completed_plan）は無変更で継続動作する。
--
-- 変更点:
--   INSERT INTO organizations (owner_id, name) VALUES (uid, '')
-- →INSERT INTO organizations (owner_id)        VALUES (uid)

CREATE OR REPLACE FUNCTION ensure_organization_exists(uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_created boolean := false;
BEGIN
  SELECT id INTO v_org_id
  FROM organizations
  WHERE owner_id = uid AND deleted_at IS NULL
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (owner_id)
    VALUES (uid)
    RETURNING id INTO v_org_id;

    INSERT INTO organization_members (organization_id, user_id, org_role)
    VALUES (v_org_id, uid, 'owner');

    v_created := true;
  ELSE
    -- 既存組織の場合、owner レコードがなければ追加
    INSERT INTO organization_members (organization_id, user_id, org_role)
    VALUES (v_org_id, uid, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'created', v_created
  );
END;
$$;

-- 既存の GRANT/REVOKE は維持（20260413100000_billing_rpc_revoke_explicit.sql 準拠）。
-- CREATE OR REPLACE なので関数権限は保持される。
