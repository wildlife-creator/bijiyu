-- ============================================================
-- master-area Migration 検証クエリ (Phase 7.0)
--
-- 用途:
--   `supabase db reset` 後、または本番への適用直後に手動 / CI で実行し、
--   Migration 1〜4 が想定通りの状態になっていることを検証する。
--
-- 実行方法:
--   docker exec -i supabase_db_bijiyu psql -U postgres -d postgres \
--     < scripts/verify-master-area-migration.sql
--   または supabase test db のヘルパー SQL 経由
--
-- 全アサーションは psql の `\if` / `\echo` ではなく PL/pgSQL の
-- `RAISE EXCEPTION` で失敗を即座に伝える。
-- ============================================================

-- ============================================================
-- 1. master_municipalities 件数 (Migration 1, research.md §5.1)
--    1,897 = 全 1,718 市町村 + 政令市行政区 171 + 北方領土・諸島等 +
--           北海道泊村 dedupe -1
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM master_municipalities;
  IF v_count <> 1897 THEN
    RAISE EXCEPTION 'master_municipalities count mismatch: expected=1897, got=%', v_count;
  END IF;
  RAISE NOTICE '✓ master_municipalities count = % (expected 1897)', v_count;
END $$;

-- ============================================================
-- 2. 政令指定都市本体 20 件が不在 (Req 1.2)
--    20 政令市は行政区を持つため本体は除外し、行政区 (横浜市港北区 等) のみ登録
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM master_municipalities
  WHERE municipality IN (
    '横浜市','大阪市','名古屋市','札幌市','京都市','神戸市','福岡市','北九州市',
    '広島市','仙台市','千葉市','さいたま市','静岡市','浜松市','新潟市','岡山市',
    '熊本市','相模原市','堺市','川崎市'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '政令市本体が % 件混入: 行政区のみ登録すべき (Req 1.2)', v_count;
  END IF;
  RAISE NOTICE '✓ 政令市本体 20 件 すべて不在';
END $$;

-- ============================================================
-- 3. 政令市行政区が正しく登録されている (サンプル: 横浜市港北区)
-- ============================================================
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM master_municipalities
    WHERE prefecture = '神奈川県' AND municipality = '横浜市港北区'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION '神奈川県・横浜市港北区 が見つからない (政令市行政区登録不備)';
  END IF;
  RAISE NOTICE '✓ 神奈川県・横浜市港北区 登録確認';
END $$;

-- ============================================================
-- 4. Migration 4 = 旧カラム DROP の確認 (Phase 6 結果)
-- ============================================================
DO $$
DECLARE
  v_jobs_pref boolean;
  v_client_recruit boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'prefecture'
  ) INTO v_jobs_pref;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_profiles'
      AND column_name = 'recruit_area'
  ) INTO v_client_recruit;
  IF v_jobs_pref THEN
    RAISE EXCEPTION 'jobs.prefecture が DROP されていない (Phase 6 / Migration 4 失敗)';
  END IF;
  IF v_client_recruit THEN
    RAISE EXCEPTION 'client_profiles.recruit_area が DROP されていない';
  END IF;
  RAISE NOTICE '✓ 旧カラム jobs.prefecture / client_profiles.recruit_area DROP 済';
END $$;

-- ============================================================
-- 5. jobs.address / users.prefecture は維持されている (Req 4.8 / 9.1)
-- ============================================================
DO $$
DECLARE
  v_jobs_address boolean;
  v_users_pref boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'address'
  ) INTO v_jobs_address;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'prefecture'
  ) INTO v_users_pref;
  IF NOT v_jobs_address THEN
    RAISE EXCEPTION 'jobs.address が消えている (CLI-004 番地用、Req 4.8 違反)';
  END IF;
  IF NOT v_users_pref THEN
    RAISE EXCEPTION 'users.prefecture が消えている (個人住所、Req 9.1 違反)';
  END IF;
  RAISE NOTICE '✓ jobs.address / users.prefecture 保持確認';
END $$;

