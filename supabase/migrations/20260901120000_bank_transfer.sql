-- ============================================================
-- 2026-09-01: 銀行振込（P2 / docs/requirements/spec-changes-202608.md §2.1(1)）
--
-- 「追加のみ」のマイグレーション。既存コード（Stripe 経路）からは見えない列・
-- テーブルだけを足すため、クライアント確認中のステージングに先行適用しても
-- 動作は変わらない。
--
-- 1. subscriptions / option_subscriptions に payment_method（stripe / bank_transfer）
--    と billing_cycle（monthly / yearly、subscriptions のみ）を追加
-- 2. 銀行振込の申込レコード bank_transfer_requests を新設
--    （状態遷移: requested=申込受付 → invoiced=請求書送付済 → paid=入金確認済 / cancelled=取消）
--    入金確認後に運営が有効化すると subscriptions / option_subscriptions に
--    payment_method='bank_transfer' の行が作られる（申込と契約は別テーブル）
-- 3. expire-options cron: 銀行振込の補償オプションは自動停止しない（D3 手動運用）
-- 4. bank-transfer-expiry-notify cron: 期限 30 日前 / 当日に運営宛通知（Edge Function）
-- ============================================================

-- ------------------------------------------------------------
-- 0. Enum
-- ------------------------------------------------------------
CREATE TYPE payment_method_type AS ENUM ('stripe', 'bank_transfer');
CREATE TYPE billing_cycle_type AS ENUM ('monthly', 'yearly');
CREATE TYPE bank_transfer_request_status AS ENUM ('requested', 'invoiced', 'paid', 'cancelled');
CREATE TYPE bank_transfer_target_kind AS ENUM ('plan', 'option');

-- ------------------------------------------------------------
-- 1. subscriptions / option_subscriptions の列追加
-- ------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN payment_method payment_method_type NOT NULL DEFAULT 'stripe',
  ADD COLUMN billing_cycle billing_cycle_type NOT NULL DEFAULT 'monthly';

-- 銀行振込行は Stripe の ID を持たない（Stripe 前提の処理に流入させない）
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_bank_transfer_no_stripe
  CHECK (payment_method <> 'bank_transfer' OR stripe_subscription_id IS NULL);

COMMENT ON COLUMN subscriptions.payment_method IS
  'stripe=Stripe Billing / bank_transfer=銀行振込（運営が管理画面で有効化。期限は current_period_end、自動停止しない）';
COMMENT ON COLUMN subscriptions.billing_cycle IS
  '月払い / 年払い。Stripe 行は P3（年額 Price 追加）まで monthly のみ';

ALTER TABLE option_subscriptions
  ADD COLUMN payment_method payment_method_type NOT NULL DEFAULT 'stripe';

ALTER TABLE option_subscriptions
  ADD CONSTRAINT option_subscriptions_bank_transfer_no_stripe
  CHECK (
    payment_method <> 'bank_transfer'
    OR (stripe_subscription_id IS NULL AND stripe_payment_intent_id IS NULL)
  );

CREATE INDEX subscriptions_bank_transfer_expiry_idx
  ON subscriptions (current_period_end)
  WHERE payment_method = 'bank_transfer' AND status = 'active';

-- ------------------------------------------------------------
-- 2. bank_transfer_requests（銀行振込の申込レコード）
-- ------------------------------------------------------------
CREATE TABLE bank_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind bank_transfer_target_kind NOT NULL,
  -- target_kind='plan' のとき必須（individual / small / corporate / corporate_premium）
  plan_type text,
  -- target_kind='option' のとき必須（video / video_workplace / urgent / compensation_5000 / compensation_9800）
  option_type text,
  -- urgent のみ: 対象案件
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  billing_cycle billing_cycle_type NOT NULL DEFAULT 'monthly',
  -- 税込 JPY。amount は本体価格、initial_fee は初回事務手数料（該当時のみ > 0）
  amount integer NOT NULL CHECK (amount >= 0),
  initial_fee integer NOT NULL DEFAULT 0 CHECK (initial_fee >= 0),
  status bank_transfer_request_status NOT NULL DEFAULT 'requested',
  invoiced_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  -- 有効化時に運営が指定した利用開始日（D8: Stripe 会員の切替は現期間終了日）
  start_date date,
  -- 最後に操作した管理者
  handled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  admin_memo text,
  -- 有効化で作成した契約行（追跡用）
  activated_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  activated_option_subscription_id uuid REFERENCES option_subscriptions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transfer_requests_target_consistency CHECK (
    (target_kind = 'plan'
      AND plan_type IN ('individual', 'small', 'corporate', 'corporate_premium')
      AND option_type IS NULL AND job_id IS NULL)
    OR
    (target_kind = 'option'
      AND option_type IN ('video', 'video_workplace', 'urgent', 'compensation_5000', 'compensation_9800')
      AND plan_type IS NULL)
  )
  -- 急募（urgent）の job_id 必須はアプリ側（Zod）で検証する。
  -- DB 制約にすると jobs 削除時の ON DELETE SET NULL と衝突するため置かない。
);

