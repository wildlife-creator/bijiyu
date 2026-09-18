-- ============================================================
-- 2026-09-16: 銀行振込をオン／オフだけにする（P12 /
--   docs/requirements/p12-bank-transfer-onoff-implementation-notes.md）
--
-- P2（申込テーブル + 3 段階ステータス + 期限管理）と P9（運営の代理登録）で作った
-- 仕組みを廃止し、「お問い合わせで受けて、運営が管理画面でプランをオン／オフする」
-- 形に作り直す。契約行（subscriptions / option_subscriptions の payment_method =
-- 'bank_transfer'）の持ち方と CHECK 制約は据え置き。
--
-- 1. bank_transfer_requests テーブルと専用 enum を削除
-- 2. 期限通知 cron（bank-transfer-expiry-notify）と期限 index を削除
-- 3. contacts に希望プラン列（bank_transfer_plan）を追加
-- 4. handle_checkout_completed_plan v3: 有効な銀行振込行があれば後処理なしで
--    cancelled にしてから Stripe 行を INSERT（銀行振込 → カードの切り替え。§3.2）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 申込テーブルの廃止
-- ------------------------------------------------------------
DROP TABLE IF EXISTS bank_transfer_requests;
DROP TYPE IF EXISTS bank_transfer_request_status;
DROP TYPE IF EXISTS bank_transfer_target_kind;

-- ------------------------------------------------------------
-- 2. 期限通知の廃止（期限は管理しない。契約は運営が止めるまで有効）
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-transfer-expiry-notify') THEN
    PERFORM cron.unschedule('bank-transfer-expiry-notify');
  END IF;
END $$;

DROP INDEX IF EXISTS subscriptions_bank_transfer_expiry_idx;

COMMENT ON COLUMN subscriptions.payment_method IS
  'stripe=Stripe Billing / bank_transfer=銀行振込（運営が管理画面でオン／オフする。期限は管理しない = current_period_end は参照しない）';

-- ------------------------------------------------------------
-- 3. contacts.bank_transfer_plan（希望プラン）
--    お問い合わせの種類が「お支払い方法（銀行振込）について」のときだけ入る。
--    値はプランのキー（individual / small / corporate / corporate_premium /
--    video / video_shooting / video_sns）。表示は PLAN_LABELS / OPTION_LABELS。
-- ------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN bank_transfer_plan text;

COMMENT ON COLUMN contacts.bank_transfer_plan IS
  '銀行振込のお問い合わせで選んだ希望プラン（プラン / 動画プランのキー）。銀行振込以外は NULL';

-- ------------------------------------------------------------
-- 4. handle_checkout_completed_plan v3
--    銀行振込で契約中の会員がカード払いへ切り替えるとき（料金プラン画面の
--    「カード払いで申し込む」）、Stripe 行を作る前に銀行振込行を静かに終了する。
--    role・案件・担当者には触らない（有料が途切れないため後処理は不要）。
--    v2（billing_cycle 保存・payment_method stripe 固定）の挙動は維持。
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
  v_bank_sub_id uuid;
  v_bank_plan_type text;
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
    -- P12: 銀行振込で契約中ならカード払いへの切り替え。後処理なしで終了させる
    SELECT id, plan_type INTO v_bank_sub_id, v_bank_plan_type
    FROM subscriptions
    WHERE user_id = v_user_id
      AND payment_method = 'bank_transfer'
      AND status IN ('active', 'past_due')
    LIMIT 1;

    IF v_bank_sub_id IS NOT NULL THEN
      UPDATE subscriptions
      SET status = 'cancelled',
          cancel_at_period_end = false
      WHERE id = v_bank_sub_id;

      INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
      VALUES (
        NULL,
        'bank_transfer_ended_by_stripe_checkout',
        'subscription',
        v_bank_sub_id,
        jsonb_build_object(
          'user_id', v_user_id,
          'plan_type', v_bank_plan_type,
          'stripe_subscription_id', v_stripe_sub_id
        )
      );
    END IF;

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
    'billing_cycle', v_billing_cycle,
    'ended_bank_transfer_subscription_id', v_bank_sub_id
  );
END;
$$;

COMMENT ON FUNCTION handle_checkout_completed_plan(jsonb) IS
  'v3 (bank-transfer P12): 有効な銀行振込行（payment_method=bank_transfer）があれば後処理なしで cancelled にしてから Stripe 行を INSERT（銀行振込 → カード払いの切り替え）。audit bank_transfer_ended_by_stripe_checkout。v2（billing_cycle 保存・payment_method stripe 固定）は維持';
