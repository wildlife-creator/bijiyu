-- 言語データの一元化:
--   - jobs.nationality_language (text, 3択ハードコード) を廃止
--   - jobs.language (text[]) を新設し、LANGUAGES 定数の語彙で多言語登録を可能にする
--   - client_profiles.language (text, 「、」区切り) を text[] に変換
-- 旧データの変換ルール:
--   jobs.nationality_language:
--     "不問"        → ARRAY[]::text[]
--     "日本語必須"  → ARRAY['日本語']
--     "日本国籍のみ" → NULL（国籍は仕様上の登録項目に存在しないため捨てる）
--     NULL / ''     → NULL
--   client_profiles.language:
--     "日本語"        → ARRAY['日本語']
--     "日本語、英語"  → ARRAY['日本語','英語']
--     NULL / ''       → NULL
-- 区切り文字は「、」「・」「,」を許容（既存 edit フォームの解析と整合）。

-- ============================================================================
-- 1. jobs.nationality_language → jobs.language (text[])
-- ============================================================================

ALTER TABLE jobs ADD COLUMN language text[];

UPDATE jobs
SET language = CASE
  WHEN nationality_language IS NULL OR nationality_language = '' THEN NULL
  WHEN nationality_language = '不問' THEN ARRAY[]::text[]
  WHEN nationality_language = '日本語必須' THEN ARRAY['日本語']::text[]
  WHEN nationality_language = '日本国籍のみ' THEN NULL
  ELSE NULL
END;

ALTER TABLE jobs DROP COLUMN nationality_language;

-- ============================================================================
-- 2. client_profiles.language: text (「、」区切り) → text[]
-- ============================================================================

ALTER TABLE client_profiles ADD COLUMN language_new text[];

UPDATE client_profiles
SET language_new = CASE
  WHEN language IS NULL OR length(trim(language)) = 0 THEN NULL
  ELSE array_remove(regexp_split_to_array(language, '[、・,]'), '')
END;

ALTER TABLE client_profiles DROP COLUMN language;
ALTER TABLE client_profiles RENAME COLUMN language_new TO language;
