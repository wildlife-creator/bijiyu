-- ============================================================
-- 006: complete_registration RPC function
-- Atomically updates user profile, skills, and available areas
-- during onboarding after email verification.
-- ============================================================

CREATE OR REPLACE FUNCTION complete_registration(
  p_user_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_birth_date date,
  p_prefecture text,
  p_company_name text DEFAULT NULL,
  p_skills jsonb DEFAULT '[]'::jsonb,
  p_areas text[] DEFAULT '{}'::text[]
) RETURNS void AS $$
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

  INSERT INTO public.user_available_areas (id, user_id, prefecture)
  SELECT gen_random_uuid(), p_user_id, unnest(p_areas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
