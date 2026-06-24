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
  municipality = '港区',
  company_name = '田中建設',
  bio = '大工歴10年。木造住宅を得意としています。',
  identity_verified = true,
  ccus_verified = true,
  skill_tags = ARRAY['木造軸組構法', '造作大工', '内装仕上工']
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
  municipality = '横浜市西区',
  company_name = NULL,
  bio = '塗装工歴8年。外壁・内壁の塗装を専門にしています。左官工事も対応可能です。',
  identity_verified = true,
  ccus_verified = true,
  skill_tags = ARRAY['吹付塗装工', '壁装（クロス）工', '造作大工']
WHERE id = 'cc111111-1111-1111-1111-111111111111';

-- 受注者3（電気工事士・配管工）
UPDATE public.users SET
  role = 'contractor',
  last_name = '渡辺',
  first_name = '大輔',
  gender = '男性',
  birth_date = '1988-02-14',
  prefecture = '東京都',
  municipality = '渋谷区',
  company_name = '渡辺電設',
  bio = '電気工事士として15年の経験があります。商業施設・住宅問わず対応可能です。',
  identity_verified = true,
  ccus_verified = false,
  skill_tags = ARRAY['送配電線工', '受変電設備工', '配管工（給排水・衛生）']
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
  bio = '内装工事を中心に活動しています。クロス張り替えが得意です。',
  skill_tags = ARRAY['壁装（クロス）工', '内装仕上工', '床施工']
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
  ('11111111-1111-1111-1111-111111111111', '建築/躯体｜大工', 10),
  ('11111111-1111-1111-1111-111111111111', '建築/内装｜木工', 5),
  ('cc111111-1111-1111-1111-111111111111', '建築/仕上げ｜塗装工', 8),
  ('cc111111-1111-1111-1111-111111111111', '建築/仕上げ｜左官工', 4),
  ('cc222222-2222-2222-2222-222222222222', '設備/施工｜電気（その他全般）', 15),
  ('cc222222-2222-2222-2222-222222222222', '設備/施工｜配管工（塩ビ管）', 6),
  ('cc333333-3333-3333-3333-333333333333', '建築/内装｜木工', 3),
  -- 発注者ユーザー（client role）にも user_skills を登録する。
  -- 理由: 正規ルート（/register/profile）の registerProfileSchema で skills.min(1) が必須のため、
  -- 自分で会員登録した全ユーザー（後に client にアップグレードする人含む）は必ず skills を持つ。
  -- seed もそのフローに合わせる（直接 INSERT で skills 無しユーザーを作ってはならない）。
  ('22222222-2222-2222-2222-222222222222', '建築/内装｜木工', 8),
  ('aabbccdd-1111-2222-3333-444455556666', '建築/躯体｜鉄筋工', 12),
  ('dd111111-1111-2222-3333-444455556666', '建築/内装｜木工', 5);

-- ============================================================
-- 4. user_qualifications（受注者の資格）
-- ============================================================

INSERT INTO user_qualifications (user_id, qualification_name) VALUES
  ('11111111-1111-1111-1111-111111111111', '1級建築士'),
  ('11111111-1111-1111-1111-111111111111', '2級建築施工管理技士'),
  ('cc111111-1111-1111-1111-111111111111', '登録建設塗装基幹技能者'),
  ('cc222222-2222-2222-2222-222222222222', '第2種電気工事士'),
  ('cc222222-2222-2222-2222-222222222222', '1級電気工事施工管理技士'),
  -- 9.4d 廃止項目テスト用: cc222222 が「特級ボイラー技士」を保有しており、
  -- 後段の UPDATE で master 側を deprecated に倒すことで「既存保有 deprecated は保持」
  -- と「編集画面で（廃止）サフィックス表示」と「検索候補からの除外」を同時に検証する。
  ('cc222222-2222-2222-2222-222222222222', '特級ボイラー技士');

-- ============================================================
-- 5. user_available_areas（受注者の対応可能エリア）
-- ============================================================

-- master-area Phase 5: (user_id, prefecture, municipality) の 3 カラム版に書き換え。
-- research.md R4 のテストユーザー分配:
--   - contractor (11111111): 東京都 + 神奈川県 (県のみ) → 既存 千葉県/null も保持
--   - contractor2 (cc111111): 既存 神奈川県/null + 東京都/null + 東京都/港区 + 東京都/新宿区
--     を保持し「同県全域+市区町村混在」表示パターン (Req 5.6) をテスト可能にする
--   - その他は県のみ
INSERT INTO user_available_areas (user_id, prefecture, municipality) VALUES
  ('11111111-1111-1111-1111-111111111111', '東京都',   NULL),
  ('11111111-1111-1111-1111-111111111111', '神奈川県', NULL),
  ('11111111-1111-1111-1111-111111111111', '千葉県',   NULL),
  ('cc111111-1111-1111-1111-111111111111', '神奈川県', NULL),
  ('cc111111-1111-1111-1111-111111111111', '東京都',   NULL),
  ('cc111111-1111-1111-1111-111111111111', '東京都',   '港区'),
  ('cc111111-1111-1111-1111-111111111111', '東京都',   '新宿区'),
  ('cc222222-2222-2222-2222-222222222222', '東京都',   NULL),
  ('cc222222-2222-2222-2222-222222222222', '埼玉県',   NULL),
  ('cc222222-2222-2222-2222-222222222222', '千葉県',   NULL),
  ('cc333333-3333-3333-3333-333333333333', '千葉県',   NULL),
  ('cc333333-3333-3333-3333-333333333333', '東京都',   NULL),
  -- 発注者ユーザー（client role）の対応可能エリア。
  -- registerProfileSchema で availableAreas.min(1) 必須のため、正規ルートを経た全ユーザーが持つ。
  ('22222222-2222-2222-2222-222222222222', '神奈川県', NULL),
  ('22222222-2222-2222-2222-222222222222', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '東京都',   NULL);

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
-- master-area Phase 5: recruit_area カラムを INSERT から削除 (Phase 6 で DROP 予定)。
-- 募集エリアは client_recruit_areas (別テーブル) に分離。本ファイル末尾の
-- 「master-area Phase 5 (4): client_recruit_areas seed」セクションで INSERT する。
INSERT INTO client_profiles (user_id, display_name, address, recruit_job_types, working_way, employee_scale, message, language) VALUES
  ('22222222-2222-2222-2222-222222222222', '鈴木工務店株式会社', '東京都墨田区向島1-2-3', '{"建築/躯体｜大工","建築/内装｜木工","設備/施工｜電気（その他全般）"}', '{"1日から可","短期歓迎"}', 15, '一緒に働いてくれる職人さんを募集しています。', '{"日本語"}'),
  ('aabbccdd-1111-2222-3333-444455556666', '山田建設株式会社', '埼玉県さいたま市大宮区4-5-6', '{"建築/躯体｜大工","建築/躯体｜鉄筋工","建築/躯体｜型枠工"}', '{"長期歓迎","常用希望"}', 30, '大規模建築を中心に手がけています。職人さん大募集中です。', '{"日本語","英語"}'),
  ('dd111111-1111-2222-3333-444455556666', '中村リフォーム', NULL, '{"建築/躯体｜大工","建築/内装｜木工"}', '{"1日から可"}', 1, '小規模リフォームの発注をしています。', '{"日本語"}');

-- ============================================================
-- 9. jobs（テスト用案件）
-- ============================================================

INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    '木造住宅の内装リフォーム工事',
    '横浜市内の木造住宅のリフォーム工事です。内装の壁紙張り替え、フローリング張り替えをお願いします。',
    ARRAY['建築/内装｜木工']::text[],
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
    ARRAY['建築/躯体｜大工','建築/内装｜木工','建築/仕上げ｜造作大工工']::text[],
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
    ARRAY['建築/躯体｜大工']::text[],
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
    ARRAY['建築/内装｜木工']::text[],
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
    ARRAY['建築/内装｜木工']::text[],
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
    ARRAY['設備/施工｜電気（その他全般）']::text[],
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
    ARRAY['建築/躯体｜型枠工']::text[],
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
    ARRAY['建築/仕上げ｜塗装工']::text[],
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
    ARRAY['建築/躯体｜大工','建築/躯体｜鉄筋工','建築/躯体｜型枠工','建築/躯体｜重量鳶']::text[],
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
    ARRAY['建築/躯体｜鉄筋工']::text[],
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
    ARRAY['建築/内装｜木工']::text[],
    2,
    27000,
    21000,
    CURRENT_DATE + interval '5 days',
    CURRENT_DATE + interval '20 days',
    CURRENT_DATE - interval '1 day',
    CURRENT_DATE + interval '18 days',
    'open'
  );

-- 言語要件のテストデータ（CON-002 言語フィルター用）
-- - 案件 66666666: 日本語のみ
-- - 案件 77777777: 日本語＋英語（多言語OK）
-- - 案件 88888888-...001: 中国語必要（中国語話者向け案件想定）
-- - 案件 88888888-...002: 言語要件なし（NULL のまま）
UPDATE jobs SET language = ARRAY['日本語']::text[] WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE jobs SET language = ARRAY['日本語','英語']::text[] WHERE id = '77777777-7777-7777-7777-777777777777';
UPDATE jobs SET language = ARRAY['中国語']::text[] WHERE id = '88888888-8888-8888-8888-888888888881';

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
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    '99999999-9999-9999-9999-999999999999',
    'dd111111-1111-2222-3333-444455556666',
    NULL,
    '自宅キッチンリフォーム',
    '埼玉県の自宅キッチンのリフォーム工事です。',
    ARRAY['建築/内装｜木工']::text[],
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

-- 勤務地（番地以下の詳細住所）: CLI-009 で発注者が入力し、成立した受注者にのみ表示する。
-- 成立済み応募に設定して CON-012（応募詳細）/ CLI-010（発注履歴）の表示を検証できるようにする。
UPDATE applications SET work_location = '神奈川県横浜市中区本町3-1-5 ○○ビル3F' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE applications SET work_location = '東京都渋谷区道玄坂2-10-12 △△店舗' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';

