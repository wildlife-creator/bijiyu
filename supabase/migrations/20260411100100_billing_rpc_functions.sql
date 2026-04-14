-- ============================================================
-- billing: Webhook 処理用 PL/pgSQL RPC 関数
-- ============================================================
--
-- 6 本の SECURITY DEFINER 関数を作成する。
-- いずれも service_role からのみ呼び出し可能で、anon / authenticated には
-- REVOKE EXECUTE で呼び出しを禁止する。
--
-- 関数:
--   1. handle_checkout_completed_plan(event_data jsonb)
--   2. handle_subscription_lifecycle_updated(event_data jsonb)
--   3. handle_subscription_lifecycle_deleted(event_data jsonb)
--   4. get_or_lock_stripe_customer(uid uuid)
--   5. set_stripe_customer_id(uid uuid, customer_id text)
--   6. ensure_organization_exists(uid uuid)

-- ------------------------------------------------------------
-- 6. ensure_organization_exists
--    既存組織を再利用、なければ新規作成する。1 ユーザー = 1 組織。
-- ------------------------------------------------------------

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
    INSERT INTO organizations (owner_id, name)
    VALUES (uid, '')
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

REVOKE EXECUTE ON FUNCTION ensure_organization_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_organization_exists(uuid) TO service_role;

-- ------------------------------------------------------------
-- 1. handle_checkout_completed_plan
--    基本プラン購入の checkout.session.completed 処理を 1 トランザクションで実行
-- ------------------------------------------------------------
--
-- event_data の想定形:
-- {
--   "user_id": "uuid",
--   "plan_type": "individual" | "small" | "corporate" | "corporate_premium",
--   "stripe_subscription_id": "sub_xxx",
--   "stripe_customer_id": "cus_xxx",
--   "current_period_start": "ISO8601",
--   "current_period_end": "ISO8601"
-- }

