-- ============================================================
-- email-recycle-on-delete spec 修正
-- 既存削除済 user の auth.identities も後追いで同期
-- ============================================================
-- 背景:
--   20260617110300_email_recycle_backfill.sql は auth.users.email のみ
--   印付け化していたが、auth.identities テーブルは原本 email を保持し
--   続けるため、Supabase Auth の signUp が user_already_exists で詰まる
--   問題が判明 (2026-06-25 検出)。
--
--   本機能投入後の新規削除は applyDeletedSuffix v2 が
--   email_recycle_sync_identity RPC を呼んで自動同期されるが、本機能
--   投入前から削除済だった user は backfill 時の片手落ちで identities
--   が原本のまま残る。本 migration でそれを後追い修正する。
--
-- 配置位置:
--   - 20260617110300 (email backfill) より後でないと、印付き email が
--     auth.users にまだ書かれていないので、from_email → to_email の
--     to_email が確定しない。
--   - 20260617120000 (grant migration) より前。
--   → 20260617110350 で挿入。
--
-- 冪等性:
--   - 印付き済 email を持つ user (= 印付け化済) のみ対象
--   - identities が既に同期済 (identity_data.email が印付き済) なら NO-OP
-- ============================================================

DO $$
DECLARE
  v_user record;
  v_synced_count integer := 0;
BEGIN
  FOR v_user IN
    SELECT
      au.id AS user_id,
      au.email AS suffixed_email
    FROM auth.users au
    JOIN public.users pu ON pu.id = au.id
    WHERE pu.deleted_at IS NOT NULL
      AND au.email ~ '^deleted-\d{8}-[a-z0-9]{4,}-'
  LOOP
    -- email-form の provider_id (= 原本 email 文字列) を持つ row があれば、
    -- 印付き email に書き換える。既に印付き済 (^deleted-...) なら skip。
    UPDATE auth.identities
    SET
      provider_id = v_user.suffixed_email,
      updated_at  = now()
    WHERE user_id = v_user.user_id
      AND provider = 'email'
      AND provider_id !~ '^deleted-\d{8}-[a-z0-9]{4,}-'
      AND provider_id != v_user.user_id::text;  -- uuid 形式は除外

    -- 全 email identities の identity_data.email を印付き email に書き換える。
    -- 既に同期済 (identity_data.email = 印付き email) なら skip。
    UPDATE auth.identities
    SET
      identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_user.suffixed_email)),
      updated_at    = now()
    WHERE user_id = v_user.user_id
      AND provider = 'email'
      AND identity_data->>'email' != v_user.suffixed_email;

    v_synced_count := v_synced_count + 1;
  END LOOP;

  RAISE NOTICE '[email_recycle_backfill_identities] 同期対象 user: % 件', v_synced_count;
END $$;
