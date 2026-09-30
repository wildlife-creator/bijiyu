-- ============================================================
-- プロフィール編集（COM-002）の保存を 1 トランザクションにまとめる RPC
--
-- 以前の updateProfileAction は users UPDATE → user_skills DELETE/INSERT →
-- user_qualifications DELETE/INSERT → replace_user_areas → メール変更 を別々の
-- リクエストで行っており、途中で失敗すると「氏名だけ保存され職種が消えた」のような
-- 一部だけ保存された状態が残りえた（DELETE のエラーも見ていなかった）。
-- ここでは DB に書く部分を 1 つの関数にまとめ、どこかで失敗したら全部取り消す。
--
-- - SECURITY INVOKER: 権限は呼び出した会員のまま（RLS・guard トリガーがそのまま効く）。
--   以前の PostgREST 経由の書き込みと同じ権限モデルで、増える権限は無い
-- - 対象は auth.uid() の行だけ。user_id を引数で受け取らない（CLAUDE.md
--   「SECURITY DEFINER 関数で引数の user_id を信じない」と同じ考え方）
-- - マスタ（職種・資格・スキル・エリア）の検証は従来どおり Server Action 側で行う
-- - メールアドレスの変更は Supabase Auth の API のため、この関数の外（Server Action）で行う
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_last_name text,
  p_first_name text,
  p_gender text,
  p_birth_date date,
  p_prefecture text,
  p_municipality text,
  p_company_name text,
  p_bio text,
  p_skill_tags text[],
  p_skills jsonb,
  p_qualifications text[],
  p_areas jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'update_my_profile: not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users SET
    last_name = p_last_name,
    first_name = p_first_name,
    gender = p_gender,
    birth_date = p_birth_date,
    prefecture = p_prefecture,
    municipality = NULLIF(p_municipality, ''),
    company_name = p_company_name,
    bio = p_bio,
    skill_tags = COALESCE(p_skill_tags, '{}'::text[])
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_my_profile: user row not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.user_skills WHERE user_id = v_uid;
  INSERT INTO public.user_skills (user_id, trade_type, experience_years)
  SELECT
    v_uid,
    skill->>'trade_type',
    (skill->>'experience_years')::integer
  FROM jsonb_array_elements(COALESCE(p_skills, '[]'::jsonb)) AS skill;

  DELETE FROM public.user_qualifications WHERE user_id = v_uid;
  INSERT INTO public.user_qualifications (user_id, qualification_name)
  SELECT v_uid, q
  FROM unnest(COALESCE(p_qualifications, '{}'::text[])) AS q;

  PERFORM public.replace_user_areas(v_uid, COALESCE(p_areas, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, date, text, text, text, text, text[], jsonb, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, date, text, text, text, text, text[], jsonb, text[], jsonb) TO authenticated;
