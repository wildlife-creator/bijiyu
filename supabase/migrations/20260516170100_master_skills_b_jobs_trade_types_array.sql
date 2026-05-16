-- ============================================================
-- master-skills Migration B
-- jobs.trade_type (text 単数) → jobs.trade_types (text[] 複数) への置換
--
-- 背景:
--   - 1 案件で複数職種を募集できる必要がある（例: 大工 + 型枠工）
--   - 既存 idx_jobs_search (status, prefecture, trade_type) は単数前提のため
--     新マスタ配列対応の検索に効かない
--
-- 設計判断:
--   - 配列保存（FK 化しない denormalization）。label をそのまま要素にコピー
--   - 検索は GIN(trade_types) で .overlaps() (&&) を効かせる
--   - prerelease 前提のため既存 trade_type 値は ARRAY[trade_type] で機械的に
--     配列化（NULL は空配列 '{}' のまま）
--
-- 関連 spec: .kiro/specs/master-skills/{requirements,design}.md (Requirements 12.5, 12.6)
-- ============================================================

-- 1. 新カラム trade_types text[] NOT NULL DEFAULT '{}' を追加
ALTER TABLE jobs
  ADD COLUMN trade_types text[] NOT NULL DEFAULT '{}';

-- 2. 既存値を配列化 (NULL は '{}' のまま)
UPDATE jobs
  SET trade_types = ARRAY[trade_type]
  WHERE trade_type IS NOT NULL;

-- 3. 旧複合インデックス DROP (trade_type に依存)
DROP INDEX IF EXISTS idx_jobs_search;

-- 4. 旧カラム DROP (依存インデックス削除の後に実施)
ALTER TABLE jobs
  DROP COLUMN trade_type;

-- 5. 新複合 B-tree インデックス (status, prefecture) を再作成
--    trade_type を含まない素直な複合インデックス
CREATE INDEX idx_jobs_search
  ON jobs (status, prefecture);

-- 6. GIN インデックス (trade_types) を作成
--    .overlaps() / && 演算子による配列 OR 一致検索を高速化
CREATE INDEX idx_jobs_trade_types_gin
  ON jobs USING GIN (trade_types);

-- 件数確認 (デバッグログ)
DO $$
DECLARE
  v_jobs_count int;
  v_jobs_with_trade_types int;
BEGIN
  SELECT COUNT(*) INTO v_jobs_count FROM jobs;
  SELECT COUNT(*) INTO v_jobs_with_trade_types FROM jobs WHERE array_length(trade_types, 1) IS NOT NULL;
  RAISE NOTICE 'jobs total=%, jobs with non-empty trade_types=%', v_jobs_count, v_jobs_with_trade_types;
END $$;