-- ============================================================
-- 6. idx_jobs_search が (status) 単独で再構築されている (Req 8.8)
-- ============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT indexdef INTO v_def
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'idx_jobs_search';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'idx_jobs_search が存在しない';
  END IF;
  IF v_def NOT LIKE '%(status)' THEN
    RAISE EXCEPTION 'idx_jobs_search の定義が想定外: %', v_def;
  END IF;
  RAISE NOTICE '✓ idx_jobs_search = %', v_def;
END $$;

-- ============================================================
-- 7. job_areas / client_recruit_areas / user_available_areas が存在し
--    RLS 有効、検索インデックス (prefecture, municipality) が張られている
-- ============================================================
DO $$
DECLARE
  v_table_count int;
  v_idx_count int;
  v_rls_count int;
BEGIN
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('job_areas', 'client_recruit_areas', 'user_available_areas',
                       'master_municipalities');
  IF v_table_count <> 4 THEN
    RAISE EXCEPTION '4 area tables expected, got %', v_table_count;
  END IF;

  SELECT count(*) INTO v_idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN ('idx_job_areas_search',
                      'idx_client_recruit_areas_search',
                      'idx_user_available_areas_search',
                      'idx_master_municipalities_pref_muni');
  IF v_idx_count < 3 THEN
    RAISE EXCEPTION '検索 index 3 件未満 (got %)', v_idx_count;
  END IF;

  SELECT count(*) INTO v_rls_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('job_areas', 'client_recruit_areas', 'user_available_areas',
                      'master_municipalities')
    AND c.relrowsecurity = true;
  IF v_rls_count <> 4 THEN
    RAISE EXCEPTION '4 area tables の RLS 有効が % 件しかない', v_rls_count;
  END IF;
  RAISE NOTICE '✓ 4 area tables 存在、RLS 有効、検索 index 確認';
END $$;

-- ============================================================
-- 8. user_available_areas の UNIQUE NULLS NOT DISTINCT 制約
-- ============================================================
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_available_areas_unique_tuple'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'user_available_areas_unique_tuple 制約が無い';
  END IF;
  RAISE NOTICE '✓ user_available_areas_unique_tuple 制約あり';
END $$;

-- ============================================================
-- 9. enforce_job_areas_max トリガーが job_areas に登録されている
-- ============================================================
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_job_areas_max'
      AND tgrelid = 'job_areas'::regclass
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'trg_enforce_job_areas_max トリガーが無い (10 件上限が効かない)';
  END IF;
  RAISE NOTICE '✓ trg_enforce_job_areas_max トリガー登録済み';
END $$;

-- ============================================================
-- 10. 3 RPC が登録されている
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname IN ('replace_user_areas', 'replace_job_areas',
                    'replace_client_recruit_areas');
  IF v_count <> 3 THEN
    RAISE EXCEPTION '3 RPC が全て登録されていない (got %)', v_count;
  END IF;
  RAISE NOTICE '✓ replace_*_areas RPC 3 件 登録済み';
END $$;

-- ============================================================
-- 11. seed.sql で投入されたデータの DML 移行対称性 (Req 8.2 / 8.3)
--    旧カラムは Phase 6 で DROP 済のため、ここでは
--    新テーブルが「最低 1 件以上」入っていることだけ確認
--    (件数の対称性は本番適用時に Migration 3 自身が verify する)
-- ============================================================
DO $$
DECLARE
  v_ja int;
  v_cra int;
  v_uaa int;
BEGIN
  SELECT count(*) INTO v_ja FROM job_areas;
  SELECT count(*) INTO v_cra FROM client_recruit_areas;
  SELECT count(*) INTO v_uaa FROM user_available_areas;
  RAISE NOTICE '✓ seed 投入後: job_areas=%, client_recruit_areas=%, user_available_areas=%',
    v_ja, v_cra, v_uaa;
  IF v_ja = 0 OR v_cra = 0 OR v_uaa = 0 THEN
    RAISE EXCEPTION 'seed 投入後に新テーブルのいずれかが 0 件: ja=%, cra=%, uaa=%',
      v_ja, v_cra, v_uaa;
  END IF;
END $$;

\echo '✓ All master-area migration verification queries passed.'