-- Matching E2E test data: applied application for cancel test (contractor applies to client2's job)
-- Need a job from client2 for the contractor to apply to
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date)
VALUES ('88888888-8888-8888-8888-888888888888', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555', 'E2Eテスト用案件（キャンセルテスト）', 'マッチングE2Eテスト用', ARRAY['建築/仕上げ｜塗装工']::text[], 2, 'open', 15000, 20000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30);

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
-- rating-redesign: 7項目★×5（rating_overall 必須・他6項目任意）。has_special_equipment は NULL = CLI-028「未評価」表示の検証用
INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, operating_status, rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment, comment) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '問題なく稼働完了', 5, 5, 5, 4, 5, 5, NULL, '丁寧な仕事でした。また依頼したいです。');

-- ============================================================
-- 12.5 CLI-010〜012 / CLI-028 テスト用データ
-- ============================================================
-- 取引完了: contractor2 (cc111111) の completed 応募 × 2件（CLI-028 で同一 reviewee の複数評価をテスト）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '88888888-8888-8888-8888-888888888882', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '30 days', 'completed', CURRENT_DATE - interval '25 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '88888888-8888-8888-8888-888888888883', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '20 days', 'completed', CURRENT_DATE - interval '15 days');

-- キャンセル・お断り: contractor3 (cc222222) の cancelled 応募
-- cancelled_by はマイグレーションのバックフィルでは埋まらない（バックフィルは
-- マイグレーション適用時点の既存行のみ・seed は後から投入される）ため明示する。
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, cancelled_by) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc03', '77777777-7777-7777-7777-777777777777', 'cc222222-2222-2222-2222-222222222222', 1, 'スポット', CURRENT_DATE + interval '14 days', 'cancelled', 'contractor');

-- user_reviews: contractor2 (cc111111) への評価（CLI-028 テスト用、同一 reviewee に2件）
-- 2件のみ = CLI-005 高評価バッジの「件数3未満 → 非表示」検証用。★平均 (5+4)/2 = 4.5
INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, operating_status, rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment, comment) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', '問題なく稼働完了', 5, 5, 5, 5, 5, 5, 4, '作業が丁寧で、時間通りに来てくれました。道具も揃っていて安心でした。'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', '問題なく稼働完了', 4, 4, 4, 2, 4, 4, NULL, '丁寧な作業でしたが、もう少しスピードが欲しかったです。');

-- rating-redesign E2E: cc111111 に3件目の高評価を追加 → 総合3件・★平均 (5+4+5)/3≈4.67 で CLI-005「高評価」バッジ表示
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date)
VALUES ('99999999-9999-9999-9999-999999999990', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '高評価バッジ検証用案件', 'rating-redesign E2E 用の完了案件', ARRAY['建築/内装｜木工']::text[], 1, 'open', 20000, 25000, CURRENT_DATE - 40, CURRENT_DATE - 30, CURRENT_DATE - 50, CURRENT_DATE - 20);

INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccc04', '99999999-9999-9999-9999-999999999990', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - 40, 'completed', CURRENT_DATE - 35);

INSERT INTO user_reviews (application_id, reviewer_id, reviewee_id, operating_status, rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment, comment) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc04', '22222222-2222-2222-2222-222222222222', 'cc111111-1111-1111-1111-111111111111', '問題なく稼働完了', 5, 5, 5, 5, 5, 5, 5, '毎回素晴らしい仕事です。');

-- ============================================================
-- 12.6 client_reviews（受注者→発注者評価テストデータ / client-review-completion）
-- ============================================================
-- CLI-020 評判表示（また受けたい good／合計）の検証用。
-- 被評価者 = client@test.local (22222222 / 鈴木工務店, org 55555555 の Owner)。
-- 評価者 = 各応募の applicant（受注者）、被評価者 = 案件オーナー（発注者）で FK 整合を厳守。
-- application_id は UNIQUE のため 1応募1評価。good 3件 + bad 1件 = 「3／4件」を検証可能にする。
-- 注意: CON-013 提出 E2E が使う未評価応募（aaaa...aaab / 受注者→job2、aaaa...aaac / 発注者作業報告用）
--       には紐付けないこと（UNIQUE 衝突・既評価化を避ける）。
-- status_supplement / comment は保存するが本 spec ではどの画面にも表示しない（保留）。
-- organization-scoping-consistency Req 10.6: 各行に対応案件の会社IDを明示設定する。
--   昇格時の組織ID自動付与は live の昇格経路でのみ走り、seed の会社（既に法人設定済み）には
--   走らないため、seed 行は org_id を明示しないと CLI-020 の組織スコープ集計に現れない。
--   4行とも owner 22222222（鈴木工務店）の案件への評価＝org 55555555。
INSERT INTO client_reviews (application_id, reviewer_id, reviewee_id, organization_id, operating_status, status_supplement, rating_again, comment) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '問題なく稼働完了', NULL, 'good', '指示が明確で働きやすい現場でした。'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', 'cc111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '問題なく稼働完了', NULL, 'good', 'また機会があればお願いしたいです。'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'cc111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '問題なく稼働完了', NULL, 'good', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccccc04', 'cc111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '一部欠席したものの概ね問題なく稼働完了', '初日に到着が遅れました。', 'bad', NULL);

-- ============================================================
-- 12.7 organization-scoping-consistency Req 10.1 / 10.7 検証データ
-- ============================================================
-- (A) Req 10.1: 担当者(staff 33333333)が作成した案件(885)への発注成立 + 評価。
--     reviewee=staff(33333333) / organization_id=55555555。
--     会社(鈴木工務店)の評判集計に担当者案件ぶんが乗ることを検証する
--     （CLI-020 で Owner 視点の会社合計が good 3→4 / total 4→5 = 「4／5件」）。
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa85', '88888888-8888-8888-8888-888888888885', 'cc333333-3333-3333-3333-333333333333', 1, '常勤', CURRENT_DATE + interval '10 days', 'accepted', CURRENT_DATE + interval '12 days');

INSERT INTO client_reviews (application_id, reviewer_id, reviewee_id, organization_id, operating_status, status_supplement, rating_again, comment) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa85', 'cc333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', '問題なく稼働完了', NULL, 'good', '担当者が立てた現場も問題なく完了しました。');

-- (B) Req 10.7: 個人発注者(dd111111 / 中村リフォーム)の評価(organization_id=NULL)。
--     個人発注者は会社単位化されず reviewee_id 軸で集計される非回帰(Req 10.5)を検証する
--     （CLI-020 で dd111111 視点が「1／1件」）。案件は status='closed' にして公開案件一覧を汚染しない。
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date)
VALUES ('dd111111-0000-0000-0000-0000000d0091', 'dd111111-1111-2222-3333-444455556666', NULL, '個人発注 キッチンリフォーム（完了）', '個人発注者の発注者評価 非回帰検証用の完了案件', ARRAY['建築/内装｜木工']::text[], 1, 'closed', 18000, 22000, CURRENT_DATE - 40, CURRENT_DATE - 30, CURRENT_DATE - 50, CURRENT_DATE - 25);

INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date) VALUES
  ('dd111111-0000-0000-0000-0000000a0091', 'dd111111-0000-0000-0000-0000000d0091', 'cc333333-3333-3333-3333-333333333333', 1, '常勤', CURRENT_DATE - 40, 'accepted', CURRENT_DATE - 38);

INSERT INTO client_reviews (application_id, reviewer_id, reviewee_id, organization_id, operating_status, status_supplement, rating_again, comment) VALUES
  ('dd111111-0000-0000-0000-0000000a0091', 'cc333333-3333-3333-3333-333333333333', 'dd111111-1111-2222-3333-444455556666', NULL, '問題なく稼働完了', NULL, 'good', '個人の発注者さんですが、やり取りが丁寧でした。');

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
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date)
VALUES ('88888888-8888-8888-8888-888888888899', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'スカウトテスト用案件（内装工事）', 'スカウト経由応募のE2Eテスト用案件', ARRAY['建築/内装｜木工']::text[], 2, 'open', 20000, 25000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30);

-- スカウト経由応募（scout_message_id 付き）
-- dddddddd-dddd-dddd-dddd-dddddddddd01: applied 状態 → CLI-007 / CLI-007B / CLI-008 のバッジ表示テスト用
-- dddddddd-dddd-dddd-dddd-dddddddddd02: accepted 状態 → CLI-010 / CLI-007B / CLI-011 のバッジ表示テスト用
--   （CLI-010 は applied を含まないため、accepted のスカウト応募が必要）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, scout_message_id) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '88888888-8888-8888-8888-888888888899', '11111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '14 days', 'applied', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '88888888-8888-8888-8888-888888888899', 'cc111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE + interval '21 days', 'accepted', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

-- 応募フォーム表示テスト用案件（contractor の職種「内装工」+エリア「東京都」に合致、未応募）
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, status, reward_lower, reward_upper, work_start_date, work_end_date, recruit_start_date, recruit_end_date)
VALUES ('88888888-8888-8888-8888-888888888898', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555', '応募フォームテスト用案件', 'E2Eテスト用', ARRAY['建築/内装｜木工']::text[], 1, 'open', 18000, 22000, CURRENT_DATE, CURRENT_DATE + 60, CURRENT_DATE, CURRENT_DATE + 30);

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
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    'b1116666-0000-1000-8000-000000000001',
    'b1110000-0000-1000-8000-000000000004',
    'b1115555-0000-1000-8000-000000000004',
    'ダウングレードテスト案件1',
    'ダウングレードバリデーション確認用の案件です。',
    ARRAY['建築/躯体｜大工']::text[],
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
    ARRAY['建築/内装｜木工']::text[],
    2,
    25000,
    20000,
    CURRENT_DATE + interval '10 days',
    CURRENT_DATE + interval '20 days',
    CURRENT_DATE - interval '1 days',
    CURRENT_DATE + interval '30 days',
    'open'
  );

