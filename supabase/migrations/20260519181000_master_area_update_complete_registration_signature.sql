-- ============================================================
-- master-area Phase 4.5 追加マイグレーション
-- complete_registration RPC の signature を p_areas text[] → p_areas jsonb に変更
--
-- 設計判断:
--   - 関数シグネチャ (型) 変更のため DROP + CREATE が必須 (CREATE OR REPLACE では不可)
--   - 内部 INSERT を unnest(text[]) から jsonb_array_elements(p_areas) +
--     (elem->>'prefecture') + NULLIF(elem->>'municipality', '') に置換
--   - 他のパラメータ・SECURITY DEFINER は維持
--   - SET search_path = public を追加 (CLAUDE.md SECURITY DEFINER ルール)
--
-- 適用後の Server Action 側変更 (master-area Phase 4.5 同コミット):
--   completeRegistrationAction が p_areas に AreaTuple[] を JS array としてそのまま
--   渡す。Supabase JS SDK が jsonb 変換を自動で行うため JSON.stringify 不要。
--
-- 関連 spec: .kiro/specs/master-area/tasks.md Task 4.5
-- ============================================================

DROP FUNCTION IF EXISTS public.complete_registration(
  uuid, text, text, text, date, text, text, jsonb, text[]
);

CREATE OR REPLACE FUNCTION complete_registration(
  p_user_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_birth_date date,
  p_prefecture text,
  p_company_name text DEFAULT NULL,
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
