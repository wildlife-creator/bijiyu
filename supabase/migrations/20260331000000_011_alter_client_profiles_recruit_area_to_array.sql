-- client_profiles.recruit_area を text から text[] に変更
-- 既存データのマイグレーション: カンマ区切りテキストを配列に変換

-- 1. 一時カラムを追加
ALTER TABLE client_profiles ADD COLUMN recruit_area_new text[];

-- 2. 既存データを変換（カンマ区切り or 単一値を配列に）
UPDATE client_profiles
SET recruit_area_new = CASE
  WHEN recruit_area IS NULL THEN NULL
  WHEN recruit_area LIKE '%,%' THEN
    string_to_array(regexp_replace(recruit_area, '\s*,\s*', ',', 'g'), ',')
  ELSE ARRAY[recruit_area]
END;

-- 3. 旧カラムを削除し、新カラムをリネーム
ALTER TABLE client_profiles DROP COLUMN recruit_area;
ALTER TABLE client_profiles RENAME COLUMN recruit_area_new TO recruit_area;