-- ---------- 法人 + 補償 active ユーザー（旧: 連鎖キャンセルテスト用 / 現: 法人プラン × 補償併用パターン）----------
-- 仕様変更（2026-05-09）: 補償オプションは受注者向け給与未払い保険となり
-- 基本プランから独立。連鎖キャンセルは廃止済み。本フィクスチャは「法人プラン
-- 契約者が併せて補償にも加入」したケースの検証用として継続利用する。
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corp-comp@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005', 'corp-comp@test.local', '{"sub":"b1110000-0000-1000-8000-000000000005","email":"corp-comp@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'client', last_name = '補償', first_name = '五郎', email = 'corp-comp@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000005';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, stripe_subscription_id)
VALUES ('b1110000-0000-1000-8000-000000000005', 'corporate', 'active', now(), now() + interval '30 days', 'sub_seed_comp_base');

-- display_name は旧 organizations.name「補償テスト建設」を継承
INSERT INTO client_profiles (user_id, display_name) VALUES ('b1110000-0000-1000-8000-000000000005', '補償テスト建設');

INSERT INTO option_subscriptions (user_id, payment_type, stripe_subscription_id, option_type, status, start_date)
VALUES ('b1110000-0000-1000-8000-000000000005', 'subscription', 'sub_seed_comp_opt', 'compensation_5000', 'active', now());

INSERT INTO organizations (id, owner_id) VALUES
  ('b1115555-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005');
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('b1115555-0000-1000-8000-000000000005', 'b1110000-0000-1000-8000-000000000005', 'owner');


-- ---------- 無料 contractor + 補償単独 active ユーザー (新仕様検証用) ----------
-- 仕様変更（2026-05-09）: 補償オプションは無料 contractor も購入可能。
-- 基本プラン契約のない無料受注者が補償だけを契約しているケースを再現する。
-- 受注者は client_profiles を持たないため、補償の active 状態は
-- option_subscriptions 単独で管理される。
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'free-comp@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000006', 'b1110000-0000-1000-8000-000000000006', 'free-comp@test.local', '{"sub":"b1110000-0000-1000-8000-000000000006","email":"free-comp@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'contractor', last_name = '補償', first_name = '六郎', email = 'free-comp@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000006';

INSERT INTO option_subscriptions (user_id, payment_type, stripe_subscription_id, option_type, status, start_date)
VALUES ('b1110000-0000-1000-8000-000000000006', 'subscription', 'sub_seed_free_comp_opt', 'compensation_9800', 'active', now());


-- ============================================================
-- ORGANIZATION spec テストデータ (Task 7.2 / 7.3 / 7.4)
-- ============================================================

-- ------------------------------------------------------------
-- Task 7.2 (旧 J1) → Phase 5 で正規化済みシナリオに置換
-- ------------------------------------------------------------
-- 元用途: 法人プラン完全解約 + 冷凍保存 Admin/Staff の再アップグレード復帰検証
-- 現用途: 再アップグレード時の display_name prefill 検証 (Admin/Staff 復帰は
--         Phase 5 で organization_members 行削除モデルに移行したため検証対象外)
--
-- Phase 4/5 で `users.is_active=false` 凍結方式を廃止し、行削除統一に切り替えた。
-- 旧 frozen-admin (c2222222) / frozen-staff (c2223333) は本来であれば
-- Phase 5 lifecycle_v2_data_migration で:
--   * organization_members 行を物理削除
--   * users.deleted_at = now() をセット
-- された状態になる。seed.sql は migration 後に走るため、最初から
-- 正規化後の状態で投入する。
--
-- Owner (c2221111) は cancelled + role='contractor' 降格済み (Phase 5 後も変わらず)。

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
-- Phase 5 正規化済み (旧 is_active=false 凍結 → deleted_at セット + memberships 削除)
-- is_active 自体は global ログインゲートとして残置 (migration と同じ仕様)
UPDATE public.users SET role = 'staff', last_name = '冷凍', first_name = '管理', email = 'frozen-admin@test.local', is_active = false, deleted_at = now() - interval '30 days', password_set_at = now() WHERE id = 'c2222222-2222-2222-2222-222222222222';
UPDATE public.users SET role = 'staff', last_name = '冷凍', first_name = '担当', email = 'frozen-staff@test.local', is_active = false, deleted_at = now() - interval '30 days', password_set_at = now() WHERE id = 'c2223333-3333-3333-3333-333333333333';

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end)
VALUES ('c2221111-1111-1111-1111-111111111111', 'corporate', 'cancelled', now() - interval '60 days', now() - interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES ('c2221111-1111-1111-1111-111111111111', '解約済み建設');

INSERT INTO organizations (id, owner_id) VALUES
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111');

-- Phase 5 正規化済み: Admin/Staff (c2222222 / c2223333) の organization_members 行は
-- 削除済みを模擬 (INSERT しない)。Owner のみ membership を持つ。
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('c2225555-5555-5555-5555-555555555555', 'c2221111-1111-1111-1111-111111111111', 'owner');

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
  -- invited-admin: email_confirmed_at = NULL で「招待送信済み・未ログイン」状態を再現
  -- （email_confirmed_at が now() だと Supabase が inviteUserByEmail を拒否するため）
  ('c4441111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited-admin@test.local', crypt('testpass123', gen_salt('bf')), NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
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
-- master-area-multi-select Phase F (Task 6.1):
-- AUTH-006 通し E2E 用の「メール確認済 + プロフィール未設定」仮ユーザー
-- ------------------------------------------------------------
-- 用途:
--   - auth.users.email_confirmed_at = now() → メール確認済
--   - public.users.last_name IS NULL → middleware の「signup 完了」判定で未完了扱い
--     → 認証済ログイン後に /register/profile へリダイレクト
-- 既存の invited-admin（同じく email_confirmed_at=NULL は招待中扱い）と異なる
-- 「メール確認は完了したがプロフィール未入力」状態を再現する。
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new-contractor-e2e@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0', 'e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0', 'new-contractor-e2e@test.local', '{"sub":"e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0","email":"new-contractor-e2e@test.local"}', 'email', now(), now(), now());

-- handle_new_user トリガーで public.users (role='contractor', last_name=NULL, first_name=NULL) が
-- 自動作成される。AUTH-006 通し E2E はこの NULL 状態を起点に /register/profile 入力フローを検証する。
-- 後段の bulk UPDATE で password_set_at = now() が自動付与される（招待中バッジ対象外）。

-- ------------------------------------------------------------
-- Task 7.5: 代理アカウント重複拒否テスト用データ
-- ------------------------------------------------------------
-- 既存の staff=33333333（is_proxy_account=true）が代理役を担う。
-- seed L460 で既に設定済みのため追加不要。確認コメントのみ。

-- ------------------------------------------------------------
-- Bulk: 既に会員登録を完了している pre-existing テストユーザー全員に
-- password_set_at = now() を付与（CLI-022 の「招待中」バッジ誤表示の回避）。
-- invited-admin@test.local のみ NULL を保ち「招待中」バッジ検証用に残す。
-- ------------------------------------------------------------
UPDATE public.users
SET password_set_at = now()
WHERE email LIKE '%@test.local'
  AND email <> 'invited-admin@test.local'
  AND password_set_at IS NULL;

-- ------------------------------------------------------------
-- Phase 9.4 廃止項目テスト用: master_qualifications の 1 件を deprecated に倒す。
-- - 既存保有者（cc222222）は label を引き続き保持できる（既存保有 deprecated 保持の R3 AC-13）
-- - 編集画面のみ chip に「（廃止）」サフィックス付与（R9 AC-3）
-- - 各検索ポップアップ候補からは除外（getActiveQualifications）
-- - 表示専用画面はサフィックスを付けず素の label を表示（R9 AC-9）
-- ------------------------------------------------------------
UPDATE master_qualifications SET deprecated_at = now() WHERE label = '特級ボイラー技士';

-- ============================================================
-- master-area Phase 5: client_recruit_areas (発注者の募集エリア) seed
-- ============================================================
-- research.md R4 のテストユーザー分配:
--   - client@test.local (22222222): 東京都港区 + 大阪府大阪市北区 (市区町村あり)
--   - client2@test.local (aabbccdd-): 東京都 + 埼玉県 (県のみ)
--   - individual-client@test.local (dd111111-): 埼玉県 + 東京都 (県のみ)
--   - corp-comp@test.local (b1110000-...-000000000005, 法人プラン Owner 代表):
--     東京都全域 + 神奈川県横浜市港北区 (「全域 + 市区町村あり」混在パターン)
INSERT INTO client_recruit_areas (client_id, prefecture, municipality) VALUES
  ('22222222-2222-2222-2222-222222222222', '東京都',   '港区'),
  ('22222222-2222-2222-2222-222222222222', '大阪府',   '大阪市北区'),
  ('aabbccdd-1111-2222-3333-444455556666', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '東京都',   NULL),
  ('b1110000-0000-1000-8000-000000000005', '東京都',   NULL),
  ('b1110000-0000-1000-8000-000000000005', '神奈川県', '横浜市港北区');

-- ============================================================
-- master-area Phase 5: job_areas (案件のエリア) seed
-- ============================================================
-- Phase 5 要件: 「県のみ」「市区町村あり」「県跨ぎ (job_areas 2 件以上)」
-- 「エリア 4 件以上 (他Nエリア 省略表示テスト用)」をすべて含める。
INSERT INTO job_areas (job_id, prefecture, municipality) VALUES
  -- 鈴木工務店の案件 (8 件)
  ('66666666-6666-6666-6666-666666666666', '神奈川県', '横浜市中区'),       -- 政令市行政区
  ('77777777-7777-7777-7777-777777777777', '東京都',   '渋谷区'),
  ('88888888-8888-8888-8888-888888888881', '千葉県',   NULL),               -- 県のみ
  ('88888888-8888-8888-8888-888888888882', '東京都',   '品川区'),
  ('88888888-8888-8888-8888-888888888883', '神奈川県', '川崎市川崎区'),     -- 政令市行政区
  ('88888888-8888-8888-8888-888888888884', '大阪府',   '大阪市中央区'),     -- 政令市行政区
  ('88888888-8888-8888-8888-888888888885', '東京都',   '江東区'),
  ('88888888-8888-8888-8888-888888888886', '神奈川県', '横浜市港北区'),
  -- 山田建設の案件 (3 件): 661 は「他Nエリア 省略表示」テスト用。
  -- format-areas.ts は同県を 1 ユニットにグループ化するため、AreaSummary
  -- maxVisible=3 を超えるには都道府県の種類が 4 つ以上必要。東京都港区は
  -- master-area.spec.ts「東京都+港区 検索」のヒット確認で参照される。
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '世田谷区'),
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '港区'),
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '品川区'),
  ('aabbccdd-6666-6666-6666-666666666661', '神奈川県', '横浜市西区'),
  ('aabbccdd-6666-6666-6666-666666666661', '千葉県',   NULL),
  ('aabbccdd-6666-6666-6666-666666666661', '埼玉県',   NULL),
  ('aabbccdd-6666-6666-6666-666666666662', '埼玉県',   NULL),               -- 県のみ
  ('aabbccdd-6666-6666-6666-666666666663', '東京都',   '千代田区'),
  -- 個人発注者の案件
  ('99999999-9999-9999-9999-999999999999', '埼玉県',   NULL),               -- 県のみ
  -- E2E テスト用 (88888888-...-888): 県跨ぎテスト用 2 件
  ('88888888-8888-8888-8888-888888888888', '神奈川県', '川崎市川崎区'),
  ('88888888-8888-8888-8888-888888888888', '東京都',   '中央区'),
  -- スカウト経由応募テスト用案件
  ('88888888-8888-8888-8888-888888888899', '東京都',   NULL),
  -- 応募フォームテスト用 (contractor の「東京都」エリアにヒットさせるため県のみ)
  ('88888888-8888-8888-8888-888888888898', '東京都',   NULL),
  -- ダウングレードテスト案件 (法人四郎)
  ('b1116666-0000-1000-8000-000000000001', '大阪府',   '大阪市北区'),
  ('b1116666-0000-1000-8000-000000000002', '大阪府',   '大阪市中央区');


