-- ============================================================
-- residence-municipality: お住まい（個人居住地）に市区町村を追加
--
-- 背景:
--   従来 users.prefecture は「個人住所として都道府県まで」据え置く設計だった
--   （プライバシー配慮）。本変更で「都道府県 + 市区町村 1 つ」まで登録できる
--   ようにする。市区町村は任意（NULL 許容）。既存ユーザーは全員 NULL のまま
--   （都道府県のみ表示）で後方互換。
--
--   ※「対応可能エリア」(user_available_areas: 複数県・複数市区町村) とは別概念。
--     こちらは個人の居住地（1 県 + 任意で 1 市区町村）。
--
-- 変更内容:
--   1. users.municipality カラム追加（text, NULL 許容）
--   2. complete_registration RPC に p_municipality を追加し users.municipality を更新
--      （signature 変更のため DROP + CREATE。CLAUDE.md SECURITY DEFINER ルールに従い
--       SET search_path = public を維持）
-- ============================================================

-- 1. カラム追加
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS municipality text;

COMMENT ON COLUMN public.users.municipality IS
  'お住まいの市区町村（任意・1 つ）。prefecture とセットで個人居住地を表す。対応可能エリア(user_available_areas)とは別概念。';

-- 2. complete_registration RPC に p_municipality を追加
DROP FUNCTION IF EXISTS public.complete_registration(
  uuid, text, text, text, date, text, text, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION complete_registration(
  p_user_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_birth_date date,
  p_prefecture text,
  p_company_name text DEFAULT NULL,
  p_municipality text DEFAULT NULL,
  p_skills jsonb DEFAULT '[]'::jsonb,
  p_areas jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    last_name = p_last_name,
    first_name = p_first_name,
    gender = p_gender,
    birth_date = p_birth_date,
    prefecture = p_prefecture,
    municipality = NULLIF(p_municipality, ''),
    company_name = p_company_name,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.user_skills (id, user_id, trade_type, experience_years)
  SELECT
    gen_random_uuid(),
    p_user_id,
    (skill->>'trade_type')::text,
    (skill->>'experience_years')::integer
  FROM jsonb_array_elements(p_skills) AS skill
  LIMIT 3;

  INSERT INTO public.user_available_areas (id, user_id, prefecture, municipality)
  SELECT
    gen_random_uuid(),
    p_user_id,
    (elem->>'prefecture')::text,
    NULLIF(elem->>'municipality', '')
  FROM jsonb_array_elements(p_areas) AS elem;
END;
$$;
