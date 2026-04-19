-- ============================================================
-- Task 2.1: organizations.name NOT NULL 制約を解除
-- ============================================================
-- 発注者表示名は client_profiles.display_name に一本化するため、
-- organizations.name は Phase 2 以降で廃止予定（Task 19 で DROP COLUMN）。
-- Phase 1 では先に NOT NULL 制約のみ解除し、後続マイグレーション
-- （Task 2.8 ensure_organization_exists 本体書き換え）が INSERT 文から
-- name を省けるようにする。
--
-- 既存データ（name = '' を含む）はそのまま残す。

ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL;
