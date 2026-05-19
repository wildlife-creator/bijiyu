-- ============================================================
-- master-area Migration 2
-- job_areas / client_recruit_areas テーブル新規作成 +
-- user_available_areas.municipality カラム追加 + UNIQUE NULLS NOT DISTINCT +
-- enforce_job_areas_max トリガー + 3 RPC (replace_*_areas) + RLS + index
--
-- 設計判断:
--   - 別テーブル正規化 (1 案件複数現場・県跨ぎ・全域 NULL を素直に表現)
--   - municipality NULL = 県全域 (受注者) / 現場未定 (案件) / 全域 (発注者)
--   - 1 案件あたりエリアは最大 10 件まで (enforce_job_areas_max トリガーでハード制約)
--   - replace_*_areas RPC は SECURITY INVOKER で呼び出し元の RLS を尊重
--   - p_user_id / p_job_id / p_client_id は Server Action 内で所有確認済みの
--     値のみ渡す (FormData / URL params 由来の値は信頼しない)
--   - 既存 all-in-one RPC (complete_registration / update_profile) は本マイグレーション
--     では変更しない (Phase 4.5 で Server Action 書き換えと同時に signature 変更)
--
-- 関連 spec: .kiro/specs/master-area/{requirements,design}.md
-- ============================================================

-- ============================================================
-- 1. job_areas テーブル
-- ============================================================

CREATE TABLE job_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  prefecture text NOT NULL,
  municipality text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_areas_job_id ON job_areas (job_id);
CREATE INDEX idx_job_areas_search ON job_areas (prefecture, municipality);

ALTER TABLE job_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_areas_select_all
  ON job_areas
  FOR SELECT
  TO authenticated
  USING (true);

-- owner_id 単独ではなく組織メンバーも書き込み可 (法人プラン用)
CREATE POLICY job_areas_owner_write
  ON job_areas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_areas.job_id
        AND (
          jobs.owner_id = auth.uid()
          OR is_same_org(auth.uid(), jobs.organization_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_areas.job_id
        AND (
          jobs.owner_id = auth.uid()
          OR is_same_org(auth.uid(), jobs.organization_id)
        )
    )
  );

-- ============================================================
-- 2. enforce_job_areas_max トリガー
--    AFTER INSERT で job_id ごと 10 件超を RAISE EXCEPTION
--    SET search_path = public は public.user_role 等の型解決のため必須
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_job_areas_max()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM job_areas WHERE job_id = NEW.job_id) > 10 THEN
    RAISE EXCEPTION 'job_areas exceeds 10 rows per job (job_id=%)', NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_job_areas_max
  AFTER INSERT ON job_areas
  FOR EACH ROW EXECUTE FUNCTION enforce_job_areas_max();

-- ============================================================
-- 3. client_recruit_areas テーブル
--    FK は client_profiles(user_id) (UNIQUE 制約は billing migration で追加済み)
-- ============================================================

CREATE TABLE client_recruit_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES client_profiles(user_id) ON DELETE CASCADE,
  prefecture text NOT NULL,
  municipality text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_recruit_areas_client_id ON client_recruit_areas (client_id);
CREATE INDEX idx_client_recruit_areas_search ON client_recruit_areas (prefecture, municipality);

ALTER TABLE client_recruit_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_recruit_areas_select_all
  ON client_recruit_areas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY client_recruit_areas_owner_write
  ON client_recruit_areas
  FOR ALL
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- ============================================================
-- 4. user_available_areas 拡張
--    - 既存 (user_id, prefecture) 重複を dedupe (最古 id 行を残す)
--    - municipality text NULL カラム追加
--    - UNIQUE NULLS NOT DISTINCT (user_id, prefecture, municipality) 制約
--      Postgres 15+ 構文。NULL 同士も等価扱いとなり「同一県全域行の重複」を防ぐ
--    - (prefecture, municipality) 検索用複合 B-tree
-- ============================================================

DO $$
DECLARE
  dup_groups int;
BEGIN
  SELECT count(*) INTO dup_groups
  FROM (
    SELECT user_id, prefecture
    FROM user_available_areas
    GROUP BY user_id, prefecture
    HAVING count(*) > 1
  ) AS dups;
  IF dup_groups > 0 THEN
    RAISE NOTICE 'user_available_areas duplicate (user_id, prefecture) groups detected: %. Auto-dedupe will keep the oldest row per group.', dup_groups;
  END IF;
END;
$$;

DELETE FROM user_available_areas a
USING user_available_areas b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.prefecture = b.prefecture;

ALTER TABLE user_available_areas ADD COLUMN municipality text;

ALTER TABLE user_available_areas
  ADD CONSTRAINT user_available_areas_unique_tuple
  UNIQUE NULLS NOT DISTINCT (user_id, prefecture, municipality);

CREATE INDEX idx_user_available_areas_search
  ON user_available_areas (prefecture, municipality);

-- ============================================================
-- 5. RPC: replace_user_areas / replace_job_areas / replace_client_recruit_areas
--    すべて SECURITY INVOKER + SET search_path = public で RLS 経由
--    DELETE old + INSERT new を 1 トランザクションで行う
--    p_areas jsonb の構造: [{"prefecture": "東京都", "municipality": "港区"}, ...]
--    municipality は省略 / null / 空文字列を許容 (すべて NULL に正規化)
-- ============================================================

CREATE OR REPLACE FUNCTION replace_user_areas(p_user_id uuid, p_areas jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  DELETE FROM user_available_areas WHERE user_id = p_user_id;
  INSERT INTO user_available_areas (user_id, prefecture, municipality)
  SELECT
    p_user_id,
    (elem->>'prefecture')::text,
    NULLIF(elem->>'municipality', '')
  FROM jsonb_array_elements(p_areas) AS elem;
END;
$$;

CREATE OR REPLACE FUNCTION replace_job_areas(p_job_id uuid, p_areas jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  DELETE FROM job_areas WHERE job_id = p_job_id;
  INSERT INTO job_areas (job_id, prefecture, municipality)
  SELECT
    p_job_id,
    (elem->>'prefecture')::text,
    NULLIF(elem->>'municipality', '')
  FROM jsonb_array_elements(p_areas) AS elem;
END;
$$;

CREATE OR REPLACE FUNCTION replace_client_recruit_areas(p_client_id uuid, p_areas jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  DELETE FROM client_recruit_areas WHERE client_id = p_client_id;
  INSERT INTO client_recruit_areas (client_id, prefecture, municipality)
  SELECT
    p_client_id,
    (elem->>'prefecture')::text,
    NULLIF(elem->>'municipality', '')
  FROM jsonb_array_elements(p_areas) AS elem;
END;
$$;
