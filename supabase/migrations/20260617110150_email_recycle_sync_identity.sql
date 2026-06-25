-- ============================================================
-- email-recycle-on-delete spec 修正
-- auth.identities の email 同期 RPC を追加
-- ============================================================
-- 背景:
--   v1 の applyDeletedSuffix / restoreDeletedSuffix は auth.users.email
--   のみ書き換えていたが、Supabase Auth (GoTrue) はメアド一意性判定で
--   auth.identities テーブルも参照する。具体的には:
--     - auth.identities.email (generated column from identity_data->>'email')
--     - auth.identities.provider_id (email-form の row では原本 email を保持)
--   これらが原本 email を保持し続けると、`supabase.auth.signUp` で
--   `user_already_exists` (HTTP 422) エラーが発生し、本機能の目的である
--   「同メアド再登録の常時開通」が半分しか達成できない (招待は通るが
--    通常 signup は詰まる) という非対称が生じていた (2026-06-25 検出)。
--
-- 修正:
--   本関数は applyDeletedSuffix / restoreDeletedSuffix から呼び出され、
--   auth.identities の対象 user の email 関連フィールドを from_email から
--   to_email に書き換える。両方向 (印付け / 復元) で同じ関数を使う。
--
-- 詳細:
--   1. email-form の provider_id を持つ identity row (seed.sql の旧形式 +
--      Supabase の昔の signUp 由来) では provider_id 自体を to_email に
--      書き換える。
--   2. 全 email identity の identity_data->>'email' を to_email に
--      書き換える。email カラムは generated なので自動で連動更新される。
--   両方を行うことで auth レベルでの「メアド既使用」判定をすべて回避できる。
-- ============================================================

CREATE OR REPLACE FUNCTION email_recycle_sync_identity(
  p_user_id    uuid,
  p_from_email text,
  p_to_email   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. legacy 形式の provider_id (= email 文字列を保持) を持つ row が
  --    あれば、provider_id を新 email に書き換える。
  --    UNIQUE 制約 (provider_id, provider) は to_email がランダム文字を
  --    含む印付き形式 or 復元時の原本 email なので実質衝突しない。
  UPDATE auth.identities
  SET
    provider_id = p_to_email,
    updated_at  = now()
  WHERE user_id = p_user_id
    AND provider = 'email'
    AND provider_id = p_from_email;

  -- 2. 全 email identities の identity_data.email を to_email に書き換える。
  --    auth.identities.email カラム (generated) も自動で連動する。
  --    uuid 形式 provider_id の row (signUp / inviteUserByEmail 由来) も対象。
  UPDATE auth.identities
  SET
    identity_data = jsonb_set(identity_data, '{email}', to_jsonb(p_to_email)),
    updated_at    = now()
  WHERE user_id = p_user_id
    AND provider = 'email';
END;
$$;

-- service_role 以外からの実行は禁止 (admin client 経由でのみ呼ばれる)
REVOKE ALL ON FUNCTION email_recycle_sync_identity(uuid, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION email_recycle_sync_identity(uuid, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION email_recycle_sync_identity(uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION email_recycle_sync_identity(uuid, text, text) IS
  'applyDeletedSuffix / restoreDeletedSuffix から呼ばれる auth.identities 同期関数。auth.users.email の書き換えだけでは Supabase Auth の signUp が user_already_exists で詰まるため、identities 側も同期する。両方向 (印付け / 復元) で同じ関数を使う。';
