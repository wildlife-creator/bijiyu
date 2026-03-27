-- ============================================================
-- seed.sql — Playwright テスト用データ
-- ============================================================
-- 実行: supabase db reset で自動投入
-- 前提: マイグレーション 001〜008 が適用済み

-- ============================================================
-- 固定 UUID（テストコードから参照しやすくするため）
-- ============================================================
-- ユーザー
--   contractor: 11111111-1111-1111-1111-111111111111
--   client:     22222222-2222-2222-2222-222222222222
--   staff:      33333333-3333-3333-3333-333333333333
--   admin:      44444444-4444-4444-4444-444444444444
-- 組織
--   org:        55555555-5555-5555-5555-555555555555
-- 案件
--   job1:       66666666-6666-6666-6666-666666666666
--   job2:       77777777-7777-7777-7777-777777777777

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
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'admin@test.local',      '{"sub":"44444444-4444-4444-4444-444444444444","email":"admin@test.local"}',      'email', now(), now(), now());

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

-- 管理者
UPDATE public.users SET
  role = 'admin',
  last_name = '管理',
  first_name = '太郎',
  gender = '男性',
  birth_date = '1980-01-01',
  prefecture = '東京都'
WHERE id = '44444444-4444-4444-4444-444444444444';

-- ============================================================
-- 2.5 identity_verifications（本人確認・CCUS 承認済みレコード）
-- identity_verified = true にするなら identity_verifications にも対応レコードを用意する
-- ============================================================

INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('11111111-1111-1111-1111-111111111111', 'ccus', 'dummy/ccus-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'ccus', 'dummy/ccus-doc.png', 'approved', now());

-- ============================================================
-- 3. user_skills（受注者のスキル）
-- ============================================================

INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('11111111-1111-1111-1111-111111111111', '大工', 10),
  ('11111111-1111-1111-1111-111111111111', '内装工', 5);

-- ============================================================
-- 4. user_qualifications（受注者の資格）
-- ============================================================

INSERT INTO user_qualifications (user_id, qualification_name) VALUES
  ('11111111-1111-1111-1111-111111111111', '一級建築士'),
  ('11111111-1111-1111-1111-111111111111', '二級建築施工管理技士');

-- ============================================================
-- 5. user_available_areas（受注者の対応可能エリア）
-- ============================================================

INSERT INTO user_available_areas (user_id, prefecture) VALUES
  ('11111111-1111-1111-1111-111111111111', '東京都'),
  ('11111111-1111-1111-1111-111111111111', '神奈川県'),
  ('11111111-1111-1111-1111-111111111111', '千葉県');

-- ============================================================
-- 6. subscriptions（発注者のサブスクリプション）
-- ============================================================

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('22222222-2222-2222-2222-222222222222', 'corporate', 'active', now(), now() + interval '30 days');

-- ============================================================
-- 7. organizations + organization_members
-- ============================================================

-- 組織（発注者がオーナー）
INSERT INTO organizations (id, name, owner_id) VALUES
  ('55555555-5555-5555-5555-555555555555', '鈴木工務店株式会社', '22222222-2222-2222-2222-222222222222');

-- メンバー: 発注者 = owner、担当者 = staff
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'staff');

-- ============================================================
-- 8. client_profiles（発注者プロフィール）
-- ============================================================

INSERT INTO client_profiles (user_id, display_name, recruit_area, employee_scale, message) VALUES
  ('22222222-2222-2222-2222-222222222222', '鈴木工務店', '神奈川県・東京都', 15, '一緒に働いてくれる職人さんを募集しています。');

-- ============================================================
-- 9. jobs（テスト用案件）
-- ============================================================

INSERT INTO jobs (id, owner_id, organization_id, title, description, prefecture, address, trade_type, headcount, reward_upper, reward_lower, work_start_date, work_end_date, status) VALUES
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
    'open'
  );

-- ============================================================
-- 10. Storage バケット（マイグレーション 008 で作成済みだが、seed でも冪等に作成）
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('job-attachments', 'job-attachments', true),
  ('identity-documents', 'identity-documents', false),
  ('ccus-documents', 'ccus-documents', false),
  ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;
