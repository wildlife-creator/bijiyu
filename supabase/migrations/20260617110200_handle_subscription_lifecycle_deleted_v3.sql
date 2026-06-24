-- ============================================================
-- handle_subscription_lifecycle_deleted v3
-- (email-recycle-on-delete spec / Task 5)
--
-- 変更点（v2 比）:
--   1. 戻り値 jsonb に `globally_deleted_user_ids: uuid[]` を追加。
--      ループ内で users.deleted_at が NULL → now() に遷移した user_id を
--      配列に蓄積し、最終 jsonb_build_object に含める。
--   2. Owner 既退会 early-return パスでは空配列 `[]::uuid[]` を返す
--      (該当パスは 1 ユーザーも globally_deleted しない)。
--
-- v2 の挙動 (Owner role downgrade / 案件 closed 化 / audit_logs 記録 /
--          FOR UPDATE 直列化 / 条件付き deleted_at セット) は完全維持。
--
-- 戻り値型は jsonb のまま (フィールド追加のみ) なので CREATE OR REPLACE で
-- 互換更新可能。DROP は不要。
--
-- 呼び出し元 (`src/lib/billing/webhook/handle-subscription-lifecycle.ts`
-- の handleSubscriptionDeleted) は globally_deleted_user_ids をループして
-- 各 user に applyDeletedSuffix を呼ぶ新パスを追加する (Task 8)。
-- ============================================================

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
  v_member_user_id uuid;
  v_remaining_count integer;
  v_globally_deleted_ids uuid[] := ARRAY[]::uuid[];
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
      NULL,
      'subscription_cancelled',
      'subscription',
      v_subscription_id,
      jsonb_build_object(
        'stripe_subscription_id', v_stripe_sub_id,
        'skipped_downgrade_reason', 'owner_already_withdrawn'
      )
    );

    -- v3: early-return パスでも globally_deleted_user_ids を空配列で返す
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
        -- 対象ユーザー行に悲観ロック
        PERFORM 1 FROM public.users WHERE id = v_member_user_id FOR UPDATE;

        -- 当該組織からのみ物理削除
        DELETE FROM organization_members
         WHERE organization_id = v_org_id
           AND user_id = v_member_user_id
           AND org_role IN ('admin', 'staff');

        -- 残存メンバーシップ判定
        SELECT count(*)::int INTO v_remaining_count
          FROM organization_members
         WHERE user_id = v_member_user_id;

        -- 残存 0 件のときのみ users.deleted_at をセット +
        -- 実際に NULL → now() に遷移した場合のみ配列追加
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
    NULL,
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
  'v3 (email-recycle-on-delete): 戻り値 jsonb に globally_deleted_user_ids: uuid[] を追加。ループ内で users.deleted_at が NULL → now() に遷移した user_id を蓄積し配列で返す。呼び出し元はこれをループして applyDeletedSuffix を発火する。v2 の Owner role downgrade / 案件 closed 化 / FOR UPDATE 直列化 / 条件付き deleted_at セットの挙動は完全維持。';
