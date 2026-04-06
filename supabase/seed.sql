-- ============================================================
-- seed.sql — Playwright テスト用データ
-- ============================================================
-- 実行: supabase db reset で自動投入
-- 前提: マイグレーション 001〜008 が適用済み

-- ============================================================
-- 固定 UUID（テストコードから参照しやすくするため）
-- ============================================================
-- ユーザー
--   contractor:  11111111-1111-1111-1111-111111111111
--   client:      22222222-2222-2222-2222-222222222222
--   staff:       33333333-3333-3333-3333-333333333333
--   admin:       44444444-4444-4444-4444-444444444444
--   contractor2: cc111111-1111-1111-1111-111111111111
--   contractor3: cc222222-2222-2222-2222-222222222222
--   contractor4: cc333333-3333-3333-3333-333333333333
-- 組織
--   org:         55555555-5555-5555-5555-555555555555
-- 発注者2
--   client2:     aabbccdd-1111-2222-3333-444455556666
-- 組織2
--   org2:        aabbccdd-5555-5555-5555-555555555555
-- 案件
--   job1:        66666666-6666-6666-6666-666666666666
--   job2:        77777777-7777-7777-7777-777777777777
-- CLI-010 テスト用応募
--   completed1:  cccccccc-cccc-cccc-cccc-cccccccccc01
--   completed2:  cccccccc-cccc-cccc-cccc-cccccccccc02
--   cancelled:   cccccccc-cccc-cccc-cccc-cccccccccc03

-- ============================================================
-- 1. auth.users（Supabase Auth ユーザー）
-- ============================================================
-- パスワード: testpass123（全ユーザー共通）
-- encrypted_password は crypt('testpass123', gen_salt('bf'))

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  phone,
  phone_change,
  phone_change_token,
  email_change_token_current,
  email_change_confirm_status,
  reauthentication_token,
  is_sso_user
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'contractor@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',    -- confirmation_token
    '',    -- recovery_token
    '',    -- email_change
    '',    -- email_change_token_new
    NULL,  -- phone (unique constraint — must be NULL not empty)
    '',    -- phone_change
    '',    -- phone_change_token
    '',    -- email_change_token_current
    0,     -- email_change_confirm_status
    '',    -- reauthentication_token
    false  -- is_sso_user
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'client@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'staff@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    'aabbccdd-1111-2222-3333-444455556666',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'client2@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    'cc111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'contractor2@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    'cc222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'contractor3@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    'cc333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'contractor4@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  );

-- auth.identities（Supabase Auth が要求する）
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'contractor@test.local', '{"sub":"11111111-1111-1111-1111-111111111111","email":"contractor@test.local"}', 'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'client@test.local',     '{"sub":"22222222-2222-2222-2222-222222222222","email":"client@test.local"}',     'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'staff@test.local',      '{"sub":"33333333-3333-3333-3333-333333333333","email":"staff@test.local"}',      'email', now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'admin@test.local',      '{"sub":"44444444-4444-4444-4444-444444444444","email":"admin@test.local"}',      'email', now(), now(), now()),
  ('aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-1111-2222-3333-444455556666', 'client2@test.local',    '{"sub":"aabbccdd-1111-2222-3333-444455556666","email":"client2@test.local"}',    'email', now(), now(), now()),
  ('cc111111-1111-1111-1111-111111111111', 'cc111111-1111-1111-1111-111111111111', 'contractor2@test.local', '{"sub":"cc111111-1111-1111-1111-111111111111","email":"contractor2@test.local"}', 'email', now(), now(), now()),
  ('cc222222-2222-2222-2222-222222222222', 'cc222222-2222-2222-2222-222222222222', 'contractor3@test.local', '{"sub":"cc222222-2222-2222-2222-222222222222","email":"contractor3@test.local"}', 'email', now(), now(), now()),
  ('cc333333-3333-3333-3333-333333333333', 'cc333333-3333-3333-3333-333333333333', 'contractor4@test.local', '{"sub":"cc333333-3333-3333-3333-333333333333","email":"contractor4@test.local"}', 'email', now(), now(), now());

