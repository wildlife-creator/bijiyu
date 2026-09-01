-- ============================================================
-- 2026-09-01: Stripe 年払い（P3 / docs/requirements/spec-changes-202608.md §2.1(2)(3)）
--
-- 「追加のみ」のマイグレーション。
-- 1. subscriptions.scheduled_billing_cycle — 期末切替予約（ダウングレード / 年→月）の
--    切替先サイクル。scheduled_plan_type と対で使う
-- 2. handle_checkout_completed_plan v2 — event_data.billing_cycle を受け取り保存
-- 3. handle_subscription_lifecycle_updated v2 — event_data.billing_cycle /
--    scheduled_billing_cycle を受け取り保存（Webhook が Price ID から解決して渡す）
-- いずれも省略時は従来どおり（monthly / NULL）に振る舞い、既存の呼び出しと互換。
-- ============================================================

ALTER TABLE subscriptions
  ADD COLUMN scheduled_billing_cycle billing_cycle_type;

COMMENT ON COLUMN subscriptions.scheduled_billing_cycle IS
  '期末切替予約の切替先サイクル（scheduled_plan_type と対）。予約なしは NULL';

-- ------------------------------------------------------------
-- handle_checkout_completed_plan v2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_checkout_completed_plan(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plan_type text;
  v_billing_cycle text;
  v_stripe_sub_id text;
  v_stripe_cus_id text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_user_role user_role;
  v_existing_sub_id uuid;
  v_existing_active_count integer;
  v_subscription_id uuid;
  v_full_name text;
BEGIN
  v_user_id := (event_data->>'user_id')::uuid;
  v_plan_type := event_data->>'plan_type';
  v_billing_cycle := COALESCE(NULLIF(event_data->>'billing_cycle', ''), 'monthly');
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

  IF v_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid billing_cycle: %', v_billing_cycle;
  END IF;

  -- 1. subscriptions の UPSERT 手順（二重課金最終防御）
  SELECT id INTO v_existing_sub_id
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_existing_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET plan_type = v_plan_type,
        billing_cycle = v_billing_cycle::billing_cycle_type,
        status = 'active',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        cancel_at_period_end = false,
        schedule_id = NULL,
        scheduled_plan_type = NULL,
        scheduled_billing_cycle = NULL,
        scheduled_at = NULL,
        past_due_since = NULL
    WHERE id = v_existing_sub_id
    RETURNING id INTO v_subscription_id;
  ELSE
    SELECT COUNT(*) INTO v_existing_active_count
    FROM subscriptions
    WHERE user_id = v_user_id
      AND status IN ('active', 'past_due');

    IF v_existing_active_count > 0 THEN
      RAISE EXCEPTION 'duplicate active subscription detected for user_id=%', v_user_id;
    END IF;

    INSERT INTO subscriptions (
      user_id, stripe_subscription_id, plan_type, billing_cycle, status,
      payment_method, current_period_start, current_period_end
    )
    VALUES (
      v_user_id, v_stripe_sub_id, v_plan_type, v_billing_cycle::billing_cycle_type, 'active',
      'stripe', v_period_start, v_period_end
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
      'billing_cycle', v_billing_cycle,
      'stripe_subscription_id', v_stripe_sub_id,
      'user_id', v_user_id
    )
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'plan_type', v_plan_type,
    'billing_cycle', v_billing_cycle
  );
END;
$$;

COMMENT ON FUNCTION handle_checkout_completed_plan(jsonb) IS
  'v2 (stripe-yearly P3): event_data.billing_cycle（monthly / yearly、省略時 monthly）を保存。payment_method は stripe 固定。それ以外は v1 と同じ';

-- ------------------------------------------------------------
-- handle_subscription_lifecycle_updated v2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_subscription_lifecycle_updated(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id text;
  v_plan_type text;
  v_billing_cycle text;
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_schedule_id text;
  v_scheduled_plan_type text;
  v_scheduled_billing_cycle text;
  v_scheduled_at timestamptz;
  v_cancel_at_period_end boolean;
  v_subscription_id uuid;
  v_user_id uuid;
BEGIN
  v_stripe_sub_id := event_data->>'stripe_subscription_id';
  v_plan_type := event_data->>'plan_type';
  v_billing_cycle := NULLIF(event_data->>'billing_cycle', '');
  v_status := event_data->>'status';
  v_period_start := NULLIF(event_data->>'current_period_start', '')::timestamptz;
  v_period_end := NULLIF(event_data->>'current_period_end', '')::timestamptz;
  v_schedule_id := event_data->>'schedule_id';
  v_scheduled_plan_type := event_data->>'scheduled_plan_type';
  v_scheduled_billing_cycle := NULLIF(event_data->>'scheduled_billing_cycle', '');
  v_scheduled_at := NULLIF(event_data->>'scheduled_at', '')::timestamptz;
  v_cancel_at_period_end := COALESCE((event_data->>'cancel_at_period_end')::boolean, false);

  IF v_stripe_sub_id IS NULL THEN
    RAISE EXCEPTION 'invalid event_data: stripe_subscription_id is required';
  END IF;

  IF v_plan_type IS NOT NULL
     AND v_plan_type NOT IN ('individual', 'small', 'corporate', 'corporate_premium') THEN
    RAISE EXCEPTION 'invalid plan_type: %', v_plan_type;
  END IF;

  IF v_billing_cycle IS NOT NULL AND v_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid billing_cycle: %', v_billing_cycle;
  END IF;

  IF v_scheduled_billing_cycle IS NOT NULL AND v_scheduled_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid scheduled_billing_cycle: %', v_scheduled_billing_cycle;
  END IF;

  UPDATE subscriptions
  SET plan_type = COALESCE(v_plan_type, plan_type),
      billing_cycle = COALESCE(v_billing_cycle::billing_cycle_type, billing_cycle),
      status = COALESCE(v_status::subscription_status, status),
      current_period_start = COALESCE(v_period_start, current_period_start),
      current_period_end = COALESCE(v_period_end, current_period_end),
      schedule_id = v_schedule_id,
      scheduled_plan_type = v_scheduled_plan_type,
      scheduled_billing_cycle = v_scheduled_billing_cycle::billing_cycle_type,
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

COMMENT ON FUNCTION handle_subscription_lifecycle_updated(jsonb) IS
  'v2 (stripe-yearly P3): event_data.billing_cycle / scheduled_billing_cycle を保存（省略時は billing_cycle 据え置き / scheduled は NULL）。それ以外は v1 と同じ';
