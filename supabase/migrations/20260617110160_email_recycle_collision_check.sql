-- ============================================================
-- email-recycle-on-delete spec 修正 (追加)
-- restoreDeletedSuffix 用の事前衝突判定 RPC
-- ============================================================
-- 背景:
--   restoreDeletedSuffix は admin.auth.admin.updateUserById で
--   印付き email を原本 email に戻す。原本 email が別 active user に
--   取られている場合、Supabase Auth が衝突を検出して失敗する。
--
--   ただし updateUserById は衝突時に code='unexpected_failure' /
--   HTTP 500 を返す (createUser は code='email_exists' / 422 と返す
--   仕様だが、updateUserById は異なる)。このため
--   `errObj.code === 'email_exists'` のみで衝突判定する旧実装では
--   衝突が `api_error` として誤分類されていた (2026-06-25 検出)。
--
-- 修正:
--   updateUserById を呼ぶ前に本 RPC で「原本 email が他 user に
--   取られているか」を SECURITY DEFINER で SELECT 確認する。
--   取られている場合は updateUserById を呼ばずに即 rejected/
--   email_collision を返す。これにより:
--     - Auth API のエラー形式に依存せず堅牢
--     - 監査ログの reason 分類精度が向上
--     - 安全性 (衝突時の原状維持) はそのまま維持
--
-- 設計判断 (design.md の「事前検索は採用しない」を撤回):
--   - 旧 design は listUsers() による全 user 列挙を懸念して却下した
--     が、本 RPC は UNIQUE indexed SELECT 1 EXISTS で O(log N)、性能
--     問題なし
--   - 権限は SECURITY DEFINER で service_role 経由のみ
-- ============================================================

CREATE OR REPLACE FUNCTION email_taken_by_other_user(
  p_email              text,
  p_excluding_user_id  uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- auth.users.email は UNIQUE インデックスあり → O(log N)
  -- 本 user 自身が原本 email を持っている (印付け化失敗等の異常状態)
  -- の場合は衝突扱いしない (p_excluding_user_id で除外)。
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email = p_email
      AND id    <> p_excluding_user_id
  );
$$;

REVOKE ALL ON FUNCTION email_taken_by_other_user(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION email_taken_by_other_user(text, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION email_taken_by_other_user(text, uuid)
  TO service_role;

COMMENT ON FUNCTION email_taken_by_other_user(text, uuid) IS
  'restoreDeletedSuffix が updateUserById 呼び出し前に衝突を判定するための事前確認 RPC。auth.users.email を SECURITY DEFINER で SELECT する。本 user 自身は除外。';