-- ============================================================
-- 2. public.users（プロフィール情報）
-- auth トリガーで role='contractor' として自動作成済み → UPDATE で上書き
-- ============================================================

-- 受注者
UPDATE public.users SET
  role = 'contractor',
  last_name = '田中',
  first_name = '一郎',
  gender = '男性',
  birth_date = '1990-05-15',
  prefecture = '東京都',
  company_name = '田中建設',
  bio = '大工歴10年。木造住宅を得意としています。',
  identity_verified = true,
  ccus_verified = true
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 発注者
UPDATE public.users SET
  role = 'client',
  last_name = '鈴木',
  first_name = '花子',
  gender = '女性',
  birth_date = '1985-03-20',
  prefecture = '神奈川県',
  company_name = '鈴木工務店株式会社',
  bio = '神奈川県を中心にリフォーム工事を行っています。',
  identity_verified = true,
  ccus_verified = true
WHERE id = '22222222-2222-2222-2222-222222222222';

-- 担当者
UPDATE public.users SET
  role = 'staff',
  last_name = '佐藤',
  first_name = '健太',
  gender = '男性',
  birth_date = '1995-11-10',
  prefecture = '東京都',
  company_name = '鈴木工務店株式会社',
  bio = '担当者として案件管理を行っています。'
WHERE id = '33333333-3333-3333-3333-333333333333';

-- 発注者2（別の発注者）
UPDATE public.users SET
  role = 'client',
  last_name = '山田',
  first_name = '太郎',
  gender = '男性',
  birth_date = '1978-08-12',
  prefecture = '東京都',
  company_name = '山田建設株式会社',
  bio = '東京都内を中心にマンション建設・改修工事を行っています。',
  identity_verified = true,
  ccus_verified = false
WHERE id = 'aabbccdd-1111-2222-3333-444455556666';

-- 管理者
UPDATE public.users SET
  role = 'admin',
  last_name = '管理',
  first_name = '太郎',
  gender = '男性',
  birth_date = '1980-01-01',
  prefecture = '東京都'
WHERE id = '44444444-4444-4444-4444-444444444444';

-- 受注者2（塗装工・左官）
UPDATE public.users SET
  role = 'contractor',
  last_name = '高橋',
  first_name = '美咲',
  gender = '女性',
  birth_date = '1992-07-22',
  prefecture = '神奈川県',
  company_name = NULL,
  bio = '塗装工歴8年。外壁・内壁の塗装を専門にしています。左官工事も対応可能です。',
  identity_verified = true,
  ccus_verified = true
WHERE id = 'cc111111-1111-1111-1111-111111111111';

-- 受注者3（電気工事士・配管工）
UPDATE public.users SET
  role = 'contractor',
  last_name = '渡辺',
  first_name = '大輔',
  gender = '男性',
  birth_date = '1988-02-14',
  prefecture = '東京都',
  company_name = '渡辺電設',
  bio = '電気工事士として15年の経験があります。商業施設・住宅問わず対応可能です。',
  identity_verified = true,
  ccus_verified = false
WHERE id = 'cc222222-2222-2222-2222-222222222222';

-- 受注者4（内装工）— 無料ユーザー、本人確認なし
UPDATE public.users SET
  role = 'contractor',
  last_name = '小林',
  first_name = 'さくら',
  gender = '女性',
  birth_date = '1998-12-03',
  prefecture = '千葉県',
  company_name = NULL,
  bio = '内装工事を中心に活動しています。クロス張り替えが得意です。'
WHERE id = 'cc333333-3333-3333-3333-333333333333';