-- ============================================================
-- video-display spec テストデータ (Task 7.1)
-- ============================================================
-- 受注者PR動画 (users.video_url) / 職場紹介動画 (client_profiles.workplace_video_url)
-- の表示判定 = 「URL 存在 かつ active option」の AND を検証するためのデータ。
-- one_time オプションは CHECK 制約で stripe_subscription_id を NULL にする必要があるため
-- stripe_payment_intent_id を使う。

-- (1) contractor@test.local: video_url あり + active 'video' あり → PR動画が表示される
UPDATE public.users
  SET video_url = 'https://www.tiktok.com/@bijiyu/video/7111111111111111111'
  WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO option_subscriptions (user_id, payment_type, stripe_payment_intent_id, option_type, status, end_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'one_time', 'pi_seed_video_11111', 'video', 'active', NULL);

-- (2) 受注者2 高橋 (cc111111): video_url あり + active 'video' なし → 非表示（挙動変更の回帰検証）
UPDATE public.users
  SET video_url = 'https://www.tiktok.com/@takahashi/video/7222222222222222222'
  WHERE id = 'cc111111-1111-1111-1111-111111111111';

-- (3) client@test.local: workplace_video_url あり + active 'video_workplace' あり → CON-006 で表示される
UPDATE client_profiles
  SET workplace_video_url = 'https://www.tiktok.com/@suzuki/video/7333333333333333333'
  WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO option_subscriptions (user_id, payment_type, stripe_payment_intent_id, option_type, status, end_date)
  VALUES ('22222222-2222-2222-2222-222222222222', 'one_time', 'pi_seed_vw_22222', 'video_workplace', 'active', NULL);

-- (4) 発注者2 山田 (aabbccdd): workplace_video_url あり + active なし → CON-006 非表示（回帰検証）
UPDATE client_profiles
  SET workplace_video_url = 'https://www.tiktok.com/@yamada/video/7444444444444444444'
  WHERE user_id = 'aabbccdd-1111-2222-3333-444455556666';

-- (5) corp-comp (b111...0005): 管理者の ADM-010B「空更新（掲載停止）」E2E 専用。
--     CON-006 表示用の (3) client@test を E2E が破壊しないよう、掲載停止テストの
--     対象をこの独立ユーザーに分離する。workplace_video_url + active video_workplace を付与。
UPDATE client_profiles
  SET workplace_video_url = 'https://www.tiktok.com/@hoshou/video/7555555555555555555'
  WHERE user_id = 'b1110000-0000-1000-8000-000000000005';
INSERT INTO option_subscriptions (user_id, payment_type, stripe_payment_intent_id, option_type, status, end_date)
  VALUES ('b1110000-0000-1000-8000-000000000005', 'one_time', 'pi_seed_vw_corpcomp', 'video_workplace', 'active', NULL);

