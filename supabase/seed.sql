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
--   staff-admin: ee111111-1111-1111-1111-111111111111  (org_role=admin)
-- 組織2
--   org2:        aabbccdd-5555-5555-5555-555555555555
-- 案件
--   job1:        66666666-6666-6666-6666-666666666666
--   job2:        77777777-7777-7777-7777-777777777777
-- 発注者作業報告テスト用
--   report_app:   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac
-- CLI-010 テスト用応募
--   completed1:  cccccccc-cccc-cccc-cccc-cccccccccc01
--   completed2:  cccccccc-cccc-cccc-cccc-cccccccccc02
--   cancelled:   cccccccc-cccc-cccc-cccc-cccccccccc03
-- スカウト連携テスト用
--   scout_thread: eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01
--   scout_msg:    ffffffff-ffff-ffff-ffff-ffffffffffff
--   scout_app:    dddddddd-dddd-dddd-dddd-dddddddddd01
--   scout_job:    88888888-8888-8888-8888-888888888899
-- メッセージテスト用スレッド
--   msg_thread_org_con2:  eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02
--   msg_thread_org_con3:  eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03
--   msg_thread_org_con4:  eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04
--   msg_thread_indiv_con: eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05

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
  ),
  (
    'dd111111-1111-2222-3333-444455556666',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'individual-client@test.local',
    crypt('testpass123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', '', NULL, '', '', '', 0, '', false
  ),
  (
    'ee111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'staff-admin@test.local',
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
  ('cc333333-3333-3333-3333-333333333333', 'cc333333-3333-3333-3333-333333333333', 'contractor4@test.local', '{"sub":"cc333333-3333-3333-3333-333333333333","email":"contractor4@test.local"}', 'email', now(), now(), now()),
  ('dd111111-1111-2222-3333-444455556666', 'dd111111-1111-2222-3333-444455556666', 'individual-client@test.local', '{"sub":"dd111111-1111-2222-3333-444455556666","email":"individual-client@test.local"}', 'email', now(), now(), now()),
  ('ee111111-1111-1111-1111-111111111111', 'ee111111-1111-1111-1111-111111111111', 'staff-admin@test.local', '{"sub":"ee111111-1111-1111-1111-111111111111","email":"staff-admin@test.local"}', 'email', now(), now(), now());

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

-- 担当者（org_role = staff）
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

-- 組織管理者（org_role = admin、users.role = staff）
UPDATE public.users SET
  role = 'staff',
  last_name = '伊藤',
  first_name = '真理',
  gender = '女性',
  birth_date = '1992-07-25',
  prefecture = '神奈川県',
  company_name = '鈴木工務店株式会社',
  bio = '組織管理者として担当者の管理を行っています。'
WHERE id = 'ee111111-1111-1111-1111-111111111111';

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

-- 個人発注者（組織なし）— 個人発注者様向けプラン
UPDATE public.users SET
  role = 'client',
  last_name = '中村',
  first_name = '由美',
  gender = '女性',
  birth_date = '1988-07-22',
  prefecture = '埼玉県',
  company_name = '中村リフォーム',
  bio = '個人で小規模リフォームの発注をしています。',
  identity_verified = true,
  ccus_verified = false
WHERE id = 'dd111111-1111-2222-3333-444455556666';

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
  ('aabbccdd-1111-2222-3333-444455556666', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('dd111111-1111-2222-3333-444455556666', 'identity', 'dummy/identity-doc.png', 'approved', now());

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
  ('aabbccdd-1111-2222-3333-444455556666', 'small', 'active', now(), now() + interval '30 days'),
  ('dd111111-1111-2222-3333-444455556666', 'individual', 'active', now(), now() + interval '30 days');

-- ============================================================
-- 7. organizations + organization_members
-- ============================================================

-- 組織（発注者がオーナー）
-- 発注者表示名は client_profiles.display_name に一本化（organization spec Task 2.7）
-- organizations.name は Phase 3（Task 19）で DROP COLUMN 予定
INSERT INTO organizations (id, owner_id) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222'),
  ('aabbccdd-5555-5555-5555-555555555555', 'aabbccdd-1111-2222-3333-444455556666');

-- メンバー: 発注者 = owner、組織管理者 = admin、担当者 = staff（代理アカウント）
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'owner', false),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'staff', true),
  ('55555555-5555-5555-5555-555555555555', 'ee111111-1111-1111-1111-111111111111', 'admin', false),
  ('aabbccdd-5555-5555-5555-555555555555', 'aabbccdd-1111-2222-3333-444455556666', 'owner', false);

-- ============================================================
-- 8. client_profiles（発注者プロフィール）
-- ============================================================

-- 発注者表示名を client_profiles.display_name に一本化（organization spec）
-- - display_name は旧 organizations.name を継承（鈴木工務店株式会社 / 山田建設株式会社）
-- - address は CLI-020/021 の住所表示テスト用に 2 件設定
INSERT INTO client_profiles (user_id, display_name, address, recruit_area, recruit_job_types, working_way, employee_scale, message, language) VALUES
  ('22222222-2222-2222-2222-222222222222', '鈴木工務店株式会社', '東京都墨田区向島1-2-3', '{"神奈川県","東京都"}', '{"大工","内装工","電気工事士"}', '1日から可', 15, '一緒に働いてくれる職人さんを募集しています。', '日本語'),
  ('aabbccdd-1111-2222-3333-444455556666', '山田建設株式会社', '埼玉県さいたま市大宮区4-5-6', '{"東京都","埼玉県"}', '{"大工","鉄筋工","型枠大工"}', '長期歓迎', 30, '大規模建築を中心に手がけています。職人さん大募集中です。', '日本語・英語'),
  ('dd111111-1111-2222-3333-444455556666', '中村リフォーム', NULL, '{"埼玉県","東京都"}', '{"大工","内装工"}', '1日から可', 1, '小規模リフォームの発注をしています。', '日本語');

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

-- 個人発注者の案件（organization_id なし）
INSERT INTO jobs (id, owner_id, organization_id, title, description, prefecture, address, trade_type, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    '99999999-9999-9999-9999-999999999999',
    'dd111111-1111-2222-3333-444455556666',
    NULL,
    '自宅キッチンリフォーム',
    '埼玉県の自宅キッチンのリフォーム工事です。',
    '埼玉県',
    'さいたま市大宮区',
    '内装工',
    1,
    25000,
    20000,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    CURRENT_DATE,
    CURRENT_DATE + 60,
    'open'
  );

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

-- E2Eテスト用: 発注者作業報告テスト用応募（受注者3 → 東京マンション内装、accepted）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', '88888888-8888-8888-8888-888888888882', 'cc222222-2222-2222-2222-222222222222', 1, '常勤', CURRENT_DATE + interval '5 days', 'accepted', CURRENT_DATE + interval '7 days');

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
-- 14. スカウト経由応募テスト用データ（E2E: scout → application flow）
-- ============================================================
-- スレッド: client(22222222) → contractor(11111111) のスカウトスレッド
-- organization_id は client の組織 (55555555)
INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'scout', '55555555-5555-5555-5555-555555555555');