-- ============================================================
-- 2.5 identity_verifications（本人確認・CCUS 承認済みレコード）
-- identity_verified = true にするなら identity_verifications にも対応レコードを用意する
-- ============================================================

INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('11111111-1111-1111-1111-111111111111', 'ccus', 'dummy/ccus-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'ccus', 'dummy/ccus-doc.png', 'approved', now()),
  ('cc111111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('cc111111-1111-1111-1111-111111111111', 'ccus', 'dummy/ccus-doc.png', 'approved', now()),
  ('cc222222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('aabbccdd-1111-2222-3333-444455556666', 'identity', 'dummy/identity-doc.png', 'approved', now());

-- ============================================================
-- 3. user_skills（受注者のスキル）
-- ============================================================

INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('11111111-1111-1111-1111-111111111111', '大工', 10),
  ('11111111-1111-1111-1111-111111111111', '内装工', 5),
  ('cc111111-1111-1111-1111-111111111111', '塗装工', 8),
  ('cc111111-1111-1111-1111-111111111111', '左官', 4),
  ('cc222222-2222-2222-2222-222222222222', '電気工事士', 15),
  ('cc222222-2222-2222-2222-222222222222', '配管工', 6),
  ('cc333333-3333-3333-3333-333333333333', '内装工', 3);

-- ============================================================
-- 4. user_qualifications（受注者の資格）
-- ============================================================

INSERT INTO user_qualifications (user_id, qualification_name) VALUES
  ('11111111-1111-1111-1111-111111111111', '一級建築士'),
  ('11111111-1111-1111-1111-111111111111', '二級建築施工管理技士'),
  ('cc111111-1111-1111-1111-111111111111', '一級塗装技能士'),
  ('cc222222-2222-2222-2222-222222222222', '第二種電気工事士'),
  ('cc222222-2222-2222-2222-222222222222', '一級電気工事施工管理技士');

-- ============================================================
-- 5. user_available_areas（受注者の対応可能エリア）
-- ============================================================

INSERT INTO user_available_areas (user_id, prefecture) VALUES
  ('11111111-1111-1111-1111-111111111111', '東京都'),
  ('11111111-1111-1111-1111-111111111111', '神奈川県'),
  ('11111111-1111-1111-1111-111111111111', '千葉県'),
  ('cc111111-1111-1111-1111-111111111111', '神奈川県'),
  ('cc111111-1111-1111-1111-111111111111', '東京都'),
  ('cc222222-2222-2222-2222-222222222222', '東京都'),
  ('cc222222-2222-2222-2222-222222222222', '埼玉県'),
  ('cc222222-2222-2222-2222-222222222222', '千葉県'),
  ('cc333333-3333-3333-3333-333333333333', '千葉県'),
  ('cc333333-3333-3333-3333-333333333333', '東京都');

-- ============================================================
-- 6. subscriptions（発注者のサブスクリプション）
-- ============================================================

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('22222222-2222-2222-2222-222222222222', 'corporate', 'active', now(), now() + interval '30 days'),
  ('aabbccdd-1111-2222-3333-444455556666', 'basic', 'active', now(), now() + interval '30 days');

-- ============================================================
-- 7. organizations + organization_members
-- ============================================================

-- 組織（発注者がオーナー）
INSERT INTO organizations (id, name, owner_id) VALUES
  ('55555555-5555-5555-5555-555555555555', '鈴木工務店株式会社', '22222222-2222-2222-2222-222222222222'),
  ('aabbccdd-5555-5555-5555-555555555555', '山田建設株式会社', 'aabbccdd-1111-2222-3333-444455556666');

-- メンバー: 発注者 = owner、担当者 = staff
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'staff'),
  ('aabbccdd-5555-5555-5555-555555555555', 'aabbccdd-1111-2222-3333-444455556666', 'owner');

-- ============================================================
-- 8. client_profiles（発注者プロフィール）
-- ============================================================

INSERT INTO client_profiles (user_id, display_name, recruit_area, recruit_job_types, working_way, employee_scale, message, language) VALUES
  ('22222222-2222-2222-2222-222222222222', '鈴木工務店', '{"神奈川県","東京都"}', '{"大工","内装工","電気工事士"}', '1日から可', 15, '一緒に働いてくれる職人さんを募集しています。', '日本語'),
  ('aabbccdd-1111-2222-3333-444455556666', '山田建設', '{"東京都","埼玉県"}', '{"大工","鉄筋工","型枠大工"}', '長期歓迎', 30, '大規模建築を中心に手がけています。職人さん大募集中です。', '日本語・英語');

-- ============================================================
-- 9. jobs（テスト用案件）
-- ============================================================

INSERT INTO jobs (id, owner_id, organization_id, title, description, prefecture, address, trade_type, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '木造住宅の内装リフォーム工事',
    '横浜市内の木造住宅のリフォーム工事です。内装の壁紙張り替え、フローリング張り替えをお願いします。',
    '神奈川県',
    '横浜市中区',
    '内装工',
    2,
    25000,
    20000,
    CURRENT_DATE + interval '7 days',
    CURRENT_DATE + interval '14 days',
    CURRENT_DATE - interval '3 days',
    CURRENT_DATE + interval '30 days',
    'open'
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '店舗改装工事の大工作業',
    '東京都内の店舗改装工事です。木工事全般をお願いします。経験豊富な方を希望します。',
    '東京都',
    '渋谷区',
    '大工',
    1,
    30000,
    25000,
    CURRENT_DATE + interval '14 days',
    CURRENT_DATE + interval '21 days',
    CURRENT_DATE - interval '3 days',
    CURRENT_DATE + interval '30 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888881',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '千葉県戸建て新築 大工工事',
    '千葉県船橋市の戸建て新築工事です。木造軸組工法の大工作業全般をお願いします。',
    '千葉県',
    '船橋市',
    '大工',
    2,
    28000,
    22000,
    CURRENT_DATE + interval '10 days',
    CURRENT_DATE + interval '30 days',
    CURRENT_DATE - interval '1 day',
    CURRENT_DATE + interval '20 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888882',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '東京都内マンション内装仕上げ工事',
    '東京都品川区のマンション内装仕上げ工事です。クロス張り替え・床材施工をお願いします。',
    '東京都',
    '品川区',
    '内装工',
    3,
    24000,
    18000,
    CURRENT_DATE + interval '5 days',
    CURRENT_DATE + interval '20 days',
    CURRENT_DATE - interval '2 days',
    CURRENT_DATE + interval '25 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888883',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '神奈川県オフィスビル内装改修',
    '川崎市のオフィスビル内装改修工事です。パーティション設置と天井仕上げをお願いします。',
    '神奈川県',
    '川崎市',
    '内装工',
    2,
    26000,
    20000,
    CURRENT_DATE + interval '7 days',
    CURRENT_DATE + interval '28 days',
    CURRENT_DATE - interval '5 days',
    CURRENT_DATE + interval '14 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888884',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '大阪市商業施設 電気工事',
    '大阪市中央区の商業施設電気工事です。照明設備の更新作業をお願いします。',
    '大阪府',
    '大阪市中央区',
    '電気工事士',
    1,
    35000,
    30000,
    CURRENT_DATE + interval '14 days',
    CURRENT_DATE + interval '28 days',
    CURRENT_DATE - interval '1 day',
    CURRENT_DATE + interval '21 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888885',
    '33333333-3333-3333-3333-333333333333',
    '55555555-5555-5555-5555-555555555555',
    '東京都内 RC造マンション躯体工事',
    '東京都江東区のRC造マンション新築工事です。型枠・鉄筋工事をお願いします。',
    '東京都',
    '江東区',
    '型枠大工',
    3,
    32000,
    26000,
    CURRENT_DATE + interval '10 days',
    CURRENT_DATE + interval '40 days',
    CURRENT_DATE - interval '2 days',
    CURRENT_DATE + interval '18 days',
    'open'
  ),
  (
    '88888888-8888-8888-8888-888888888886',
    '33333333-3333-3333-3333-333333333333',
    '55555555-5555-5555-5555-555555555555',
    '横浜市 住宅塗装工事',
    '横浜市港北区の戸建て住宅の外壁塗装工事です。足場設置から塗装仕上げまでお願いします。',
    '神奈川県',
    '横浜市港北区',
    '塗装工',
    2,
    28000,
    22000,
    CURRENT_DATE + interval '14 days',
    CURRENT_DATE + interval '28 days',
    CURRENT_DATE - interval '1 day',
    CURRENT_DATE + interval '20 days',
    'open'
  ),
  -- 別の発注者（山田建設）が掲載する案件
  (
    'aabbccdd-6666-6666-6666-666666666661',
    'aabbccdd-1111-2222-3333-444455556666',
    'aabbccdd-5555-5555-5555-555555555555',
    '東京都 大型マンション新築 大工工事',
    '東京都世田谷区の大型マンション新築工事です。内部造作工事全般をお願いします。長期案件です。',
    '東京都',
    '世田谷区',
    '大工',
    4,
    32000,
    26000,
    CURRENT_DATE + interval '7 days',
    CURRENT_DATE + interval '60 days',
    CURRENT_DATE - interval '3 days',
    CURRENT_DATE + interval '25 days',
    'open'
  ),
  (
    'aabbccdd-6666-6666-6666-666666666662',
    'aabbccdd-1111-2222-3333-444455556666',
    'aabbccdd-5555-5555-5555-555555555555',
    '埼玉県 商業施設 鉄筋工事',
    'さいたま市の商業施設建設に伴う鉄筋工事です。経験者を優遇します。',
    '埼玉県',
    'さいたま市',
    '鉄筋工',
    3,
    30000,
    24000,
    CURRENT_DATE + interval '10 days',
    CURRENT_DATE + interval '45 days',
    CURRENT_DATE - interval '2 days',
    CURRENT_DATE + interval '20 days',
    'open'
  ),
  (
    'aabbccdd-6666-6666-6666-666666666663',
    'aabbccdd-1111-2222-3333-444455556666',
    'aabbccdd-5555-5555-5555-555555555555',
    '東京都 オフィスビル内装工事',
    '東京都千代田区のオフィスビル内装改修工事です。壁紙・床材の張り替え作業をお願いします。',
    '東京都',
    '千代田区',
    '内装工',
    2,
    27000,
    21000,
    CURRENT_DATE + interval '5 days',
    CURRENT_DATE + interval '20 days',
    CURRENT_DATE - interval '1 day',
    CURRENT_DATE + interval '18 days',
    'open'
  );

-- ============================================================
-- 10. job_images（案件画像テストデータ）
-- ============================================================

-- 画像なし: 全カードがビジ友ロゴのプレースホルダー表示で統一
-- 実際の画像はユーザーがアップロードした時のみ表示される

-- ============================================================
-- 11. available_schedules（空き日程テストデータ）
-- ============================================================

INSERT INTO available_schedules (user_id, start_date, end_date, note) VALUES
  ('11111111-1111-1111-1111-111111111111', CURRENT_DATE + interval '7 days', CURRENT_DATE + interval '14 days', NULL),
  ('11111111-1111-1111-1111-111111111111', CURRENT_DATE + interval '21 days', CURRENT_DATE + interval '28 days', NULL),
  ('11111111-1111-1111-1111-111111111111', CURRENT_DATE + interval '35 days', CURRENT_DATE + interval '42 days', NULL),
  ('cc111111-1111-1111-1111-111111111111', CURRENT_DATE + interval '5 days', CURRENT_DATE + interval '20 days', NULL),
  ('cc222222-2222-2222-2222-222222222222', CURRENT_DATE + interval '10 days', CURRENT_DATE + interval '30 days', NULL),
  ('cc333333-3333-3333-3333-333333333333', CURRENT_DATE + interval '3 days', CURRENT_DATE + interval '10 days', NULL);

-- ============================================================
-- 12. user_reviews（発注者評価テストデータ）
-- ============================================================
-- Note: user_reviews requires application_id. Create test applications first.

INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '7 days', 'accepted', CURRENT_DATE + interval '10 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '14 days', 'accepted', CURRENT_DATE + interval '21 days');

-- Matching E2E test data: applied application for cancel test (contractor applies to client2's job)
-- Need a job from client2 for the contractor to apply to
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date, prefecture)
VALUES ('88888888-8888-8888-8888-888888888888', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555', 'E2Eテスト用案件（キャンセルテスト）', 'マッチングE2Eテスト用', '塗装', 2, 'open', 15000, 20000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30, '神奈川県');

INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date, message) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 1, 'スポット', CURRENT_DATE + interval '30 days', 'accepted', CURRENT_DATE + interval '30 days', 'E2Eテスト用応募です（キャンセルテスト）');

-- Matching E2E test data: applied applications for client's accept/reject test
-- 高橋美咲が鈴木工務店の案件に応募（発注可否テスト用）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, message) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', '66666666-6666-6666-6666-666666666666', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '20 days', 'applied', '塗装工事の経験を活かして内装工事にも挑戦したいです。'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', '77777777-7777-7777-7777-777777777777', 'cc222222-2222-2222-2222-222222222222', 1, 'スポット', CURRENT_DATE + interval '14 days', 'applied', '電気配線関連の作業を担当できます。'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe', '88888888-8888-8888-8888-888888888881', 'cc333333-3333-3333-3333-333333333333', 1, '常勤', CURRENT_DATE + interval '12 days', 'applied', '千葉県在住なので通いやすいです。よろしくお願いします。');