CREATE OR REPLACE FUNCTION handle_checkout_completed_plan(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plan_type text;
  v_stripe_sub_id text;
  v_stripe_cus_id text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_user_role user_role;
  v_existing_sub_id uuid;
  v_existing_active_count integer;
  v_subscription_id uuid;
  v_full_name text;
  v_org_id uuid;
BEGIN
  v_user_id := (event_data->>'user_id')::uuid;
  v_plan_type := event_data->>'plan_type';
  v_stripe_sub_id := event_data->>'stripe_subscription_id';
  v_stripe_cus_id := event_data->>'stripe_customer_id';
  v_period_start := (event_data->>'current_period_start')::timestamptz;
  v_period_end := (event_data->>'current_period_end')::timestamptz;

  IF v_user_id IS NULL OR v_plan_type IS NULL OR v_stripe_sub_id IS NULL THEN
    RAISE EXCEPTION 'invalid event_data: user_id, plan_type, stripe_subscription_id are required';
  END IF;

  IF v_plan_type NOT IN ('individual', 'small', 'corporate', 'corporate_premium') THEN
    RAISE EXCEPTION 'invalid plan_type: %', v_plan_type;
  END IF;

  -- 1. subscriptions の UPSERT 手順（二重課金最終防御）
  SELECT id INTO v_existing_sub_id
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_existing_sub_id IS NOT NULL THEN
    -- 同一 Stripe Subscription の重複イベント → UPDATE
    UPDATE subscriptions
    SET plan_type = v_plan_type,
        status = 'active',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        cancel_at_period_end = false,
        schedule_id = NULL,
        scheduled_plan_type = NULL,
        scheduled_at = NULL,
        past_due_since = NULL
    WHERE id = v_existing_sub_id
    RETURNING id INTO v_subscription_id;
  ELSE
    -- 同一 user_id で active/past_due があれば二重課金として中断
    SELECT COUNT(*) INTO v_existing_active_count
    FROM subscriptions
    WHERE user_id = v_user_id
      AND status IN ('active', 'past_due');

    IF v_existing_active_count > 0 THEN
      RAISE EXCEPTION 'duplicate active subscription detected for user_id=%', v_user_id;
    END IF;

    INSERT INTO subscriptions (
      user_id, stripe_subscription_id, plan_type, status,
      current_period_start, current_period_end
    )
    VALUES (
      v_user_id, v_stripe_sub_id, v_plan_type, 'active',
      v_period_start, v_period_end
    )
    RETURNING id INTO v_subscription_id;
  END IF;

  -- 2. users.stripe_customer_id を保存（未設定の場合）
  IF v_stripe_cus_id IS NOT NULL THEN
    UPDATE users
    SET stripe_customer_id = v_stripe_cus_id
    WHERE id = v_user_id AND stripe_customer_id IS NULL;
  END IF;

  -- 3. users.role が contractor の場合のみ client に更新
  SELECT role INTO v_user_role FROM users WHERE id = v_user_id;
  IF v_user_role = 'contractor' THEN
    UPDATE users SET role = 'client' WHERE id = v_user_id;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      NULL,
      'role_changed',
      'user',
      v_user_id,
      jsonb_build_object('from', 'contractor', 'to', 'client')
    );
  END IF;

  -- 4. client_profiles を UPSERT（既存があれば display_name 維持）
  SELECT COALESCE(NULLIF(last_name, '') || COALESCE(first_name, ''), '') INTO v_full_name
  FROM users WHERE id = v_user_id;

  INSERT INTO client_profiles (user_id, display_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (user_id) DO NOTHING;

  -- 5. 法人プランの場合: ensure_organization_exists
  IF v_plan_type IN ('corporate', 'corporate_premium') THEN
    PERFORM ensure_organization_exists(v_user_id);
  END IF;

  -- 6. audit_logs に subscription_created を記録
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    'subscription_created',
    'subscription',
    v_subscription_id,
    jsonb_build_object(
      'plan_type', v_plan_type,
      'stripe_subscription_id', v_stripe_sub_id,
      'user_id', v_user_id
    )
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'plan_type', v_plan_type
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_checkout_completed_plan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION handle_checkout_completed_plan(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 2. handle_subscription_lifecycle_updated
--    customer.subscription.updated の基本プラン契約更新処理
-- ------------------------------------------------------------
--
-- event_data の想定形:
-- {
--   "stripe_subscription_id": "sub_xxx",
--   "plan_type": "individual",
--   "status": "active" | "past_due" | "cancelled",
--   "current_period_start": "ISO8601",
--   "current_period_end": "ISO8601",
--   "schedule_id": "sub_sched_xxx" or null,
--   "scheduled_plan_type": "individual" or null,
--   "scheduled_at": "ISO8601" or null,
--   "cancel_at_period_end": true | false
-- }

CREATE OR REPLACE FUNCTION handle_subscription_lifecycle_updated(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id text;
  v_plan_type text;
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_schedule_id text;
  v_scheduled_plan_type text;
  v_scheduled_at timestamptz;
  v_cancel_at_period_end boolean;
  v_subscription_id uuid;
  v_user_id uuid;
BEGIN
  v_stripe_sub_id := event_data->>'stripe_subscription_id';
  v_plan_type := event_data->>'plan_type';
  v_status := event_data->>'status';
  v_period_start := NULLIF(event_data->>'current_period_start', '')::timestamptz;
  v_period_end := NULLIF(event_data->>'current_period_end', '')::timestamptz;
  v_schedule_id := event_data->>'schedule_id';
  v_scheduled_plan_type := event_data->>'scheduled_plan_type';
  v_scheduled_at := NULLIF(event_data->>'scheduled_at', '')::timestamptz;
  v_cancel_at_period_end := COALESCE((event_data->>'cancel_at_period_end')::boolean, false);

  IF v_stripe_sub_id IS NULL THEN
    RAISE EXCEPTION 'invalid event_data: stripe_subscription_id is required';
  END IF;

  IF v_plan_type IS NOT NULL
     AND v_plan_type NOT IN ('individual', 'small', 'corporate', 'corporate_premium') THEN
    RAISE EXCEPTION 'invalid plan_type: %', v_plan_type;
  END IF;

  UPDATE subscriptions
  SET plan_type = COALESCE(v_plan_type, plan_type),
      status = COALESCE(v_status::subscription_status, status),
      current_period_start = COALESCE(v_period_start, current_period_start),
      current_period_end = COALESCE(v_period_end, current_period_end),
      schedule_id = v_schedule_id,
      scheduled_plan_type = v_scheduled_plan_type,
      scheduled_at = v_scheduled_at,
      cancel_at_period_end = v_cancel_at_period_end
  WHERE stripe_subscription_id = v_stripe_sub_id
  RETURNING id, user_id INTO v_subscription_id, v_user_id;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found for stripe_subscription_id=%', v_stripe_sub_id;
  END IF;

  -- 法人プランへの変更時は組織を確保
  IF v_plan_type IN ('corporate', 'corporate_premium') THEN
    PERFORM ensure_organization_exists(v_user_id);
  END IF;

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    'subscription_updated',
    'subscription',
    v_subscription_id,
    event_data
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_subscription_lifecycle_updated(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION handle_subscription_lifecycle_updated(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 3. handle_subscription_lifecycle_deleted
--    customer.subscription.deleted の基本プラン契約解約処理
-- ------------------------------------------------------------
--
-- event_data の想定形:
-- {
--   "stripe_subscription_id": "sub_xxx"
-- }

CREATE OR REPLACE FUNCTION handle_subscription_lifecycle_deleted(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id text;
  v_subscription_id uuid;
  v_user_id uuid;
  v_was_corporate boolean;
  v_org_id uuid;
BEGIN
  v_stripe_sub_id := event_data->>'stripe_subscription_id';

  IF v_stripe_sub_id IS NULL THEN
    RAISE EXCEPTION 'invalid event_data: stripe_subscription_id is required';
  END IF;

  -- subscription を取得
  SELECT id, user_id, plan_type IN ('corporate', 'corporate_premium')
    INTO v_subscription_id, v_user_id, v_was_corporate
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found for stripe_subscription_id=%', v_stripe_sub_id;
  END IF;

  -- 1. subscriptions.status='cancelled'
  UPDATE subscriptions
  SET status = 'cancelled',
      cancel_at_period_end = false,
      schedule_id = NULL,
      scheduled_plan_type = NULL,
      scheduled_at = NULL
  WHERE id = v_subscription_id;

  -- 2. users.role を contractor にダウングレード（client のみ。staff は変更しない）
  UPDATE users
  SET role = 'contractor'
  WHERE id = v_user_id AND role = 'client';

  -- 3. 法人プラン owner だった場合、配下 staff の is_active=false
  IF v_was_corporate THEN
    SELECT id INTO v_org_id
    FROM organizations
    WHERE owner_id = v_user_id AND deleted_at IS NULL
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      UPDATE users
      SET is_active = false
      WHERE id IN (
        SELECT user_id FROM organization_members
        WHERE organization_id = v_org_id
          AND org_role = 'staff'
      );
    END IF;
  END IF;

  -- 4. 掲載中案件を closed に変更
  UPDATE jobs
  SET status = 'closed'
  WHERE owner_id = v_user_id AND status = 'open';

  -- 5. audit_logs に記録
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    'subscription_cancelled',
    'subscription',
    v_subscription_id,
    jsonb_build_object('stripe_subscription_id', v_stripe_sub_id)
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_subscription_lifecycle_deleted(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION handle_subscription_lifecycle_deleted(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 4. get_or_lock_stripe_customer
--    users.stripe_customer_id を SELECT FOR UPDATE で取得する
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_or_lock_stripe_customer(uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
  v_email text;
BEGIN
  SELECT stripe_customer_id, email
    INTO v_customer_id, v_email
  FROM users
  WHERE id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', uid;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'stripe_customer_id', v_customer_id,
      'email', v_email,
      'locked', false
    );
  END IF;

  RETURN jsonb_build_object(
    'stripe_customer_id', NULL,
    'email', v_email,
    'locked', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_or_lock_stripe_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_lock_stripe_customer(uuid) TO service_role;

-- ------------------------------------------------------------
-- 5. set_stripe_customer_id
--    WHERE stripe_customer_id IS NULL 付き UPDATE による先勝ち制御
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_stripe_customer_id(uid uuid, customer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id text;
  v_existing_id text;
BEGIN
  UPDATE users
  SET stripe_customer_id = customer_id
  WHERE id = uid AND stripe_customer_id IS NULL
  RETURNING stripe_customer_id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'stripe_customer_id', v_updated_id,
      'conflicted', false
    );
  END IF;

  -- 0 行 = 既存値あり（並行リクエストが先に保存済み）
  SELECT stripe_customer_id INTO v_existing_id
  FROM users WHERE id = uid;

  RETURN jsonb_build_object(
    'stripe_customer_id', v_existing_id,
    'conflicted', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION set_stripe_customer_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_stripe_customer_id(uuid, text) TO service_role;
