-- ============================================================
-- organization-scoping-consistency Task 2.5 / 2.6
-- ensure_organization_exists に「昇格時の組織ID自動付与」を追加（Req 11）
-- ------------------------------------------------------------
-- 個人→法人昇格で組織が確定したら、その発注者の既存データ（組織ID未設定）に
-- 当該組織IDを付与する。これにより昇格前のデータも会社単位の表示・共有から漏れず、
-- かつ将来どの昇格でも自動で正しくなる（後から手当て不要）。
--
--   * 冪等: organization_id IS NULL（未設定）の行のみ対象。再呼び出し・再昇格でも安全。
--   * 不可逆操作なし: UPDATE のみ（削除・統合はしない）。
--   * 対象は jobs / scout_templates / job_inquiries / client_reviews の【4対象】。
--   * message_threads は【対象外】（2026-06-04 決定）:
--       個人スレッドは participant_1/participant_2 の位置が役割（発注者/受注者）を
--       表さず（双方が messages/new からスレッドを開始できる）、「発注者側スレッドだけ」
--       を安全に選別できないため。昇格後に作成される新規スレッドは作成時点で
--       organization_id が付与され会社共有されるため、実運用上の欠落は生じない。
--   * 個人発注者はこの関数が呼ばれない（組織が作られない）ため NULL 維持＝誤紐付け防止。
--
-- シグネチャ・既存の組織作成ロジック・GRANT/REVOKE は不変（CREATE OR REPLACE で権限保持）。
-- SECURITY DEFINER + SET search_path = public を維持（CLAUDE.md ルール）。
-- ============================================================

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

  -- ----------------------------------------------------------
  -- 昇格時の組織ID自動付与（Req 11）。新規作成・既存組織の両パスで実行する
  -- （= IF/ELSE の後）。冪等なので再昇格・再呼び出しでも安全。
  -- ----------------------------------------------------------

  -- jobs: 作成者 = uid の組織ID空案件に付与
  UPDATE jobs
  SET organization_id = v_org_id
  WHERE owner_id = uid AND organization_id IS NULL;

  -- scout_templates: 作成者 = uid の組織ID空テンプレに付与
  UPDATE scout_templates
  SET organization_id = v_org_id
  WHERE owner_id = uid AND organization_id IS NULL;

  -- job_inquiries: 宛先発注者 = uid の組織ID空問い合わせに付与
  -- （列は target_client_id / target_organization_id。target_user_id という列は存在しない）
  UPDATE job_inquiries
  SET target_organization_id = v_org_id
  WHERE target_client_id = uid AND target_organization_id IS NULL;

  -- client_reviews: 上の jobs 付与の【後】に実行する。
  -- 「評価 → 応募 → 案件」を辿り、当該組織に紐付いた案件（jobs.organization_id = v_org_id）
  -- への評価で組織ID空のものに付与する（個人発注者の案件ぶんは NULL のまま）。
  UPDATE client_reviews cr
  SET organization_id = v_org_id
  FROM applications a
  JOIN jobs j ON j.id = a.job_id
  WHERE a.id = cr.application_id
    AND j.organization_id = v_org_id
    AND cr.organization_id IS NULL;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'created', v_created
  );
END;
$$;

-- 既存の GRANT/REVOKE は維持（20260413100000_billing_rpc_revoke_explicit.sql 準拠）。
-- CREATE OR REPLACE なので関数権限は保持される。