-- スカウトメッセージ: client が contractor に job1(66666666) のスカウトを送信（受諾済み）
INSERT INTO messages (id, thread_id, sender_id, body, job_id, is_scout, scout_status) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '22222222-2222-2222-2222-222222222222', '塗装の経験が豊富な職人さんを探しています。ぜひご応募ください。', '66666666-6666-6666-6666-666666666666', true, 'accepted');

-- スカウト経由の応募: contractor が client2 の案件（88888888-...-888888888884）にスカウト経由で応募
-- 新しい案件を1件追加（スカウト応募テスト専用）
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date, prefecture)
VALUES ('88888888-8888-8888-8888-888888888899', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'スカウトテスト用案件（内装工事）', 'スカウト経由応募のE2Eテスト用案件', '内装工', 2, 'open', 20000, 25000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30, '東京都');

-- スカウト経由応募（scout_message_id 付き）
-- dddddddd-dddd-dddd-dddd-dddddddddd01: applied 状態 → CLI-007 / CLI-007B / CLI-008 のバッジ表示テスト用
-- dddddddd-dddd-dddd-dddd-dddddddddd02: accepted 状態 → CLI-010 / CLI-007B / CLI-011 のバッジ表示テスト用
--   （CLI-010 は applied を含まないため、accepted のスカウト応募が必要）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, scout_message_id) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '88888888-8888-8888-8888-888888888899', '11111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '14 days', 'applied', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '88888888-8888-8888-8888-888888888899', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '21 days', 'accepted', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

