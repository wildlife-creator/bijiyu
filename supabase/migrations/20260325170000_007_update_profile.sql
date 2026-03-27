-- Migration 007: update_profile RPC function
-- Atomically updates users + user_skills + user_qualifications + user_available_areas

CREATE OR REPLACE FUNCTION update_profile(
  p_user_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_prefecture text,
  p_company_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_skills jsonb DEFAULT '[]'::jsonb,
  p_qualifications text[] DEFAULT '{}'::text[],
  p_areas text[] DEFAULT '{}'::text[]
) RETURNS void AS $$
BEGIN
  -- Security: verify caller owns this profile
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: user_id does not match authenticated user';
  END IF;

  -- Update users (updated_at is set by set_updated_at trigger)
  UPDATE public.users SET
    last_name = p_last_name,
    first_name = p_first_name,
    gender = p_gender,
    prefecture = p_prefecture,
    company_name = p_company_name,
    bio = p_bio
  WHERE id = p_user_id;

  -- Replace skills (delete all + insert new, max 3)
  DELETE FROM public.user_skills WHERE user_id = p_user_id;
  INSERT INTO public.user_skills (id, user_id, trade_type, experience_years)
  SELECT
    gen_random_uuid(),
    p_user_id,
    (skill->>'trade_type')::text,
    (skill->>'experience_years')::integer
  FROM jsonb_array_elements(p_skills) AS skill
  LIMIT 3;

  -- Replace qualifications
  DELETE FROM public.user_qualifications WHERE user_id = p_user_id;
  INSERT INTO public.user_qualifications (id, user_id, qualification_name)
  SELECT gen_random_uuid(), p_user_id, unnest(p_qualifications);

  -- Replace available areas
  DELETE FROM public.user_available_areas WHERE user_id = p_user_id;
  INSERT INTO public.user_available_areas (id, user_id, prefecture)
  SELECT gen_random_uuid(), p_user_id, unnest(p_areas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
