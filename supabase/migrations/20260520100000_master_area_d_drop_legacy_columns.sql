-- ============================================================
-- master-area Migration 4
-- 旧カラム DROP: jobs.prefecture / client_profiles.recruit_area
-- 旧複合インデックス idx_jobs_search (status, prefecture) → (status) に再作成
--
-- 背景:
--   - Phase 1〜3 で job_areas / client_recruit_areas 新テーブルへの DML 移行を完了
--   - Phase 4 で全 14 画面 + 5 Server Action + RPC を新テーブル参照に書き換え済
--   - Phase 5 で seed.sql を新スキーマで全面更新済
--   - 旧カラム参照は src/types/database.ts (Phase 6 で gen types により消える) と
--     画面側に残存していれば npm run build の TypeScript エラーで検出する設計
--
-- 設計判断:
--   - jobs.address text(200) は DROP しないこと（CLI-004 番地以下の詳細住所用、Req 4.8）
--   - users.prefecture は DROP しないこと（個人住所、プライバシー設計、Req 9.1）
--   - idx_jobs_search は master-skills Migration B で (status, prefecture) に再作成
--     されていた。本マイグレーションで再度 DROP → (status) のみで作成
--   - 検索クエリは job_areas に対する複合 B-tree (prefecture, municipality) で
--     高速化される（Migration 2 で作成済）。jobs 単独の prefecture index は不要
--
-- 関連 spec: .kiro/specs/master-area/{requirements,design}.md (Req 8.5, 8.6, 8.8)
-- ============================================================

-- ============================================================
-- 1. idx_jobs_search を DROP (prefecture 依存を解消)
--    master-skills Migration B で作成された (status, prefecture) 構成
-- ============================================================

DROP INDEX IF EXISTS idx_jobs_search;

-- ============================================================
-- 2. jobs.prefecture を DROP
--    jobs.address は別カラムで保持（CLI-004 番地以下の詳細住所、Req 4.8）
-- ============================================================

ALTER TABLE jobs
  DROP COLUMN prefecture;

-- ============================================================
-- 3. idx_jobs_search を (status) 単独で再作成
--    一覧の status フィルタ (公開中・募集終了 等) を高速化
--    エリア絞り込みは idx_job_areas_search (prefecture, municipality) が担う
-- ============================================================

CREATE INDEX idx_jobs_search
  ON jobs (status);

-- ============================================================
-- 4. client_profiles.recruit_area (text[]) を DROP
--    募集エリアは client_recruit_areas 別テーブルで管理（Req 4.2）
-- ============================================================

ALTER TABLE client_profiles
  DROP COLUMN recruit_area;

-- ============================================================
-- 5. 検証 NOTICE
-- ============================================================

DO $$
DECLARE
  jobs_pref_exists boolean;
  client_recruit_area_exists boolean;
  idx_jobs_search_def text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND column_name = 'prefecture'
  ) INTO jobs_pref_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_profiles'
      AND column_name = 'recruit_area'
  ) INTO client_recruit_area_exists;

  SELECT indexdef INTO idx_jobs_search_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_jobs_search';

  IF jobs_pref_exists THEN
    RAISE EXCEPTION 'jobs.prefecture still exists after DROP';
  END IF;
  IF client_recruit_area_exists THEN
    RAISE EXCEPTION 'client_profiles.recruit_area still exists after DROP';
  END IF;

  RAISE NOTICE 'master-area migration 4: legacy columns dropped. idx_jobs_search=%', idx_jobs_search_def;
END;
$$;
