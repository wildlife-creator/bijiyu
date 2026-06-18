-- ============================================================
-- identity_verifications.updated_at カラム追加（既存スキーマバグ修正）
--
-- 002_core_tables.sql で identity_verifications に
-- `CREATE TRIGGER set_updated_at ... EXECUTE FUNCTION update_updated_at()` を
-- 貼ったが、テーブル定義に updated_at カラムが無かったため、
-- 全 UPDATE が `record "new" has no field "updated_at"` で失敗していた。
--
-- これまで identity_verifications を UPDATE する機能が存在しなかったため
-- 潜在化していたが、admin spec の ADM-012（承認/否認 = status の UPDATE）で
-- 顕在化した。トリガー側を消すのではなく、他テーブルと同じ規約
-- （updated_at timestamptz NOT NULL DEFAULT now()）に揃えてカラムを追加する。
-- ============================================================

ALTER TABLE identity_verifications
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
