-- ============================================================
-- client_profiles に language カラムを追加
-- CON-006 発注者詳細画面で「言語」を表示するため
-- ============================================================

ALTER TABLE client_profiles ADD COLUMN language text;
