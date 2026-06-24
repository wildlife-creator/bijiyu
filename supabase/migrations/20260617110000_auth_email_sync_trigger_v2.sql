-- ============================================================
-- handle_user_email_change v2 — 印付き email への同期スキップ
-- (email-recycle-on-delete spec / Task 3)
-- ============================================================
-- v1 (`20260415100000_auth_email_sync_trigger.sql`) を更新する。
--
-- 変更点:
--   1. 印付き形式 (`^deleted-\d{8}-[a-z0-9]{4,}-`) への変更時は
--      `public.users.email` の同期をスキップする。
--      `{4,}` で forward 4 文字（applyDeletedSuffix）/ バックフィル 8 文字
--      （Task 10）の両長を 1 パターンで検出。
--   2. `SET search_path = public` を付与（CLAUDE.md SECURITY DEFINER ルール
--      準拠、v1 では欠落していたため同時補修）。
--
-- 注意: 本 migration は Task 10 のバックフィルより必ず先に投入する
-- （バックフィルが先に走ると `public.users.email` が印付き値で
--  上書きされる）。timestamp は 20260617110000、バックフィルは
-- 20260617110300 で順序を厳守している。
-- ============================================================

CREATE OR REPLACE FUNCTION handle_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email !~ '^deleted-\d{8}-[a-z0-9]{4,}-' THEN
    UPDATE public.users
      SET email = NEW.email
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

-- トリガー `on_auth_user_email_changed` 自体は v1 で定義済みで
-- 関数本体のみ差し替えれば良いため、ここで再作成はしない。