-- contractor1 の1件目のみ評価済み（発注済み表示）、2件目は未評価（評価登録未入力表示）
INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, rating_again, rating_follows_instructions, rating_punctual, rating_speed, rating_quality, rating_has_tools, comment) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', '丁寧な仕事でした。また依頼したいです。');

-- ============================================================
-- 12.5 CLI-010〜012 / CLI-028 テスト用データ
-- ============================================================
-- 取引完了: contractor2 (cc111111) の completed 応募 × 2件（CLI-028 で同一 reviewee の複数評価をテスト）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '88888888-8888-8888-8888-888888888882', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '30 days', 'completed', CURRENT_DATE - interval '25 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '88888888-8888-8888-8888-888888888883', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '20 days', 'completed', CURRENT_DATE - interval '15 days');

-- キャンセル・お断り: contractor3 (cc222222) の cancelled 応募
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc03', '77777777-7777-7777-7777-777777777777', 'cc222222-2222-2222-2222-222222222222', 1, 'スポット', CURRENT_DATE + interval '14 days', 'cancelled');

-- user_reviews: contractor2 への評価（CLI-028 テスト用、同一 reviewee に2件）
INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, rating_again, rating_follows_instructions, rating_punctual, rating_speed, rating_quality, rating_has_tools, comment) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', 'good', 'good', 'good', 'good', 'good', 'good', '作業が丁寧で、時間通りに来てくれました。道具も揃っていて安心でした。'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', 'good', 'good', 'good', 'bad', 'good', 'good', '丁寧な作業でしたが、もう少しスピードが欲しかったです。');

-- ============================================================
-- 13. Storage バケット（マイグレーション 008 で作成済みだが、seed でも冪等に作成）
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('job-attachments', 'job-attachments', true),
  ('identity-documents', 'identity-documents', false),
  ('ccus-documents', 'ccus-documents', false),
  ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;
