-- ============================================================
-- Task 13.45.1: handle_subscription_lifecycle_deleted の対象ロール拡張
-- ============================================================
-- 法人プラン完全解約時、org_role='staff' のみ is_active=false にしていたのを
-- org_role IN ('admin', 'staff') に拡張する（J1 冷凍保存方針）。

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

  SELECT id, user_id, plan_type IN ('corporate', 'corporate_premium')
    INTO v_subscription_id, v_user_id, v_was_corporate
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found for stripe_subscription_id=%', v_stripe_sub_id;
  END IF;

  -- C 案対応: 既に Owner 側が退会済み（deleted_at セット済み）の場合は
  -- users.role 再降格や is_active 再設定を行わない（冪等性）
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND deleted_at IS NOT NULL) THEN
    UPDATE subscriptions
    SET status = 'cancelled',
        cancel_at_period_end = false,
        schedule_id = NULL,
        scheduled_plan_type = NULL,
        scheduled_at = NULL
    WHERE id = v_subscription_id;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      NULL,
      'subscription_cancelled',
      'subscription',
      v_subscription_id,
      jsonb_build_object(
        'stripe_subscription_id', v_stripe_sub_id,
        'skipped_downgrade_reason', 'owner_already_withdrawn'
      )
    );

    RETURN jsonb_build_object(
      'subscription_id', v_subscription_id,
      'user_id', v_user_id,
      'skipped_downgrade', true
    );
  END IF;

  UPDATE subscriptions
  SET status = 'cancelled',
      cancel_at_period_end = false,
      schedule_id = NULL,
      scheduled_plan_type = NULL,
      scheduled_at = NULL
  WHERE id = v_subscription_id;

  UPDATE users
  SET role = 'contractor'
  WHERE id = v_user_id AND role = 'client';

  -- 法人プラン owner だった場合、配下 Admin / Staff の is_active=false
  -- （J1 冷凍保存: Admin も対象）
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
          AND org_role IN ('admin', 'staff')
      );
    END IF;
  END IF;

  UPDATE jobs
  SET status = 'closed'
  WHERE owner_id = v_user_id AND status = 'open';

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

-- 既存の GRANT/REVOKE は CREATE OR REPLACE で保持される
