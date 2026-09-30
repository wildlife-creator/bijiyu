-- pgTAP: update_my_profile（COM-002 プロフィール保存の 1 トランザクション化）
-- 本人の行だけを更新でき、途中で失敗したら全部取り消されることを確認する
BEGIN;
SELECT plan(14);

-- seed と重ならないテスト専用 UUID
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('c7c7c7c7-0930-4a00-8000-000000000001', 'ump-a@test.com', crypt('password123', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('c7c7c7c7-0930-4a00-8000-000000000002', 'ump-b@test.com', crypt('password123', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW());

-- B の既存データ（A の保存で消えないことを確認する）
INSERT INTO public.user_skills (user_id, trade_type, experience_years)
VALUES ('c7c7c7c7-0930-4a00-8000-000000000002', 'B の職種', 1);

-- ------------------------------------------------------------
-- 会員 A として保存
-- ------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"c7c7c7c7-0930-4a00-8000-000000000001","role":"authenticated"}';

SELECT lives_ok(
  $$SELECT public.update_my_profile(
      '山田', '太郎', '男性', '1990-01-15'::date, '東京都', '港区', 'テスト工務店', '自己紹介',
      ARRAY['型枠設置工']::text[],
      '[{"trade_type":"建築/躯体｜大工","experience_years":5},{"trade_type":"建築/躯体｜鳶","experience_years":2}]'::jsonb,
      ARRAY['一級建築士']::text[],
      '[{"prefecture":"東京都","municipality":null},{"prefecture":"神奈川県","municipality":"横浜市西区"}]'::jsonb
  )$$,
  '会員は自分のプロフィールを保存できる'
);

RESET role;
RESET request.jwt.claims;

SELECT is((SELECT last_name || first_name FROM public.users WHERE id = 'c7c7c7c7-0930-4a00-8000-000000000001'), '山田太郎', '氏名が保存される');
SELECT is((SELECT municipality FROM public.users WHERE id = 'c7c7c7c7-0930-4a00-8000-000000000001'), '港区', 'お住まいの市区町村が保存される');
SELECT is((SELECT skill_tags FROM public.users WHERE id = 'c7c7c7c7-0930-4a00-8000-000000000001'), ARRAY['型枠設置工']::text[], '保有スキルが保存される');
SELECT is((SELECT count(*)::int FROM public.user_skills WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000001'), 2, '職種が 2 件保存される');
SELECT is((SELECT count(*)::int FROM public.user_qualifications WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000001'), 1, '資格が 1 件保存される');
SELECT is((SELECT count(*)::int FROM public.user_available_areas WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000001'), 2, '対応エリアが 2 件保存される');

-- ------------------------------------------------------------
-- 途中で失敗したら全部取り消される（職種の 2 件目が NOT NULL 違反）
-- ------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"c7c7c7c7-0930-4a00-8000-000000000001","role":"authenticated"}';

SELECT throws_ok(
  $$SELECT public.update_my_profile(
      '失敗', '花子', '女性', '1991-02-02'::date, '大阪府', '', NULL, NULL,
      '{}'::text[],
      '[{"trade_type":"建築/躯体｜大工","experience_years":1},{"experience_years":1}]'::jsonb,
      '{}'::text[],
      '[]'::jsonb
  )$$,
  '23502',
  NULL,
  '職種の保存で失敗すると例外になる'
);

RESET role;
RESET request.jwt.claims;

SELECT is((SELECT last_name FROM public.users WHERE id = 'c7c7c7c7-0930-4a00-8000-000000000001'), '山田', '失敗したとき氏名は元のまま（一部だけ保存されない）');
SELECT is((SELECT count(*)::int FROM public.user_skills WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000001'), 2, '失敗したとき職種は元のまま');
SELECT is((SELECT count(*)::int FROM public.user_available_areas WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000001'), 2, '失敗したとき対応エリアは元のまま');

-- ------------------------------------------------------------
-- 他の会員のデータには触れない
-- ------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.user_skills WHERE user_id = 'c7c7c7c7-0930-4a00-8000-000000000002'), 1, '他の会員の職種は消えない');

-- ------------------------------------------------------------
-- ログインしていない呼び出しは拒否される
-- ------------------------------------------------------------
SET LOCAL role TO anon;
SELECT throws_ok(
  $$SELECT public.update_my_profile('x','y','男性','1990-01-01'::date,'東京都',NULL,NULL,NULL,'{}'::text[],'[]'::jsonb,'{}'::text[],'[]'::jsonb)$$,
  '42501',
  NULL,
  '未ログイン（anon）は実行できない'
);
RESET role;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.update_my_profile('x','y','男性','1990-01-01'::date,'東京都',NULL,NULL,NULL,'{}'::text[],'[]'::jsonb,'{}'::text[],'[]'::jsonb)$$,
  '42501',
  NULL,
  'ユーザー ID の無いセッションは拒否される'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