COMMENT ON TABLE bank_transfer_requests IS
  '銀行振込の申込レコード（決済はアプリ外）。requested → invoiced → paid / cancelled。paid で subscriptions / option_subscriptions に bank_transfer 行が作られる';

-- 同じ対象の申込を処理中（requested / invoiced）に二重に受け付けない
-- plan は種類を問わず 1 件、option は option_type（急募は案件）ごとに 1 件
CREATE UNIQUE INDEX bank_transfer_requests_open_unique
  ON bank_transfer_requests (
    user_id,
    target_kind,
    COALESCE(option_type, ''),
    COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('requested', 'invoiced');

CREATE INDEX bank_transfer_requests_status_idx ON bank_transfer_requests (status, created_at DESC);
CREATE INDEX bank_transfer_requests_user_idx ON bank_transfer_requests (user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bank_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 本人と管理者が閲覧のみ。INSERT / UPDATE は service_role（Server Action）専用
ALTER TABLE bank_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transfer_requests_select" ON bank_transfer_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "bank_transfer_requests_select_admin" ON bank_transfer_requests
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

GRANT ALL ON bank_transfer_requests TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. expire-options cron の再登録
--    銀行振込の補償オプション（月額 / 年額を運営が手動管理）は自動で expired に
--    しない（D3）。急募（7 日）は支払方法に関係なく期限で落とす。
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-options') THEN
    PERFORM cron.unschedule('expire-options');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-options',
  '5 18 * * *',
  $$
  -- ステートメント 1: 期限切れマーク（銀行振込の補償は手動運用のため除外）
  UPDATE option_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < NOW()
    AND NOT (
      payment_method = 'bank_transfer'
      AND option_type IN ('compensation_5000', 'compensation_9800')
    );

  -- ステートメント 2: 同ユーザーに他の active urgent がない場合 is_urgent_option=false
  UPDATE client_profiles cp
  SET is_urgent_option = false
  WHERE cp.is_urgent_option = true
    AND NOT EXISTS (
      SELECT 1 FROM option_subscriptions os
      WHERE os.user_id = cp.user_id
        AND os.option_type = 'urgent'
        AND os.status = 'active'
    );

  -- ステートメント 3: 対象 jobs.is_urgent=false
  UPDATE jobs
  SET is_urgent = false
  WHERE is_urgent = true
    AND NOT EXISTS (
      SELECT 1 FROM option_subscriptions os
      WHERE os.job_id = jobs.id
        AND os.option_type = 'urgent'
        AND os.status = 'active'
    );
  $$
);

-- ------------------------------------------------------------
-- 4. bank-transfer-expiry-notify（毎日 18:30 UTC = 03:30 JST）
--    銀行振込契約の期限 30 日前 / 当日に運営宛通知メールを送る Edge Function を
--    pg_net で呼び出す。auto-cancel-past-due と同じ方式・同じ設定キー。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_function_url text;
  v_service_role_key text;
BEGIN
  v_function_url := current_setting('app.settings.supabase_functions_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_function_url IS NULL OR v_function_url = '' THEN
    v_function_url := 'http://host.docker.internal:54321/functions/v1/bank-transfer-expiry-notify';
  ELSE
    -- 既存設定は auto-cancel-past-due の URL を指しているため関数名を差し替える
    v_function_url := regexp_replace(v_function_url, 'auto-cancel-past-due$', 'bank-transfer-expiry-notify');
  END IF;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    v_service_role_key := 'placeholder-set-via-app-settings';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-transfer-expiry-notify') THEN
    PERFORM cron.unschedule('bank-transfer-expiry-notify');
  END IF;

  PERFORM cron.schedule(
    'bank-transfer-expiry-notify',
    '30 18 * * *',
    format(
      $job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $job$,
      v_function_url,
      'Bearer ' || v_service_role_key
    )
  );
END $$;

-- ------------------------------------------------------------
-- 5. handle_subscription_lifecycle_deleted v4
--    銀行振込契約（stripe_subscription_id が NULL）を管理画面から解約するため、
--    event_data.subscription_id（uuid）でも対象行を特定できるようにする。
--    stripe_subscription_id を渡す従来の呼び出し（Webhook）は完全互換。
--    v3 の挙動（Owner role downgrade / 配下メンバー削除 + 条件付き deleted_at /
--    案件 closed 化 / globally_deleted_user_ids 返却）は維持。
--    追加: event_data.actor_id（管理者操作時の監査 actor）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_subscription_lifecycle_deleted(event_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id text;
  v_input_sub_id uuid;
  v_actor_id uuid;
  v_subscription_id uuid;
  v_user_id uuid;
  v_was_corporate boolean;
  v_org_id uuid;
  v_member_user_id uuid;
  v_remaining_count integer;
  v_globally_deleted_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_stripe_sub_id := event_data->>'stripe_subscription_id';
  v_input_sub_id := (event_data->>'subscription_id')::uuid;
  v_actor_id := (event_data->>'actor_id')::uuid;

  IF v_stripe_sub_id IS NULL AND v_input_sub_id IS NULL THEN
    RAISE EXCEPTION 'invalid event_data: stripe_subscription_id or subscription_id is required';
  END IF;

  IF v_stripe_sub_id IS NOT NULL THEN
    SELECT id, user_id, plan_type IN ('corporate', 'corporate_premium')
      INTO v_subscription_id, v_user_id, v_was_corporate
    FROM subscriptions
    WHERE stripe_subscription_id = v_stripe_sub_id
    LIMIT 1;
  ELSE
    -- 銀行振込行のみ id 指定を許可（Stripe 行は Webhook 経路で解約する）
    SELECT id, user_id, plan_type IN ('corporate', 'corporate_premium')
      INTO v_subscription_id, v_user_id, v_was_corporate
    FROM subscriptions
    WHERE id = v_input_sub_id
      AND payment_method = 'bank_transfer'
    LIMIT 1;
  END IF;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found for stripe_subscription_id=% subscription_id=%', v_stripe_sub_id, v_input_sub_id;
  END IF;

  -- Owner が既に退会済みの場合の冪等な early-return (v2 から維持)
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
      v_actor_id,
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
      'skipped_downgrade', true,
      'globally_deleted_user_ids', to_jsonb(v_globally_deleted_ids)
    );
  END IF;

  -- 1. subscriptions status='cancelled'
  UPDATE subscriptions
  SET status = 'cancelled',
      cancel_at_period_end = false,
      schedule_id = NULL,
      scheduled_plan_type = NULL,
      scheduled_at = NULL
  WHERE id = v_subscription_id;

  -- 2. Owner の users.role を contractor にダウングレード (client のみ)
  UPDATE users
  SET role = 'contractor'
  WHERE id = v_user_id AND role = 'client';

  -- 3. 法人プラン解約: 配下 Admin / Staff の organization_members 削除 +
  --    残存判定による条件付き deleted_at セット + 遷移 user_id 蓄積
  IF v_was_corporate THEN
    SELECT id INTO v_org_id
    FROM organizations
    WHERE owner_id = v_user_id AND deleted_at IS NULL
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      FOR v_member_user_id IN
        SELECT user_id FROM organization_members
         WHERE organization_id = v_org_id
           AND org_role IN ('admin', 'staff')
      LOOP
        PERFORM 1 FROM public.users WHERE id = v_member_user_id FOR UPDATE;

        DELETE FROM organization_members
         WHERE organization_id = v_org_id
           AND user_id = v_member_user_id
           AND org_role IN ('admin', 'staff');

        SELECT count(*)::int INTO v_remaining_count
          FROM organization_members
         WHERE user_id = v_member_user_id;

        IF v_remaining_count = 0 THEN
          UPDATE public.users
             SET deleted_at = now()
           WHERE id = v_member_user_id
             AND deleted_at IS NULL;

          IF FOUND THEN
            v_globally_deleted_ids :=
              array_append(v_globally_deleted_ids, v_member_user_id);
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 4. 掲載中案件を closed に変更
  UPDATE jobs
  SET status = 'closed'
  WHERE owner_id = v_user_id AND status = 'open';

  -- 5. audit_logs に記録
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor_id,
    'subscription_cancelled',
    'subscription',
    v_subscription_id,
    jsonb_build_object('stripe_subscription_id', v_stripe_sub_id)
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'user_id', v_user_id,
    'globally_deleted_user_ids', to_jsonb(v_globally_deleted_ids)
  );
END;
$$;

COMMENT ON FUNCTION handle_subscription_lifecycle_deleted(jsonb) IS
  'v4 (bank-transfer P2): event_data.subscription_id（uuid、銀行振込行のみ）でも対象を特定可能に。event_data.actor_id を監査 actor に使用。stripe_subscription_id 指定の従来経路は完全互換。v3 の挙動（globally_deleted_user_ids 返却 / Owner role downgrade / 案件 closed 化）は維持。';
