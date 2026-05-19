-- ============================================================
-- master-area Migration 3
-- 既存 jobs.prefecture / client_profiles.recruit_area の値を
-- 新テーブル job_areas / client_recruit_areas に DML 移行する
--
-- 設計判断:
--   - 既存値は municipality = NULL の県全域 1 行として移行
--   - 上位包含ルール (Req 6.2) により、市区町村絞り込み検索でも結果に含まれる
--   - 旧カラム jobs.prefecture / client_profiles.recruit_area は本マイグレーション
--     では DROP しない (Phase 6 = Migration 4 で実施)
--   - user_available_areas.municipality は Migration 2 の ADD COLUMN で全行 NULL
--     初期化済みのため追加 DML 不要
--
-- dev 環境での挙動:
--   `supabase db reset` は migrations → seed.sql の順で実行される。本マイグレーション
--   実行時点で jobs / client_profiles はまだ空のため移行件数は 0 件となる
--   (NOTICE では migrated=0 と出る)。これは仕様通りで、エラーではない。
--   実データ移行は本番環境への適用時に発生する。
--
-- 関連 spec: .kiro/specs/master-area/{requirements,design}.md
-- ============================================================

-- ============================================================
-- 1. 移行前の prefecture 表記揺れ検出 (NOTICE 出力)
--    規定外の prefecture 値があれば手動修正 or WHERE 句で除外する判断を促す
--    CLAUDE.md memory「マスタ移行時は DB 全件 NOT IN クエリで検証」既存ルール
-- ============================================================

DO $$
DECLARE
  invalid_jobs_count int;
  invalid_clients_count int;
  invalid_users_count int;
  pref_list text;
BEGIN
  -- 47 都道府県のリスト (src/lib/constants/options.ts:9 PREFECTURES と同一)
  pref_list := '北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,'
            || '茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,'
            || '新潟県,富山県,石川県,福井県,山梨県,長野県,'
            || '岐阜県,静岡県,愛知県,三重県,'
            || '滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,'
            || '鳥取県,島根県,岡山県,広島県,山口県,'
            || '徳島県,香川県,愛媛県,高知県,'
            || '福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,'
            || '沖縄県';

  SELECT count(*) INTO invalid_jobs_count
  FROM jobs
  WHERE prefecture IS NOT NULL
    AND prefecture <> ALL (string_to_array(pref_list, ','));

  SELECT count(*) INTO invalid_clients_count
  FROM client_profiles cp,
       LATERAL unnest(coalesce(cp.recruit_area, ARRAY[]::text[])) AS area
  WHERE area <> ALL (string_to_array(pref_list, ','));

  SELECT count(*) INTO invalid_users_count
  FROM user_available_areas
  WHERE prefecture IS NOT NULL
    AND prefecture <> ALL (string_to_array(pref_list, ','));

  IF invalid_jobs_count > 0 THEN
    RAISE NOTICE 'WARNING: jobs.prefecture has % rows with non-standard prefecture values. Review and fix manually before relying on the migrated data.', invalid_jobs_count;
  END IF;
  IF invalid_clients_count > 0 THEN
    RAISE NOTICE 'WARNING: client_profiles.recruit_area has % elements with non-standard prefecture values.', invalid_clients_count;
  END IF;
  IF invalid_users_count > 0 THEN
    RAISE NOTICE 'WARNING: user_available_areas has % rows with non-standard prefecture values.', invalid_users_count;
  END IF;
END;
$$;

-- ============================================================
-- 2. jobs.prefecture → job_areas (municipality = NULL の県全域 1 行として移行)
-- ============================================================

INSERT INTO job_areas (job_id, prefecture, municipality)
SELECT id, prefecture, NULL
FROM jobs
WHERE prefecture IS NOT NULL
  AND length(trim(prefecture)) > 0;

-- ============================================================
-- 3. client_profiles.recruit_area (text[]) → client_recruit_areas
--    配列を unnest して 1 要素 1 行ずつに展開
-- ============================================================

INSERT INTO client_recruit_areas (client_id, prefecture, municipality)
SELECT cp.user_id, area, NULL
FROM client_profiles cp,
     LATERAL unnest(cp.recruit_area) AS area
WHERE cp.recruit_area IS NOT NULL
  AND array_length(cp.recruit_area, 1) > 0;

-- ============================================================
-- 4. user_available_areas.municipality は Migration 2 の ADD COLUMN で
--    全行 NULL 初期化済みのため追加 DML 不要
-- ============================================================

-- ============================================================
-- 5. 移行件数検証 (NOTICE 出力)
--    本マイグレーションでは件数アサーションを RAISE EXCEPTION で行わない:
--      - dev 環境: supabase db reset 時点で jobs / client_profiles は空 → 0 件移行
--      - 本番環境: 実データ件数に依存し事前に予測できない
--    対称性 (移行元・先の件数一致) は手動検証 or scripts/verify-master-area-migration.sql で行う
-- ============================================================

DO $$
DECLARE
  job_src_count int;
  client_src_count int;
  ja_count int;
  cra_count int;
  uaa_count int;
BEGIN
  SELECT count(*) INTO job_src_count
  FROM jobs
  WHERE prefecture IS NOT NULL AND length(trim(prefecture)) > 0;

  SELECT coalesce(sum(array_length(recruit_area, 1)), 0) INTO client_src_count
  FROM client_profiles
  WHERE recruit_area IS NOT NULL AND array_length(recruit_area, 1) > 0;

  SELECT count(*) INTO ja_count FROM job_areas;
  SELECT count(*) INTO cra_count FROM client_recruit_areas;
  SELECT count(*) INTO uaa_count FROM user_available_areas;

  RAISE NOTICE 'master-area migration 3: source jobs=%, client_recruit_area_elements=% / target job_areas=%, client_recruit_areas=%, user_available_areas=%',
    job_src_count, client_src_count, ja_count, cra_count, uaa_count;

  IF ja_count <> job_src_count THEN
    RAISE EXCEPTION 'job_areas migration mismatch: source=%, target=%', job_src_count, ja_count;
  END IF;
  IF cra_count <> client_src_count THEN
    RAISE EXCEPTION 'client_recruit_areas migration mismatch: source=%, target=%', client_src_count, cra_count;
  END IF;
END;
$$;
