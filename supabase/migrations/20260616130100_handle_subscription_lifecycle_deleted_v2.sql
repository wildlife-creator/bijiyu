-- ============================================================
-- proxy-account-multi-org-support Phase 4 / Task 4.2
--
-- handle_subscription_lifecycle_deleted v2
--
-- 変更点（v1 比）:
--   1. 配下 Admin / Staff に対する旧 users.is_active = false 一括 UPDATE を
--      完全に撤廃し、organization_members 行の物理削除に置換する。
--   2. 各削除対象 user_id について、削除直前に SELECT id FROM users WHERE
--      id = v_member_user_id FOR UPDATE で悲観ロックを取り、削除後に
--      残存メンバーシップを判定して 0 件のときのみ users.deleted_at = now()
--      をセットする (条件付きソフト削除)。
--   3. 複数法人が同時解約 + 同一代理スタッフを抱えるケースで、deleted_at の
--      取りこぼし race condition (READ COMMITTED 下で両 Tx が count=1 を見て
--      両方が skip する) を FOR UPDATE 直列化で防止する。
--
-- 維持される挙動:
--   - subscriptions.status = 'cancelled' + 周辺カラム NULL リセット
--   - users.role を contractor にダウングレード (client のみ)
--   - 既に Owner が退会済み (deleted_at セット済み) の場合の冪等な early-return
--   - jobs.status = 'closed' (掲載中のみ)
--   - audit_logs への記録
--
-- 既存 GRANT/REVOKE は CREATE OR REPLACE FUNCTION で保持される。
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

  -- Owner が既に退会済み (deleted_at セット済み) の場合の冪等な early-return
  -- (C 案対応、v1 から維持)
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

  -- 3. 法人プラン解約: 配下 Admin / Staff の organization_members 行削除 +
  --    残存判定による条件付き deleted_at セット
  IF v_was_corporate THEN
    SELECT id INTO v_org_id
    FROM organizations
    WHERE owner_id = v_user_id AND deleted_at IS NULL
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      -- 配下メンバーごとにループ。並行解約の race condition を防ぐため
      -- 各 user_id に FOR UPDATE で悲観ロックを取ってから削除 → 残存判定。
      FOR v_member_user_id IN
        SELECT user_id FROM organization_members
         WHERE organization_id = v_org_id
           AND org_role IN ('admin', 'staff')
      LOOP
        -- 対象ユーザー行に悲観ロック (並行解約の直列化)
        PERFORM 1 FROM public.users WHERE id = v_member_user_id FOR UPDATE;

        -- 当該組織からのみ物理削除 (org_role に依存しない一括削除でも結果は同じ)
        DELETE FROM organization_members
         WHERE organization_id = v_org_id
           AND user_id = v_member_user_id
           AND org_role IN ('admin', 'staff');

        -- 残存メンバーシップ判定 (同一トランザクション内 SELECT)
        SELECT count(*)::int INTO v_remaining_count
          FROM organization_members
         WHERE user_id = v_member_user_id;

        -- 残存 0 件のときのみ users.deleted_at をセット
        IF v_remaining_count = 0 THEN
          UPDATE public.users
             SET deleted_at = now()
           WHERE id = v_member_user_id
             AND deleted_at IS NULL;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 4. 掲載中案件を closed に変更 (v1 から維持)
  UPDATE jobs
  SET status = 'closed'
  WHERE owner_id = v_user_id AND status = 'open';

  -- 5. audit_logs に記録 (v1 から維持)
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

COMMENT ON FUNCTION handle_subscription_lifecycle_deleted(jsonb) IS
  'v2 (proxy-account-multi-org-support Phase 4): 法人プラン解約時に配下 Admin / Staff の organization_members を物理削除し、残存メンバーシップが 0 件のユーザーのみ users.deleted_at をセットする。旧 is_active=false 一括凍結は撤廃。各削除対象には FOR UPDATE で悲観ロックを取り、複数法人の同時解約 + 同一代理スタッフのケースで deleted_at 取りこぼし race condition を防止する。';