-- ============================================================
-- 退会手動テスト用の使い捨てユーザー（COM-006 / withdrawal_surveys 検証用）
-- ============================================================
-- フリー受注者・進行中案件なし＝退会ガードに引っかからず退会できる状態。
-- 退会するとこのアカウントは BAN + 論理削除されるため使い捨て。再度試すには
-- supabase db reset で復活する。login: withdraw-test@test.local / testpass123
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('b1110000-0000-1000-8000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'withdraw-test@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('b1110000-0000-1000-8000-000000000099', 'b1110000-0000-1000-8000-000000000099', 'withdraw-test@test.local', '{"sub":"b1110000-0000-1000-8000-000000000099","email":"withdraw-test@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET role = 'contractor', last_name = '退会', first_name = 'テスト', email = 'withdraw-test@test.local', prefecture = '東京都'
WHERE id = 'b1110000-0000-1000-8000-000000000099';

-- ============================================================
-- job-inquiry（求人へのお問い合わせ）E2E 用シードデータ
-- ============================================================
-- 受信箱閲覧テスト用: contractor3 → client(法人 owner=鈴木工務店, org 55555555)。
-- 法人プランのため、宛先本人(client@test.local)と同一組織メンバー(staff@test.local)の
-- 両方が受信箱で閲覧できる。
INSERT INTO job_inquiries (id, sender_id, target_client_id, target_organization_id, name, email, topics, content)
VALUES (
  'f1110000-0000-4000-8000-0000000000e1',
  'cc222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555555',
  '佐藤太郎',
  'sato@example.com',
  ARRAY['求人について話を聞きたい','その他']::text[],
  'ぜひ一度お話を聞かせてください'
);

-- 連投制限テスト用: contractor2 が直近1時間で 5 件送信済み（6 件目は UI で拒否される）。
INSERT INTO job_inquiries (sender_id, target_client_id, target_organization_id, name, email, topics, content)
SELECT
  'cc111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555555',
  '連投テスト',
  'rate-limit@example.com',
  ARRAY['その他']::text[],
  ''
FROM generate_series(1, 5);

-- ============================================================
-- admin spec テストデータ (Task 13)
-- ============================================================
-- 固定 UUID（prefix ad / 既存 prefix と非衝突）:
--   adm-pending-identity@test.local: ad111111-1111-1111-1111-111111111111（本人確認 pending）
--   adm-pending-ccus@test.local:     ad222222-2222-2222-2222-222222222222（identity approved + CCUS pending）
--   adm-small-client@test.local:     ad333333-3333-3333-3333-333333333333（小規模プラン・組織なし）
--   代理メッセージスレッド:           adee0000-0000-4000-8000-000000000001
--   8分類検証用 closed 案件（山田建設）: ad660000-0000-4000-8000-000000000001 / -002
--   8分類検証用応募:                  ada00000-0000-4000-8000-000000000001〜004
--
-- 設計メモ（既存 E2E への影響を避ける）:
-- - 8分類の不足分（lost / rejected / cancelled_by=admin / 管理画面取消用 accepted）は
--   山田建設の「closed 案件」+ 新規ユーザーの応募で構成する。closed のため CON-002 に
--   出ず、鈴木工務店視点の CLI-007/010 E2E にも影響しない
-- - 新規ユーザー 3 名は正規登録ルート整合（skills / areas / password_set_at）を守る

-- ---------- 1. 新規テストユーザー 3 名 ----------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('ad111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-pending-identity@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ad222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-pending-ccus@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ad333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-small-client@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('ad111111-1111-1111-1111-111111111111', 'ad111111-1111-1111-1111-111111111111', 'adm-pending-identity@test.local', '{"sub":"ad111111-1111-1111-1111-111111111111","email":"adm-pending-identity@test.local"}', 'email', now(), now(), now()),
  ('ad222222-2222-2222-2222-222222222222', 'ad222222-2222-2222-2222-222222222222', 'adm-pending-ccus@test.local', '{"sub":"ad222222-2222-2222-2222-222222222222","email":"adm-pending-ccus@test.local"}', 'email', now(), now(), now()),
  ('ad333333-3333-3333-3333-333333333333', 'ad333333-3333-3333-3333-333333333333', 'adm-small-client@test.local', '{"sub":"ad333333-3333-3333-3333-333333333333","email":"adm-small-client@test.local"}', 'email', now(), now(), now());

-- 受注者（本人確認 pending・ADM-012 承認/否認 E2E の使い捨て対象）
UPDATE public.users SET
  role = 'contractor',
  last_name = '山本',
  first_name = '健',
  gender = '男性',
  birth_date = '1993-04-18',
  prefecture = '東京都',
  bio = '躯体工事を中心に活動しています。',
  skill_tags = ARRAY['木造軸組構法'],
  password_set_at = now()
WHERE id = 'ad111111-1111-1111-1111-111111111111';

-- 受注者（identity approved 済み + CCUS pending・ADM-012 CCUS 審査 E2E 用）
UPDATE public.users SET
  role = 'contractor',
  last_name = '井上',
  first_name = '翔',
  gender = '男性',
  birth_date = '1996-09-05',
  prefecture = '神奈川県',
  bio = '左官・タイル工事に対応できます。',
  identity_verified = true,
  skill_tags = ARRAY['壁装（クロス）工'],
  password_set_at = now()
WHERE id = 'ad222222-2222-2222-2222-222222222222';

-- 発注者（小規模プラン・組織なし。ADM-003 区分フィルタ「小規模発注者」検証用）
UPDATE public.users SET
  role = 'client',
  last_name = '木村',
  first_name = '洋一',
  gender = '男性',
  birth_date = '1975-02-10',
  prefecture = '静岡県',
  company_name = '木村工務店',
  bio = '静岡県内で小規模工務店を営んでいます。',
  identity_verified = true,
  password_set_at = now()
WHERE id = 'ad333333-3333-3333-3333-333333333333';

-- 正規登録ルート整合: skills / areas は必須
INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('ad111111-1111-1111-1111-111111111111', '建築/躯体｜大工', 7),
  ('ad222222-2222-2222-2222-222222222222', '建築/仕上げ｜左官工', 5),
  ('ad333333-3333-3333-3333-333333333333', '建築/躯体｜大工', 20);

INSERT INTO user_available_areas (user_id, prefecture, municipality) VALUES
  ('ad111111-1111-1111-1111-111111111111', '東京都', NULL),
  ('ad222222-2222-2222-2222-222222222222', '神奈川県', NULL),
  ('ad333333-3333-3333-3333-333333333333', '静岡県', NULL);

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('ad333333-3333-3333-3333-333333333333', 'small', 'active', now(), now() + interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES
  ('ad333333-3333-3333-3333-333333333333', '木村工務店');

-- ---------- 2. 本人確認・CCUS の pending 申請（ADM-011/012） ----------
-- ADM-011 は created_at ASC（古い順）表示のため、日時をずらして投入する。
-- 書類パスは Storage RLS 整合の「{user_id}/ファイル名」形式（実ファイルなし →
-- ADM-012 ではフォールバック表示になるが、審査フローの E2E には影響しない）。
INSERT INTO identity_verifications (user_id, document_type, document_url_1, document_url_2, status, created_at) VALUES
  ('ad111111-1111-1111-1111-111111111111', 'identity', 'ad111111-1111-1111-1111-111111111111/identity-front.png', 'ad111111-1111-1111-1111-111111111111/identity-back.png', 'pending', now() - interval '2 days');

-- CCUS pending（identity approved 済みの整合を守る: approved レコード + users フラグ）
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at, created_at) VALUES
  ('ad222222-2222-2222-2222-222222222222', 'identity', 'ad222222-2222-2222-2222-222222222222/identity-front.png', 'approved', now() - interval '10 days', now() - interval '12 days');
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, created_at) VALUES
  ('ad222222-2222-2222-2222-222222222222', 'ccus', 'ad222222-2222-2222-2222-222222222222/ccus-card.png', 'pending', now() - interval '1 day');

-- 小規模発注者の identity approved（identity_verified = true の整合）
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at) VALUES
  ('ad333333-3333-3333-3333-333333333333', 'identity', 'dummy/identity-doc.png', 'approved', now());

-- ---------- 3. contacts（ADM-016/017: user_id あり/なし × 添付あり/なし） ----------
INSERT INTO contacts (user_id, company_name, name, phone, email, address, inquiry_type, purpose, industry, project_description, project_area, video_consultation, detail, attachments, created_at) VALUES
  -- 登録ユーザーから（user_id あり・添付なし）→「登録ユーザー」バッジ + ADM-009 導線
  ('11111111-1111-1111-1111-111111111111', '田中建設', '田中一郎', '03-1234-5678', 'contractor@test.local', '東京都台東区雷門2-3-4', '仕事掲載', '職人として仕事を探したい', '大工', NULL, NULL, NULL, '掲載中の案件について操作方法を教えてください。', NULL, now() - interval '3 days'),
  -- 非ログイン（user_id なし・添付あり: 画像 + PDF の表示分岐検証用）
  (NULL, '株式会社青空電工', '青木次郎', '045-987-6543', 'aoki@example.com', '神奈川県横浜市西区みなとみらい1-1', '協力会社募集', '協力会社を探したい', '電気', '商業ビルの電気設備更新工事を予定しています。', '神奈川県横浜市', '会社紹介動画を作りたい', '協力会社の募集と動画掲載について相談したいです。', ARRAY['contact-anon/site-photo.jpg', 'contact-anon/project-summary.pdf'], now() - interval '2 days'),
  -- 非ログイン（任意項目すべて未入力 →「—」表示の検証用）
  (NULL, '個人', '佐々木三郎', '090-1111-2222', 'sasaki@example.com', NULL, 'その他', 'サービスを詳しく知りたい', 'その他', NULL, NULL, NULL, 'サービスの利用料金について教えてください。', NULL, now() - interval '1 day');

-- ---------- 4. trouble_reports（ADM-018/019: 添付あり/なし） ----------
INSERT INTO trouble_reports (user_id, reporter_name, counterparty_name, email, category, content, attachments, created_at) VALUES
  ('cc111111-1111-1111-1111-111111111111', '高橋美咲', '山田太郎', 'contractor2@test.local', '支払いトラブル', '完了した工事の支払いが期日を過ぎても行われていません。証拠の画像を添付します。', ARRAY['cc111111-1111-1111-1111-111111111111/trouble-evidence.png'], now() - interval '2 days'),
  ('cc222222-2222-2222-2222-222222222222', '渡辺大輔', '鈴木花子', 'contractor3@test.local', '連絡が取れない', '現場の詳細について連絡しましたが、1週間以上返信がありません。', NULL, now() - interval '1 day');

-- ---------- 5. 代理メッセージスレッド（ADM-023/024） ----------
-- 鈴木工務店（法人 org 55555555）× 山本健（ad111111）。代理アカウント staff(33333333)
-- が送信した is_proxy=true メッセージを含む（ビューに現れる唯一の seed スレッド）。
-- 既存スレッド eeee02〜05 は is_proxy を含まないため「ビューに現れない通常スレッド」の
-- 検証用としてそのまま機能する。
-- 注意: UNIQUE (organization_id, participant_2_id) のため org 55555555 既存スレッドの
-- 相手（11111111 / cc111111 / cc222222 / cc333333）とは別の受注者を使うこと。
INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('adee0000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'ad111111-1111-1111-1111-111111111111', 'message', '55555555-5555-5555-5555-555555555555');

INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('adee0000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', '鈴木工務店の担当です。山本さんの対応エリアに合う現場のご案内です。', false, true, now() - interval '2 days'),
  ('adee0000-0000-4000-8000-000000000001', 'ad111111-1111-1111-1111-111111111111', 'ご案内ありがとうございます。詳細を教えてください。', false, false, now() - interval '2 days' + interval '1 hour'),
  ('adee0000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', '工期は来月上旬から2週間、場所は江東区です。ご都合いかがでしょうか。', false, true, now() - interval '1 day');

UPDATE message_threads SET updated_at = now() - interval '1 day' WHERE id = 'adee0000-0000-4000-8000-000000000001';

-- ---------- 6. 8分類検証用の応募データ（ADM-013/014） ----------
-- 既存 seed のカバレッジ: applied（bbbb...bbbc 等）/ accepted 稼働日前（aaaa...aaaa 等）/
-- accepted 稼働日経過 = 評価未入力（dd111111-...a0091）/ completed（cccc01 等）/
-- cancelled_by=contractor（cccc03）。不足分（lost / rejected / cancelled_by=admin /
-- 管理画面の発注取消 E2E 用 accepted）をここで追加する。
-- 山田建設の closed 案件に集約し、公開案件一覧（CON-002）と鈴木工務店視点の
-- CLI-007/010 E2E に影響を与えない。
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  (
    'ad660000-0000-4000-8000-000000000001',
    'aabbccdd-1111-2222-3333-444455556666',
    'aabbccdd-5555-5555-5555-555555555555',
    '管理画面検証用 改修工事（募集終了）',
    'admin 応募履歴 8分類の検証用案件です。',
    ARRAY['建築/躯体｜大工']::text[],
    3, 26000, 20000,
    CURRENT_DATE - interval '30 days', CURRENT_DATE - interval '10 days',
    CURRENT_DATE - interval '60 days', CURRENT_DATE - interval '35 days',
    'closed'
  ),
  (
    'ad660000-0000-4000-8000-000000000002',
    'aabbccdd-1111-2222-3333-444455556666',
    'aabbccdd-5555-5555-5555-555555555555',
    '管理画面検証用 内装工事（発注済み）',
    'admin 発注取消（ADM-014）の検証用案件です。',
    ARRAY['建築/仕上げ｜左官工']::text[],
    1, 24000, 20000,
    CURRENT_DATE + interval '10 days', CURRENT_DATE + interval '24 days',
    CURRENT_DATE - interval '20 days', CURRENT_DATE - interval '1 day',
    'closed'
  );

INSERT INTO job_areas (job_id, prefecture, municipality) VALUES
  ('ad660000-0000-4000-8000-000000000001', '東京都', NULL),
  ('ad660000-0000-4000-8000-000000000002', '東京都', '江東区');

INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, first_work_date, cancelled_by) VALUES
  -- 取引不成立（lost: 稼働日経過後に不成立確定）
  ('ada00000-0000-4000-8000-000000000001', 'ad660000-0000-4000-8000-000000000001', 'ad111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '25 days', 'lost', CURRENT_DATE - interval '20 days', NULL),
  -- 発注側からのお断り（rejected: 稼働日なし）
  ('ada00000-0000-4000-8000-000000000002', 'ad660000-0000-4000-8000-000000000001', 'ad222222-2222-2222-2222-222222222222', 1, 'スポット', CURRENT_DATE - interval '25 days', 'rejected', NULL, NULL),
  -- 運営によるキャンセル（cancelled_by = admin）
  -- 同一 (job, applicant) でも cancelled は applications_unique_active の対象外のため共存可
  ('ada00000-0000-4000-8000-000000000003', 'ad660000-0000-4000-8000-000000000001', 'ad111111-1111-1111-1111-111111111111', 1, '常勤', CURRENT_DATE - interval '28 days', 'cancelled', NULL, 'admin'),
  -- 発注済み・初回稼働日前（ADM-014 発注取消 E2E の使い捨て対象。db reset で復活）
  ('ada00000-0000-4000-8000-000000000004', 'ad660000-0000-4000-8000-000000000002', 'ad222222-2222-2222-2222-222222222222', 1, '常勤', CURRENT_DATE + interval '8 days', 'accepted', CURRENT_DATE + interval '10 days', NULL);

-- ---------- 7. 急募オプション active（ADM-003 オプションフィルタ検証用） ----------
-- 山田建設（aabbccdd）が自社 closed 案件に急募を購入済みの状態。
-- 案件が closed のため CON-002 の急募表示には影響しない（ADM-003 バッジのみ検証）。
INSERT INTO option_subscriptions (user_id, payment_type, stripe_payment_intent_id, option_type, status, job_id, end_date)
VALUES ('aabbccdd-1111-2222-3333-444455556666', 'one_time', 'pi_seed_urgent_yamada', 'urgent', 'active', 'ad660000-0000-4000-8000-000000000001', now() + interval '7 days');

UPDATE jobs SET is_urgent = true WHERE id = 'ad660000-0000-4000-8000-000000000001';

-- ============================================================
-- admin 手動テスト用アカウント（網羅的な手動 QA 用・db reset で復活）
-- ============================================================
-- 目的: 「一度実行すると戻せない操作」を、本番フィクスチャ（鈴木工務店 等）を
-- 壊さずに何度でも確認できるようにする。すべて固有名・案件/応募なしで、
-- 既存テストの件数・並び順アサーションに影響しない設計。
-- 固定 UUID:
--   adm-reject-identity@test.local : ad411111-...（本人確認 pending #2＝否認テスト専用。
--     created_at=now() で ADM-011 古い順の末尾に来るため既存 E2E の並びを崩さない）
--   adm-del-individual@test.local  : ade11111-...（個人発注者・案件なし＝単純削除の成功パス）
--   adm-del-corp-owner@test.local  : ade22222-...（法人 Owner・案件なし＝カスケード削除の確認）
--   adm-del-corp-staff@test.local  : ade23333-...（上記法人の担当者＝連動凍結の確認）
--   adm-del-contractor@test.local  : ade44444-...（受注者・応募なし＝受注者アカウント削除の成功パス）
--   削除テスト用 org              : ade25555-...

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('ad411111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-reject-identity@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ade11111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-del-individual@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ade22222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-del-corp-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ade23333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-del-corp-staff@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ade44444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-del-contractor@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('ad411111-1111-1111-1111-111111111111', 'ad411111-1111-1111-1111-111111111111', 'adm-reject-identity@test.local', '{"sub":"ad411111-1111-1111-1111-111111111111","email":"adm-reject-identity@test.local"}', 'email', now(), now(), now()),
  ('ade11111-1111-1111-1111-111111111111', 'ade11111-1111-1111-1111-111111111111', 'adm-del-individual@test.local', '{"sub":"ade11111-1111-1111-1111-111111111111","email":"adm-del-individual@test.local"}', 'email', now(), now(), now()),
  ('ade22222-2222-2222-2222-222222222222', 'ade22222-2222-2222-2222-222222222222', 'adm-del-corp-owner@test.local', '{"sub":"ade22222-2222-2222-2222-222222222222","email":"adm-del-corp-owner@test.local"}', 'email', now(), now(), now()),
  ('ade23333-3333-3333-3333-333333333333', 'ade23333-3333-3333-3333-333333333333', 'adm-del-corp-staff@test.local', '{"sub":"ade23333-3333-3333-3333-333333333333","email":"adm-del-corp-staff@test.local"}', 'email', now(), now(), now()),
  ('ade44444-4444-4444-4444-444444444444', 'ade44444-4444-4444-4444-444444444444', 'adm-del-contractor@test.local', '{"sub":"ade44444-4444-4444-4444-444444444444","email":"adm-del-contractor@test.local"}', 'email', now(), now(), now());

-- 本人確認 pending #2（否認テスト専用の受注者）
UPDATE public.users SET
  role = 'contractor', last_name = '森', first_name = '大地', gender = '男性',
  birth_date = '1991-03-08', prefecture = '東京都',
  bio = '解体工事を専門にしています。', skill_tags = ARRAY['内装解体工'],
  password_set_at = now()
WHERE id = 'ad411111-1111-1111-1111-111111111111';

-- 個人発注者（案件なし＝単純削除の成功パス）
UPDATE public.users SET
  role = 'client', last_name = '削除', first_name = '個人', gender = '男性',
  birth_date = '1980-06-15', prefecture = '東京都', company_name = '削除テスト個人',
  identity_verified = true, password_set_at = now()
WHERE id = 'ade11111-1111-1111-1111-111111111111';

-- 法人 Owner（案件なし＝カスケード削除の確認）
UPDATE public.users SET
  role = 'client', last_name = '削除', first_name = '法人', gender = '男性',
  birth_date = '1976-09-20', prefecture = '東京都', company_name = '削除テスト法人',
  identity_verified = true, password_set_at = now()
WHERE id = 'ade22222-2222-2222-2222-222222222222';

-- 法人の担当者（連動凍結の確認用）
UPDATE public.users SET
  role = 'staff', last_name = '削除', first_name = '担当', gender = '女性',
  birth_date = '1994-11-02', prefecture = '東京都',
  password_set_at = now()
WHERE id = 'ade23333-3333-3333-3333-333333333333';

-- 受注者（応募なし＝受注者アカウント削除の成功パス。ADM-009 削除実行の使い捨て対象。
-- 進行中取引がないため削除ガードを通過する。identity 未確認のため ADM-011 にも現れない）
UPDATE public.users SET
  role = 'contractor', last_name = '削除', first_name = '受注', gender = '男性',
  birth_date = '1990-07-25', prefecture = '東京都',
  bio = '受注者アカウント削除の検証用です。', skill_tags = ARRAY['木造軸組構法'],
  password_set_at = now()
WHERE id = 'ade44444-4444-4444-4444-444444444444';

-- skills / areas（client/contractor は正規ルート整合で必須）
INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('ad411111-1111-1111-1111-111111111111', '建築/解体｜解体工', 6),
  ('ade11111-1111-1111-1111-111111111111', '建築/内装｜木工', 3),
  ('ade22222-2222-2222-2222-222222222222', '建築/躯体｜大工', 10),
  ('ade44444-4444-4444-4444-444444444444', '建築/躯体｜大工', 4);
INSERT INTO user_available_areas (user_id, prefecture, municipality) VALUES
  ('ad411111-1111-1111-1111-111111111111', '東京都', NULL),
  ('ade11111-1111-1111-1111-111111111111', '東京都', NULL),
  ('ade22222-2222-2222-2222-222222222222', '東京都', NULL),
  ('ade44444-4444-4444-4444-444444444444', '東京都', NULL);

-- 本人確認 pending #2（created_at=now() で ADM-011 の古い順では末尾）
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, created_at) VALUES
  ('ad411111-1111-1111-1111-111111111111', 'identity', 'ad411111-1111-1111-1111-111111111111/identity-front.png', 'pending', now());

-- 削除テスト用発注者の identity approved（identity_verified=true の整合）
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at) VALUES
  ('ade11111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('ade22222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now());

-- サブスクリプション（個人＝individual / 法人＝corporate。stripe id なし＝解約は安全にスキップ）
INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('ade11111-1111-1111-1111-111111111111', 'individual', 'active', now(), now() + interval '30 days'),
  ('ade22222-2222-2222-2222-222222222222', 'corporate', 'active', now(), now() + interval '30 days');

-- client_profiles（発注者表示名）
INSERT INTO client_profiles (user_id, display_name) VALUES
  ('ade11111-1111-1111-1111-111111111111', '削除テスト個人'),
  ('ade22222-2222-2222-2222-222222222222', '削除テスト法人');

-- 削除テスト法人の組織＋メンバー（Owner＋担当者）
INSERT INTO organizations (id, owner_id) VALUES
  ('ade25555-5555-5555-5555-555555555555', 'ade22222-2222-2222-2222-222222222222');
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('ade25555-5555-5555-5555-555555555555', 'ade22222-2222-2222-2222-222222222222', 'owner', false),
  ('ade25555-5555-5555-5555-555555555555', 'ade23333-3333-3333-3333-333333333333', 'staff', false);

-- ============================================================
-- admin QA: ADM-013 応募履歴一覧 ページング確認用パディング
-- ============================================================
-- 目的: 既定（無絞り込み）の一覧が 20 件を超え「次の20件」ボタンが出る状態を再現する。
-- 設計: ページング専用の使い捨て受注者「ページング太郎」を 1 人だけ作り、12 件の
--   open 案件へ status='applied'（8分類=応募中）で応募させる。新規ユーザーなので
--   既存テスト・画面の件数前提から完全に独立する。
--   ・applications_unique_active（同一 job×applicant で非キャンセル 1 件）を満たすため
--     12 件はすべて別案件。cancelled を作らないので cancelled_by 系テストに不干渉
--   ・id 帯 adf1.... は既存 application/user id と衝突しない
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('adf11111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-paging@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('adf11111-1111-1111-1111-111111111111', 'adf11111-1111-1111-1111-111111111111', 'adm-paging@test.local', '{"sub":"adf11111-1111-1111-1111-111111111111","email":"adm-paging@test.local"}', 'email', now(), now(), now());

UPDATE public.users SET
  role = 'contractor', last_name = 'ページング', first_name = '太郎', gender = '男性',
  birth_date = '1992-05-05', prefecture = '東京都',
  bio = 'ページング確認用のダミー受注者です。', skill_tags = ARRAY['木造軸組構法'],
  password_set_at = now()
WHERE id = 'adf11111-1111-1111-1111-111111111111';

INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('adf11111-1111-1111-1111-111111111111', '建築/躯体｜大工', 3);
INSERT INTO user_available_areas (user_id, prefecture, municipality) VALUES
  ('adf11111-1111-1111-1111-111111111111', '東京都', NULL);

-- 12 件の open 案件へ「応募中」を投入（19 件 + 12 件 = 31 件 → 1 ページ目 20 件 + 2 ページ目 11 件）
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, status, created_at)
SELECT
  ('adf10000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  (ARRAY[
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-888888888881',
    '88888888-8888-8888-8888-888888888882',
    '88888888-8888-8888-8888-888888888883',
    '88888888-8888-8888-8888-888888888884',
    '88888888-8888-8888-8888-888888888885',
    '88888888-8888-8888-8888-888888888886',
    '88888888-8888-8888-8888-888888888898',
    '99999999-9999-9999-9999-999999999990',
    'aabbccdd-6666-6666-6666-666666666661',
    'b1116666-0000-1000-8000-000000000001'
  ])[g]::uuid,
  'adf11111-1111-1111-1111-111111111111',
  1, '常勤', 'applied',
  now() - (g || ' minutes')::interval