-- 応募フォーム表示テスト用案件（contractor の職種「内装工」+エリア「東京都」に合致、未応募）
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_type, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date, prefecture)
VALUES ('88888888-8888-8888-8888-888888888898', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555', '応募フォームテスト用案件', 'E2Eテスト用', '内装工', 1, 'open', 18000, 22000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30, '東京都');

-- ============================================================
-- 15. メッセージ機能テスト用スレッド＆メッセージ
-- ============================================================
-- 鈴木工務店(org) ↔ 受注者2(contractor2): 通常メッセージ
INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', 'message', '55555555-5555-5555-5555-555555555555'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03', '22222222-2222-2222-2222-222222222222', 'cc222222-2222-2222-2222-222222222222', 'message', '55555555-5555-5555-5555-555555555555'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04', '22222222-2222-2222-2222-222222222222', 'cc333333-3333-3333-3333-333333333333', 'message', '55555555-5555-5555-5555-555555555555');

-- 個人発注者(individual-client) ↔ 受注者1(contractor): 通常メッセージ（組織なし）
INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05', 'dd111111-1111-2222-3333-444455556666', '11111111-1111-1111-1111-111111111111', 'message', NULL);

-- サンプルメッセージ（各スレッドに2〜3通、最終メッセージの日時を変えて一覧の並び順を確認可能に）

-- スレッド02: 鈴木工務店 ↔ 受注者2（高橋美咲）
INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', '22222222-2222-2222-2222-222222222222', '高橋さん、先日はお疲れ様でした。次の現場のご相談をしたいのですが。', false, false, now() - interval '3 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', 'cc111111-1111-1111-1111-111111111111', 'ありがとうございます。ぜひお話を聞かせてください。', false, false, now() - interval '2 days 23 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', '22222222-2222-2222-2222-222222222222', '来週の月曜日に横浜の現場で打ち合わせはいかがでしょうか？', false, false, now() - interval '2 days');

-- スレッド03: 鈴木工務店 ↔ 受注者3（渡辺大輔）
INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03', '22222222-2222-2222-2222-222222222222', '渡辺さん、電気工事の件でご連絡です。品川の現場について詳細をお送りします。', false, false, now() - interval '1 day'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03', 'cc222222-2222-2222-2222-222222222222', '承知しました。詳細を確認します。', false, false, now() - interval '23 hours');

-- スレッド04: 鈴木工務店 ↔ 受注者4（小林さくら）— 未読メッセージあり
INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04', '22222222-2222-2222-2222-222222222222', '小林さん、内装工事の案件のご案内です。', false, false, now() - interval '5 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04', 'cc333333-3333-3333-3333-333333333333', 'ありがとうございます。内容を確認いたします。', false, false, now() - interval '4 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04', '22222222-2222-2222-2222-222222222222', '確認できましたらご連絡ください。よろしくお願いします。', false, false, now() - interval '3 hours');

-- スレッド05: 個人発注者 ↔ 受注者1（田中一郎）
INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05', 'dd111111-1111-2222-3333-444455556666', '田中さん、キッチンリフォームの件でご相談があります。', false, false, now() - interval '6 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05', '11111111-1111-1111-1111-111111111111', 'はい、お気軽にどうぞ。どのような工事をご検討ですか？', false, false, now() - interval '5 hours 30 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05', 'dd111111-1111-2222-3333-444455556666', '壁紙の張り替えとフローリングの交換を考えています。見積もりをお願いできますか？', false, false, now() - interval '5 hours');

-- updated_at をスレッドごとに更新（一覧の並び順に反映）
UPDATE message_threads SET updated_at = now() - interval '2 days' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
UPDATE message_threads SET updated_at = now() - interval '23 hours' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03';
UPDATE message_threads SET updated_at = now() - interval '3 hours' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
UPDATE message_threads SET updated_at = now() - interval '5 hours' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05';

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

-- ============================================================
-- BILLING テストデータ (Task 12)
-- ============================================================

-- ---------- past_due ユーザー ----------
-- past_due_since を 8 日以上前に設定 (auto-cancel-past-due テスト用)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pastdue@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000001', 'b1110000-0000-1000-8000-000000000001', 'pastdue@test.local', '{"sub":"b1110000-0000-1000-8000-000000000001","email":"pastdue@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '遅延', first_name = '太郎', email = 'pastdue@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000001';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, past_due_since)
VALUES ('b1110000-0000-1000-8000-000000000001', 'individual', 'past_due', now() - interval '35 days', now() - interval '5 days', now() - interval '8 days');

INSERT INTO client_profiles (user_id, display_name) VALUES ('b1110000-0000-1000-8000-000000000001', '遅延太郎');

-- ---------- cancelled ユーザー (過去 client、現在 contractor) ----------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cancelled@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000002', 'b1110000-0000-1000-8000-000000000002', 'cancelled@test.local', '{"sub":"b1110000-0000-1000-8000-000000000002","email":"cancelled@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'contractor', last_name = '解約', first_name = '次郎', email = 'cancelled@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000002';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end)
VALUES ('b1110000-0000-1000-8000-000000000002', 'individual', 'cancelled', now() - interval '60 days', now() - interval '30 days');

-- ---------- ダウングレード予約中ユーザー ----------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'downgrade-reserved@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000003', 'b1110000-0000-1000-8000-000000000003', 'downgrade-reserved@test.local', '{"sub":"b1110000-0000-1000-8000-000000000003","email":"downgrade-reserved@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '予約', first_name = '三郎', email = 'downgrade-reserved@test.local', prefecture = '神奈川県'
WHERE id = 'b1110000-0000-1000-8000-000000000003';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, schedule_id, scheduled_plan_type, scheduled_at)
VALUES ('b1110000-0000-1000-8000-000000000003', 'corporate', 'active', now(), now() + interval '30 days', 'sub_sched_seed_001', 'individual', now() + interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES ('b1110000-0000-1000-8000-000000000003', '予約三郎');

-- ---------- 法人プラン購入直後 (org名未入力) ----------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corp-noname@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000004', 'b1110000-0000-1000-8000-000000000004', 'corp-noname@test.local', '{"sub":"b1110000-0000-1000-8000-000000000004","email":"corp-noname@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '法人', first_name = '四郎', email = 'corp-noname@test.local', prefecture = '大阪府'
WHERE id = 'b1110000-0000-1000-8000-000000000004';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end)
VALUES ('b1110000-0000-1000-8000-000000000004', 'corporate', 'active', now(), now() + interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES ('b1110000-0000-1000-8000-000000000004', '法人四郎');

INSERT INTO organizations (id, owner_id) VALUES
  ('b1115555-0000-1000-8000-000000000004', 'b1110000-0000-1000-8000-000000000004');
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('b1115555-0000-1000-8000-000000000004', 'b1110000-0000-1000-8000-000000000004', 'owner');

-- ---------- 法人四郎の公開中案件（ダウングレードバリデーションテスト用） ----------
-- 個人プランの maxOpenJobs=1 を超える2件を用意
INSERT INTO jobs (id, owner_id, organization_id, title, description, prefecture, address, trade_type, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    'b1116666-0000-1000-8000-000000000001',
    'b1110000-0000-1000-8000-000000000004',
    'b1115555-0000-1000-8000-000000000004',
    'ダウングレードテスト案件1',
    'ダウングレードバリデーション確認用の案件です。',
    '大阪府',
    '大阪市北区',
    '大工',
    1,
    20000,
    18000,
    CURRENT_DATE + interval '7 days',
    CURRENT_DATE + interval '14 days',
    CURRENT_DATE - interval '3 days',
    CURRENT_DATE + interval '30 days',
    'open'
  ),
  (
    'b1116666-0000-1000-8000-000000000002',
    'b1110000-0000-1000-8000-000000000004',
    'b1115555-0000-1000-8000-000000000004',
    'ダウングレードテスト案件2',
    'ダウングレードバリデーション確認用の案件です。',
    '大阪府',
    '大阪市中央区',
    '内装工',
    2,
    25000,
    20000,
    CURRENT_DATE + interval '10 days',
    CURRENT_DATE + interval '20 days',
    CURRENT_DATE - interval '1 days',
    CURRENT_DATE + interval '30 days',
    'open'
  );

-- ---------- 法人 + 補償 active ユーザー (連鎖キャンセルテスト用) ----------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corp-comp@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005', 'corp-comp@test.local', '{"sub":"b1110000-0000-1000-8000-000000000005","email":"corp-comp@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '補償', first_name = '五郎', email = 'corp-comp@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000005';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, stripe_subscription_id)
VALUES ('b1110000-0000-1000-8000-000000000005', 'corporate', 'active', now(), now() + interval '30 days', 'sub_seed_comp_base');

-- display_name は旧 organizations.name「補償テスト建設」を継承
INSERT INTO client_profiles (user_id, display_name, is_compensation_5000) VALUES ('b1110000-0000-1000-8000-000000000005', '補償テスト建設', true);

INSERT INTO option_subscriptions (user_id, payment_type, stripe_subscription_id, option_type, status, start_date)
VALUES ('b1110000-0000-1000-8000-000000000005', 'subscription', 'sub_seed_comp_opt', 'compensation_5000', 'active', now());

INSERT INTO organizations (id, owner_id) VALUES
  ('b1115555-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005');
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('b1115555-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005', 'owner');


-- ============================================================
-- ORGANIZATION spec テストデータ (Task 7.2 / 7.3 / 7.4)
-- ============================================================

-- ------------------------------------------------------------
-- Task 7.2: J1 シナリオ — 法人プラン完全解約 + 冷凍保存 Admin/Staff
-- ------------------------------------------------------------
-- 再アップグレード時の display_name prefill と Admin/Staff 復帰検証用。
-- Owner は cancelled + role='contractor' 降格済み、Admin/Staff は
-- users.is_active=false で冷凍保存。organizations はソフト削除せず残す。

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('c2221111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corp-cancelled@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('c2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frozen-admin@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('c2223333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frozen-staff@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('c2221111-1111-1111-1111-111111111111', 'c2221111-1111-1111-1111-111111111111', 'corp-cancelled@test.local', '{"sub":"c2221111-1111-1111-1111-111111111111","email":"corp-cancelled@test.local"}', 'email', now(), now(), now()),
  ('c2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'frozen-admin@test.local', '{"sub":"c2222222-2222-2222-2222-222222222222","email":"frozen-admin@test.local"}', 'email', now(), now(), now()),
  ('c2223333-3333-3333-3333-333333333333', 'c2223333-3333-3333-3333-333333333333', 'frozen-staff@test.local', '{"sub":"c2223333-3333-3333-3333-333333333333","email":"frozen-staff@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'contractor', last_name = '解約', first_name = '社長', email = 'corp-cancelled@test.local', prefecture = '東京都', is_active = true, password_set_at = now() WHERE id = 'c2221111-1111-1111-1111-111111111111';
UPDATE public.users SET role = 'staff', last_name = '冷凍', first_name = '管理', email = 'frozen-admin@test.local', is_active = false, password_set_at = now() WHERE id = 'c2222222-2222-2222-2222-222222222222';
UPDATE public.users SET role = 'staff', last_name = '冷凍', first_name = '担当', email = 'frozen-staff@test.local', is_active = false, password_set_at = now() WHERE id = 'c2223333-3333-3333-3333-333333333333';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end)
VALUES ('c2221111-1111-1111-1111-111111111111', 'corporate', 'cancelled', now() - interval '60 days', now() - interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES ('c2221111-1111-1111-1111-111111111111', '解約済み建設');

INSERT INTO organizations (id, owner_id) VALUES
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111', 'owner'),
  ('c2225555-5555-5555-5555-555555555555', 'c2222222-2222-2222-2222-222222222222', 'admin'),
  ('c2225555-5555-5555-5555-555555555555', 'c2223333-3333-3333-3333-333333333333', 'staff');

INSERT INTO scout_templates (organization_id, owner_id, title, body, memo) VALUES
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111', '【解約済み】挨拶テンプレ', '弊社ではスカウト対応しています。ご興味ございましたらお知らせください。', '再課金後も継続利用の想定'),
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111', '【解約済み】本契約テンプレ', '本契約に向けて条件を共有します。ご確認ください。', '再課金後も継続利用の想定');

-- ------------------------------------------------------------
-- Task 7.3: C 案シナリオ — 退会済み Owner + 組織ソフトデリート
-- ------------------------------------------------------------
-- 受注者側の過去スレッド表示（display_name 維持）と、
-- 発注者一覧 / マイリスト非表示の検証用。
-- organization_members は物理削除済みを模擬（INSERT しない）。

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('c3331111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'withdrawn-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('c3331111-1111-1111-1111-111111111111', 'c3331111-1111-1111-1111-111111111111', 'withdrawn-owner@test.local', '{"sub":"c3331111-1111-1111-1111-111111111111","email":"withdrawn-owner@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '退会', first_name = '済み', email = 'withdrawn-owner@test.local', prefecture = '大阪府', deleted_at = now() - interval '3 days', password_set_at = now() - interval '60 days' WHERE id = 'c3331111-1111-1111-1111-111111111111';

-- client_profiles.display_name は削除せず保持（C 案: 履歴として残す）
INSERT INTO client_profiles (user_id, display_name) VALUES ('c3331111-1111-1111-1111-111111111111', '退会済み組織');

-- organizations は deleted_at セット（ソフトデリート）
INSERT INTO organizations (id, owner_id, deleted_at) VALUES
  ('c3335555-5555-5555-5555-555555555555', 'c3331111-1111-1111-1111-111111111111', now() - interval '3 days');

-- organization_members は INSERT しない（C 案で物理削除済み）

-- 過去スレッド（受注者 11111111 との間）: 退会後も受注者側が発注者名を確認できること
INSERT INTO message_threads (id, participant_1_id, participant_2_id, organization_id, thread_type, created_at, updated_at) VALUES
  ('c333eeee-eeee-eeee-eeee-eeeeeeeeeeee', 'c3331111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'c3335555-5555-5555-5555-555555555555', 'message', now() - interval '10 days', now() - interval '4 days');

INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('c333eeee-eeee-eeee-eeee-eeeeeeeeeeee', 'c3331111-1111-1111-1111-111111111111', 'ご連絡ありがとうございました。条件を検討します。', false, false, now() - interval '5 days'),
  ('c333eeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'かしこまりました。ご返信お待ちしています。', false, false, now() - interval '4 days');

-- ------------------------------------------------------------
-- Task 7.4: 招待フロー（password_set_at パターン）
-- ------------------------------------------------------------
-- 既存組織 55555555-... に以下 2 名を追加:
--   invited-admin@test.local    — password_set_at IS NULL（招待中バッジ検証用）
--   completed-admin@test.local  — password_set_at セット済み（招待完了検証用）

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('c4441111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited-admin@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('c4442222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'completed-admin@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('c4441111-1111-1111-1111-111111111111', 'c4441111-1111-1111-1111-111111111111', 'invited-admin@test.local', '{"sub":"c4441111-1111-1111-1111-111111111111","email":"invited-admin@test.local"}', 'email', now(), now(), now()),
  ('c4442222-2222-2222-2222-222222222222', 'c4442222-2222-2222-2222-222222222222', 'completed-admin@test.local', '{"sub":"c4442222-2222-2222-2222-222222222222","email":"completed-admin@test.local"}', 'email', now(), now(), now());

-- 招待中（password_set_at NULL）/ 完了済み（password_set_at セット）
UPDATE public.users SET role = 'staff', last_name = '招待', first_name = '中', email = 'invited-admin@test.local', password_set_at = NULL WHERE id = 'c4441111-1111-1111-1111-111111111111';
UPDATE public.users SET role = 'staff', last_name = '招待', first_name = '完了', email = 'completed-admin@test.local', password_set_at = now() - interval '1 day' WHERE id = 'c4442222-2222-2222-2222-222222222222';

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('55555555-5555-5555-5555-555555555555', 'c4441111-1111-1111-1111-111111111111', 'admin'),
  ('55555555-5555-5555-5555-555555555555', 'c4442222-2222-2222-2222-222222222222', 'admin');

-- ------------------------------------------------------------
-- Task 7.5: 代理アカウント重複拒否テスト用データ
-- ------------------------------------------------------------
-- 既存の staff=33333333（is_proxy_account=true）が代理役を担う。
-- seed L460 で既に設定済みのため追加不要。確認コメントのみ。