FROM generate_series(1, 12) AS g;

-- ============================================================
-- proxy-account-multi-org-support Phase 3 / Task 3.2
-- ============================================================
-- N 法人兼任の代理スタッフ検証用 seed。既存のテストユーザー・法人とは
-- 完全に独立した新規ツリー（id 帯 f777...）で構築する。
--
-- 構成:
--   * proxy-x-owner@test.local (f7771111-...) — 法人 X の Owner（client）
--   * proxy-y-owner@test.local (f7772222-...) — 法人 Y の Owner（client）
--   * proxy-multi@test.local   (f777aaaa-...) — 法人 X / Y の代理スタッフ（兼任）
--   * proxy-con@test.local     (f777cccc-...) — 動作確認用の受注者
--   * 法人 X (f777a111-...) — メンバー created_at: 2026-01-01 (= 最古、既定組織)
--   * 法人 Y (f777b222-...) — メンバー created_at: 2026-02-01
--   * 各法人に 1 件ずつメッセージスレッド（proxy-multi が代理として参加）
--
-- ねらい:
--   - getActiveOrganizationContext の N 組織パス（Cookie 解決 / 既定値 = 最古）を E2E で踏む
--   - 法人 X が「既定組織」になることをスモークテストで確認する
--   - 既存の seed 法人（55555555-... / aabbccdd-... / ade2.... 等）には触れない
-- ============================================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  ('f7771111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proxy-x-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f7772222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proxy-y-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proxy-multi@test.local',   crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"invited_role":"staff"}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f777cccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proxy-con@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('f7771111-1111-1111-1111-111111111111', 'f7771111-1111-1111-1111-111111111111', 'proxy-x-owner@test.local', '{"sub":"f7771111-1111-1111-1111-111111111111","email":"proxy-x-owner@test.local"}', 'email', now(), now(), now()),
  ('f7772222-2222-2222-2222-222222222222', 'f7772222-2222-2222-2222-222222222222', 'proxy-y-owner@test.local', '{"sub":"f7772222-2222-2222-2222-222222222222","email":"proxy-y-owner@test.local"}', 'email', now(), now(), now()),
  ('f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'proxy-multi@test.local',   '{"sub":"f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"proxy-multi@test.local"}',   'email', now(), now(), now()),
  ('f777cccc-cccc-cccc-cccc-cccccccccccc', 'f777cccc-cccc-cccc-cccc-cccccccccccc', 'proxy-con@test.local',     '{"sub":"f777cccc-cccc-cccc-cccc-cccccccccccc","email":"proxy-con@test.local"}',     'email', now(), now(), now());

UPDATE public.users SET
  role = 'client', last_name = 'プロキシ', first_name = '甲社長',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f7771111-1111-1111-1111-111111111111';

UPDATE public.users SET
  role = 'client', last_name = 'プロキシ', first_name = '乙社長',
  gender = '男性', birth_date = '1980-01-01', prefecture = '大阪府',
  identity_verified = true, password_set_at = now()
WHERE id = 'f7772222-2222-2222-2222-222222222222';

UPDATE public.users SET
  role = 'staff', last_name = '代理', first_name = '太郎',
  gender = '男性', birth_date = '1992-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.users SET
  role = 'contractor', last_name = '代理確認', first_name = '次郎',
  gender = '男性', birth_date = '1990-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now(),
  skill_tags = ARRAY['木造軸組構法']
WHERE id = 'f777cccc-cccc-cccc-cccc-cccccccccccc';

INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('f777cccc-cccc-cccc-cccc-cccccccccccc', '建築/躯体｜大工', 5);
INSERT INTO user_available_areas (user_id, prefecture, municipality) VALUES
  ('f777cccc-cccc-cccc-cccc-cccccccccccc', '東京都', NULL);

INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('f7771111-1111-1111-1111-111111111111', 'corporate', 'active', now(), now() + interval '30 days'),
  ('f7772222-2222-2222-2222-222222222222', 'corporate', 'active', now(), now() + interval '30 days');

INSERT INTO client_profiles (user_id, display_name) VALUES
  ('f7771111-1111-1111-1111-111111111111', 'プロキシ法人 X 株式会社'),
  ('f7772222-2222-2222-2222-222222222222', 'プロキシ法人 Y 株式会社');

INSERT INTO organizations (id, owner_id) VALUES
  ('f777a111-1111-1111-1111-111111111111', 'f7771111-1111-1111-1111-111111111111'),
  ('f777b222-2222-2222-2222-222222222222', 'f7772222-2222-2222-2222-222222222222');

-- 組織メンバー: Owner + 代理スタッフ（兼任）。created_at を明示し proxy-multi の
-- 法人 X 在籍が「最古」になるよう順序付ける（Cookie 不在時の既定値が法人 X）。
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account, created_at) VALUES
  ('f777a111-1111-1111-1111-111111111111', 'f7771111-1111-1111-1111-111111111111', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f777b222-2222-2222-2222-222222222222', 'f7772222-2222-2222-2222-222222222222', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f777a111-1111-1111-1111-111111111111', 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff', true,  '2026-01-01 00:00:00+00'),
  ('f777b222-2222-2222-2222-222222222222', 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff', true,  '2026-02-01 00:00:00+00');

INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('f777eeee-0001-0001-0001-000000000001', 'f7771111-1111-1111-1111-111111111111', 'f777cccc-cccc-cccc-cccc-cccccccccccc', 'message', 'f777a111-1111-1111-1111-111111111111'),
  ('f777eeee-0002-0002-0002-000000000002', 'f7772222-2222-2222-2222-222222222222', 'f777cccc-cccc-cccc-cccc-cccccccccccc', 'message', 'f777b222-2222-2222-2222-222222222222');

INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('f777eeee-0001-0001-0001-000000000001', 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '法人 X からの代理メッセージです。', false, true, now()),
  ('f777eeee-0002-0002-0002-000000000002', 'f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '法人 Y からの代理メッセージです。', false, true, now());

-- ============================================================
-- proxy-account-multi-org-support Phase 8 / Task 8.1〜8.5 E2E fixtures
-- ============================================================
-- N 法人兼任 E2E のシナリオ別に独立した法人ツリーを用意する。
-- 既存の proxy-multi（f777...）系には触れず、id 帯 f888... で完全分離。
--
-- 制約: organization_members_proxy_unique（partial UNIQUE on (organization_id)
-- WHERE is_proxy_account = true）により「1 組織 = 1 代理」。各 target に対し
-- シナリオ独立の専用 Org を 1〜2 個用意する。
--
-- 構成:
--   * 法人 Z1 (f888a111) — Z1Owner (f8881111)。phase8-reuse-target を代理
--   * 法人 Z2 (f888b222) — Z2Owner (f8882222)。8.1 と 8.5 の招待 actor。初期代理なし
--   * 法人 Z3 (f888c333) — Z3Owner (f8883333)。phase8-multi-keep を代理。8.2 で削除される側
--   * 法人 Z4 (f888d444) — Z4Owner (f8884444)。phase8-multi-keep を代理。8.2 で残存する側
--   * 法人 Z5 (f888e555) — Z5Owner (f8885555)。phase8-cancel-keep を代理。8.3 で解約される側
--     [corporate active sub_phase8_z5、stripe_subscription_id 付き]
--   * 法人 Z6 (f888f666) — Z6Owner (f8886666)。phase8-cancel-keep を代理。8.3 で残存する側
--   * 法人 Z7 (f8889977) — Z7Owner (f8887777)。phase8-name-mismatch を代理。8.5 の本人氏名解決元
--
-- Target ユーザー:
--   * phase8-reuse-target  (f888aaaa) — Z1 のみ。8.1 で Z2 owner が招待 → reuse path で Z2 にも追加
--   * phase8-multi-keep    (f888bbbb) — Z3 + Z4。8.2 で Z3 owner が削除 → Z4 だけ残る
--   * phase8-cancel-keep   (f888cccc) — Z5 + Z6。8.3 で Z5 解約 → Z6 だけ残る
--   * phase8-name-mismatch (f888dddd) — Z7 のみ。本来「田中 太郎」。8.5 で Z2 owner が違う氏名で招待 → 拒否
--
-- 設計のキー:
--   - 各シナリオを完全分離して、互いの mutate に依存しない
--   - 全 corporate sub に stripe_subscription_id を付け、8.3 の RPC 直接呼び出しに対応
--   - 8.2 検証用に Z4 に phase8-multi-keep 絡みのスレッド 1 件を用意
-- ============================================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES
  -- Owners (Z1〜Z7)
  ('f8881111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z1-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8882222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z2-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8883333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z3-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8884444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z4-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8885555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z5-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8886666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z6-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f8887777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-z7-owner@test.local',     crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  -- Targets
  ('f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-reuse-target@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"invited_role":"staff"}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-multi-keep@test.local',   crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"invited_role":"staff"}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f888cccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-cancel-keep@test.local',  crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"invited_role":"staff"}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('f888dddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-name-mismatch@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"invited_role":"staff"}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('f8881111-1111-1111-1111-111111111111', 'f8881111-1111-1111-1111-111111111111', 'phase8-z1-owner@test.local',     '{"sub":"f8881111-1111-1111-1111-111111111111","email":"phase8-z1-owner@test.local"}',     'email', now(), now(), now()),
  ('f8882222-2222-2222-2222-222222222222', 'f8882222-2222-2222-2222-222222222222', 'phase8-z2-owner@test.local',     '{"sub":"f8882222-2222-2222-2222-222222222222","email":"phase8-z2-owner@test.local"}',     'email', now(), now(), now()),
  ('f8883333-3333-3333-3333-333333333333', 'f8883333-3333-3333-3333-333333333333', 'phase8-z3-owner@test.local',     '{"sub":"f8883333-3333-3333-3333-333333333333","email":"phase8-z3-owner@test.local"}',     'email', now(), now(), now()),
  ('f8884444-4444-4444-4444-444444444444', 'f8884444-4444-4444-4444-444444444444', 'phase8-z4-owner@test.local',     '{"sub":"f8884444-4444-4444-4444-444444444444","email":"phase8-z4-owner@test.local"}',     'email', now(), now(), now()),
  ('f8885555-5555-5555-5555-555555555555', 'f8885555-5555-5555-5555-555555555555', 'phase8-z5-owner@test.local',     '{"sub":"f8885555-5555-5555-5555-555555555555","email":"phase8-z5-owner@test.local"}',     'email', now(), now(), now()),
  ('f8886666-6666-6666-6666-666666666666', 'f8886666-6666-6666-6666-666666666666', 'phase8-z6-owner@test.local',     '{"sub":"f8886666-6666-6666-6666-666666666666","email":"phase8-z6-owner@test.local"}',     'email', now(), now(), now()),
  ('f8887777-7777-7777-7777-777777777777', 'f8887777-7777-7777-7777-777777777777', 'phase8-z7-owner@test.local',     '{"sub":"f8887777-7777-7777-7777-777777777777","email":"phase8-z7-owner@test.local"}',     'email', now(), now(), now()),
  ('f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'phase8-reuse-target@test.local', '{"sub":"f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"phase8-reuse-target@test.local"}', 'email', now(), now(), now()),
  ('f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'phase8-multi-keep@test.local',   '{"sub":"f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"phase8-multi-keep@test.local"}',   'email', now(), now(), now()),
  ('f888cccc-cccc-cccc-cccc-cccccccccccc', 'f888cccc-cccc-cccc-cccc-cccccccccccc', 'phase8-cancel-keep@test.local',  '{"sub":"f888cccc-cccc-cccc-cccc-cccccccccccc","email":"phase8-cancel-keep@test.local"}',  'email', now(), now(), now()),
  ('f888dddd-dddd-dddd-dddd-dddddddddddd', 'f888dddd-dddd-dddd-dddd-dddddddddddd', 'phase8-name-mismatch@test.local','{"sub":"f888dddd-dddd-dddd-dddd-dddddddddddd","email":"phase8-name-mismatch@test.local"}','email', now(), now(), now());

-- Owner ユーザーは client / identity_verified=true / 法人プラン契約者
UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z1', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8881111-1111-1111-1111-111111111111';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z2', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8882222-2222-2222-2222-222222222222';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z3', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8883333-3333-3333-3333-333333333333';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z4', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8884444-4444-4444-4444-444444444444';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z5', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8885555-5555-5555-5555-555555555555';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z6', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8886666-6666-6666-6666-666666666666';

UPDATE public.users SET
  role = 'client', last_name = 'Phase8Z7', first_name = 'オーナー',
  gender = '男性', birth_date = '1980-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f8887777-7777-7777-7777-777777777777';

-- 代理 target ユーザーは staff role 固定
UPDATE public.users SET
  role = 'staff', last_name = 'リユース', first_name = '対象',
  gender = '男性', birth_date = '1992-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.users SET
  role = 'staff', last_name = 'マルチ', first_name = '残存',
  gender = '男性', birth_date = '1992-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

UPDATE public.users SET
  role = 'staff', last_name = '解約', first_name = '残存',
  gender = '男性', birth_date = '1992-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f888cccc-cccc-cccc-cccc-cccccccccccc';

UPDATE public.users SET
  role = 'staff', last_name = '田中', first_name = '太郎',
  gender = '男性', birth_date = '1992-01-01', prefecture = '東京都',
  identity_verified = true, password_set_at = now()
WHERE id = 'f888dddd-dddd-dddd-dddd-dddddddddddd';

-- 全 Owner に corporate active subscription を付与（stripe_subscription_id 必須: 8.3 で RPC 直接呼び出し）
INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, stripe_subscription_id) VALUES
  ('f8881111-1111-1111-1111-111111111111', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z1'),
  ('f8882222-2222-2222-2222-222222222222', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z2'),
  ('f8883333-3333-3333-3333-333333333333', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z3'),
  ('f8884444-4444-4444-4444-444444444444', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z4'),
  ('f8885555-5555-5555-5555-555555555555', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z5'),
  ('f8886666-6666-6666-6666-666666666666', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z6'),
  ('f8887777-7777-7777-7777-777777777777', 'corporate', 'active', now(), now() + interval '30 days', 'sub_phase8_z7');

INSERT INTO client_profiles (user_id, display_name) VALUES
  ('f8881111-1111-1111-1111-111111111111', 'Phase8 法人 Z1'),
  ('f8882222-2222-2222-2222-222222222222', 'Phase8 法人 Z2'),
  ('f8883333-3333-3333-3333-333333333333', 'Phase8 法人 Z3'),
  ('f8884444-4444-4444-4444-444444444444', 'Phase8 法人 Z4'),
  ('f8885555-5555-5555-5555-555555555555', 'Phase8 法人 Z5'),
  ('f8886666-6666-6666-6666-666666666666', 'Phase8 法人 Z6'),
  ('f8887777-7777-7777-7777-777777777777', 'Phase8 法人 Z7');

INSERT INTO organizations (id, owner_id) VALUES
  ('f888a111-1111-1111-1111-111111111111', 'f8881111-1111-1111-1111-111111111111'),
  ('f888b222-2222-2222-2222-222222222222', 'f8882222-2222-2222-2222-222222222222'),
  ('f888c333-3333-3333-3333-333333333333', 'f8883333-3333-3333-3333-333333333333'),
  ('f888d444-4444-4444-4444-444444444444', 'f8884444-4444-4444-4444-444444444444'),
  ('f888e555-5555-5555-5555-555555555555', 'f8885555-5555-5555-5555-555555555555'),
  ('f888f666-6666-6666-6666-666666666666', 'f8886666-6666-6666-6666-666666666666'),
  ('f8889977-7777-7777-7777-777777777777', 'f8887777-7777-7777-7777-777777777777');

-- 各法人の Owner + シナリオ別 target を組織メンバーに追加
-- 1 組織につき max 1 代理（partial UNIQUE）に注意。
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account, created_at) VALUES
  -- Owners
  ('f888a111-1111-1111-1111-111111111111', 'f8881111-1111-1111-1111-111111111111', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f888b222-2222-2222-2222-222222222222', 'f8882222-2222-2222-2222-222222222222', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f888c333-3333-3333-3333-333333333333', 'f8883333-3333-3333-3333-333333333333', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f888d444-4444-4444-4444-444444444444', 'f8884444-4444-4444-4444-444444444444', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f888e555-5555-5555-5555-555555555555', 'f8885555-5555-5555-5555-555555555555', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f888f666-6666-6666-6666-666666666666', 'f8886666-6666-6666-6666-666666666666', 'owner', false, '2025-12-31 00:00:00+00'),
  ('f8889977-7777-7777-7777-777777777777', 'f8887777-7777-7777-7777-777777777777', 'owner', false, '2025-12-31 00:00:00+00'),
  -- 8.1 (Z1 → Z2 招待): phase8-reuse-target は Z1 のみ。Z2 は actor 用に proxy 無し。
  ('f888a111-1111-1111-1111-111111111111', 'f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff', true, '2026-01-01 00:00:00+00'),
  -- 8.2 (Z3 で削除 → Z4 残存): phase8-multi-keep は Z3 + Z4 両方
  ('f888c333-3333-3333-3333-333333333333', 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staff', true, '2026-01-01 00:00:00+00'),
  ('f888d444-4444-4444-4444-444444444444', 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staff', true, '2026-02-01 00:00:00+00'),
  -- 8.3 (Z5 解約 → Z6 残存): phase8-cancel-keep は Z5 + Z6 両方
  ('f888e555-5555-5555-5555-555555555555', 'f888cccc-cccc-cccc-cccc-cccccccccccc', 'staff', true, '2026-01-01 00:00:00+00'),
  ('f888f666-6666-6666-6666-666666666666', 'f888cccc-cccc-cccc-cccc-cccccccccccc', 'staff', true, '2026-02-01 00:00:00+00'),
  -- 8.5 (氏名不一致): phase8-name-mismatch は Z7 のみ。本来「田中 太郎」、Z2 owner が違う氏名で招待 → reject
  ('f8889977-7777-7777-7777-777777777777', 'f888dddd-dddd-dddd-dddd-dddddddddddd', 'staff', true, '2026-01-01 00:00:00+00');

-- 8.2 検証用: Z4 で phase8-multi-keep が代理として絡んでいるスレッドを 1 件用意
-- （Z3 削除後に Z4 のデータが影響を受けないことを確認するため）
INSERT INTO message_threads (id, participant_1_id, participant_2_id, thread_type, organization_id) VALUES
  ('f888eeee-0002-0002-0002-000000000002', 'f8884444-4444-4444-4444-444444444444', 'f777cccc-cccc-cccc-cccc-cccccccccccc', 'message', 'f888d444-4444-4444-4444-444444444444');

INSERT INTO messages (thread_id, sender_id, body, is_scout, is_proxy, created_at) VALUES
  ('f888eeee-0002-0002-0002-000000000002', 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Phase8 Z4 スレッド: 削除後も残るメッセージです。', false, true, now());
