-- ============================================================
-- ⚠️⚠️⚠️  本番データベースには絶対に Run しないでください  ⚠️⚠️⚠️
-- ⚠️⚠️⚠️  DO NOT RUN THIS AGAINST PRODUCTION SUPABASE     ⚠️⚠️⚠️
-- ============================================================
--
-- このファイルは【staging Supabase 専用】の見た目確認用テストデータです。
--   対象プロジェクト: bijiyu-staging
--   project ref     : mfrlsbnqybvkzwsmiolm
--
-- 本番データベース (bijiyu) で Run すると、架空ユーザー (@test.local) と
-- ダミー案件が本番サービスに混入し、実際のお客様に見えてしまいます。
--
-- 実行前チェックリスト（毎回目視で確認する）:
--   □ Supabase Dashboard 左上のパンくずが "bijiyu-staging" になっているか
--   □ URL に "mfrlsbnqybvkzwsmiolm" が含まれているか
--   □ 本番 (bijiyu) を絶対に選んでいないか
--
-- パスワード testpass123 は staging 用のダミー。本番で流用しないこと。
--
-- 削除したくなったら: 開発者に「staging のテストデータを消して」と依頼して
-- 削除 SQL を作ってもらう。このファイルの逆処理を手で書かないこと。
--
-- ============================================================
-- seed-staging-minimal.sql — staging Supabase Cloud 用 見た目確認シード
-- ============================================================
-- 目的  : bijiyu-staging (Supabase Cloud) に UI 見た目確認用のテストデータを投入する
-- 対象  : 8 ユーザー + 12 案件 + 関連データ (subscriptions / organizations / applications 2件)
-- 抽出元: supabase/seed.sql (ローカルテスト用の全 2,129 行)
-- 実行  : Supabase Dashboard > SQL Editor に本ファイル全文を貼り付けて Run
-- 冪等性: ON CONFLICT DO NOTHING で 2 回流しても壊れない
-- 保護  : 既存の管理者ユーザー (クライアント Workspace メアド, role=admin) は一切触らない
--         seed.sql の admin@test.local (44444444-...) は含めない
-- パスワード: 全ユーザー共通 testpass123
-- ============================================================

BEGIN;

-- ============================================================
-- 1. auth.users (8 名)
-- ============================================================
-- 田中一郎/高橋美咲/渡辺大輔/中村由美/木村洋一/鈴木花子/山田太郎/佐藤健太
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  phone, phone_change, phone_change_token, email_change_token_current,
  email_change_confirm_status, reauthentication_token, is_sso_user
) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contractor@test.local',        crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('cc111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contractor2@test.local',       crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('cc222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contractor3@test.local',       crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('dd111111-1111-2222-3333-444455556666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'individual-client@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('ad333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-small-client@test.local',  crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client@test.local',            crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('aabbccdd-1111-2222-3333-444455556666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client2@test.local',           crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local',             crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. auth.identities (8 名)
-- ============================================================
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'contractor@test.local',        '{"sub":"11111111-1111-1111-1111-111111111111","email":"contractor@test.local"}',        'email', now(), now(), now()),
  ('cc111111-1111-1111-1111-111111111111', 'cc111111-1111-1111-1111-111111111111', 'contractor2@test.local',       '{"sub":"cc111111-1111-1111-1111-111111111111","email":"contractor2@test.local"}',       'email', now(), now(), now()),
  ('cc222222-2222-2222-2222-222222222222', 'cc222222-2222-2222-2222-222222222222', 'contractor3@test.local',       '{"sub":"cc222222-2222-2222-2222-222222222222","email":"contractor3@test.local"}',       'email', now(), now(), now()),
  ('dd111111-1111-2222-3333-444455556666', 'dd111111-1111-2222-3333-444455556666', 'individual-client@test.local', '{"sub":"dd111111-1111-2222-3333-444455556666","email":"individual-client@test.local"}', 'email', now(), now(), now()),
  ('ad333333-3333-3333-3333-333333333333', 'ad333333-3333-3333-3333-333333333333', 'adm-small-client@test.local',  '{"sub":"ad333333-3333-3333-3333-333333333333","email":"adm-small-client@test.local"}',  'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'client@test.local',            '{"sub":"22222222-2222-2222-2222-222222222222","email":"client@test.local"}',            'email', now(), now(), now()),
  ('aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-1111-2222-3333-444455556666', 'client2@test.local',           '{"sub":"aabbccdd-1111-2222-3333-444455556666","email":"client2@test.local"}',           'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'staff@test.local',             '{"sub":"33333333-3333-3333-3333-333333333333","email":"staff@test.local"}',             'email', now(), now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. public.users (auth トリガーで自動作成された行を UPDATE で上書き)
-- ============================================================
-- 受注者1: 田中一郎 (無料・本人確認済み)
UPDATE public.users SET
  role = 'contractor', last_name = '田中', first_name = '一郎', gender = '男性', birth_date = '1990-05-15',
  prefecture = '東京都', municipality = '港区', company_name = '田中建設',
  bio = '大工歴10年。木造住宅を得意としています。',
  identity_verified = true, ccus_verified = true,
  skill_tags = ARRAY['木造軸組構法', '造作大工', '内装仕上工']
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 受注者2: 高橋美咲 (塗装工・左官)
UPDATE public.users SET
  role = 'contractor', last_name = '高橋', first_name = '美咲', gender = '女性', birth_date = '1992-07-22',
  prefecture = '神奈川県', municipality = '横浜市西区', company_name = NULL,
  bio = '塗装工歴8年。外壁・内壁の塗装を専門にしています。左官工事も対応可能です。',
  identity_verified = true, ccus_verified = true,
  skill_tags = ARRAY['吹付塗装工', '壁装（クロス）工', '造作大工']
WHERE id = 'cc111111-1111-1111-1111-111111111111';

-- 受注者3: 渡辺大輔 (電気工事士・配管工)
UPDATE public.users SET
  role = 'contractor', last_name = '渡辺', first_name = '大輔', gender = '男性', birth_date = '1988-02-14',
  prefecture = '東京都', municipality = '渋谷区', company_name = '渡辺電設',
  bio = '電気工事士として15年の経験があります。商業施設・住宅問わず対応可能です。',
  identity_verified = true, ccus_verified = false,
  skill_tags = ARRAY['送配電線工', '受変電設備工', '配管工（給排水・衛生）']
WHERE id = 'cc222222-2222-2222-2222-222222222222';

-- 個人発注者: 中村由美
UPDATE public.users SET
  role = 'client', last_name = '中村', first_name = '由美', gender = '女性', birth_date = '1988-07-22',
  prefecture = '埼玉県', company_name = '中村リフォーム',
  bio = '個人で小規模リフォームの発注をしています。',
  identity_verified = true, ccus_verified = false
WHERE id = 'dd111111-1111-2222-3333-444455556666';

-- 小規模発注者: 木村洋一
UPDATE public.users SET
  role = 'client', last_name = '木村', first_name = '洋一', gender = '男性', birth_date = '1975-02-10',
  prefecture = '静岡県', company_name = '木村工務店',
  bio = '静岡県内で小規模工務店を営んでいます。',
  identity_verified = true, password_set_at = now()
WHERE id = 'ad333333-3333-3333-3333-333333333333';

-- 法人発注者 Owner: 鈴木花子
UPDATE public.users SET
  role = 'client', last_name = '鈴木', first_name = '花子', gender = '女性', birth_date = '1985-03-20',
  prefecture = '神奈川県', company_name = '鈴木工務店株式会社',
  bio = '神奈川県を中心にリフォーム工事を行っています。',
  identity_verified = true, ccus_verified = true
WHERE id = '22222222-2222-2222-2222-222222222222';

-- 法人発注者2 Owner: 山田太郎
UPDATE public.users SET
  role = 'client', last_name = '山田', first_name = '太郎', gender = '男性', birth_date = '1978-08-12',
  prefecture = '東京都', company_name = '山田建設株式会社',
  bio = '東京都内を中心にマンション建設・改修工事を行っています。',
  identity_verified = true, ccus_verified = false
WHERE id = 'aabbccdd-1111-2222-3333-444455556666';

-- 法人スタッフ: 佐藤健太 (鈴木工務店所属)
UPDATE public.users SET
  role = 'staff', last_name = '佐藤', first_name = '健太', gender = '男性', birth_date = '1995-11-10',
  prefecture = '東京都', company_name = '鈴木工務店株式会社',
  bio = '担当者として案件管理を行っています。'
WHERE id = '33333333-3333-3333-3333-333333333333';

-- ============================================================
-- 4. identity_verifications (本人確認バッジ表示用)
-- ============================================================
INSERT INTO identity_verifications (user_id, document_type, document_url_1, status, reviewed_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('11111111-1111-1111-1111-111111111111', 'ccus',     'dummy/ccus-doc.png',     'approved', now()),
  ('cc111111-1111-1111-1111-111111111111', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('cc111111-1111-1111-1111-111111111111', 'ccus',     'dummy/ccus-doc.png',     'approved', now()),
  ('cc222222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('22222222-2222-2222-2222-222222222222', 'ccus',     'dummy/ccus-doc.png',     'approved', now()),
  ('aabbccdd-1111-2222-3333-444455556666', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('dd111111-1111-2222-3333-444455556666', 'identity', 'dummy/identity-doc.png', 'approved', now()),
  ('ad333333-3333-3333-3333-333333333333', 'identity', 'dummy/identity-doc.png', 'approved', now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. user_skills (受注者のスキル + 発注者もレギュレーション上必要)
-- ============================================================
INSERT INTO user_skills (user_id, trade_type, experience_years) VALUES
  ('11111111-1111-1111-1111-111111111111', '建築/躯体｜大工', 10),
  ('11111111-1111-1111-1111-111111111111', '建築/内装｜木工', 5),
  ('cc111111-1111-1111-1111-111111111111', '建築/仕上げ｜塗装工', 8),
  ('cc111111-1111-1111-1111-111111111111', '建築/仕上げ｜左官工', 4),
  ('cc222222-2222-2222-2222-222222222222', '設備/施工｜電気（その他全般）', 15),
  ('cc222222-2222-2222-2222-222222222222', '設備/施工｜配管工（塩ビ管）', 6),
  ('22222222-2222-2222-2222-222222222222', '建築/内装｜木工', 8),
  ('aabbccdd-1111-2222-3333-444455556666', '建築/躯体｜鉄筋工', 12),
  ('dd111111-1111-2222-3333-444455556666', '建築/内装｜木工', 5),
  ('ad333333-3333-3333-3333-333333333333', '建築/躯体｜大工', 20)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. user_qualifications (受注者の資格)
-- ============================================================
INSERT INTO user_qualifications (user_id, qualification_name) VALUES
  ('11111111-1111-1111-1111-111111111111', '1級建築士'),
  ('11111111-1111-1111-1111-111111111111', '2級建築施工管理技士'),
  ('cc111111-1111-1111-1111-111111111111', '登録建設塗装基幹技能者'),
  ('cc222222-2222-2222-2222-222222222222', '第2種電気工事士'),
  ('cc222222-2222-2222-2222-222222222222', '1級電気工事施工管理技士')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. user_available_areas (対応可能エリア)
-- ============================================================
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
  ('22222222-2222-2222-2222-222222222222', '神奈川県', NULL),
  ('22222222-2222-2222-2222-222222222222', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '東京都',   NULL),
  ('ad333333-3333-3333-3333-333333333333', '静岡県',   NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. subscriptions (発注者のみ)
-- ============================================================
-- 受注者・staff は subscription を持たない
INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end) VALUES
  ('22222222-2222-2222-2222-222222222222', 'corporate',  'active', now(), now() + interval '30 days'),
  ('aabbccdd-1111-2222-3333-444455556666', 'small',      'active', now(), now() + interval '30 days'),
  ('dd111111-1111-2222-3333-444455556666', 'individual', 'active', now(), now() + interval '30 days'),
  ('ad333333-3333-3333-3333-333333333333', 'small',      'active', now(), now() + interval '30 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. organizations (2 組織)
-- ============================================================
INSERT INTO organizations (id, owner_id) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222'),
  ('aabbccdd-5555-5555-5555-555555555555', 'aabbccdd-1111-2222-3333-444455556666')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. organization_members
-- ============================================================
-- 佐藤健太 (staff@) は 鈴木工務店の通常スタッフとして所属 (is_proxy_account=false)
-- ※ seed.sql では代理アカウント (proxy=true) だが、見た目確認では通常スタッフの方が
--    自然なため false にしている
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'owner', false),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'staff', false),
  ('aabbccdd-5555-5555-5555-555555555555', 'aabbccdd-1111-2222-3333-444455556666', 'owner', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 11. client_profiles (発注者表示名 = display_name)
-- ============================================================
INSERT INTO client_profiles (user_id, display_name, address, recruit_job_types, working_way, employee_scale, message, language) VALUES
  ('22222222-2222-2222-2222-222222222222',       '鈴木工務店株式会社', '東京都墨田区向島1-2-3',      '{"建築/躯体｜大工","建築/内装｜木工","設備/施工｜電気（その他全般）"}', '{"1日から可","短期歓迎"}',  15, '一緒に働いてくれる職人さんを募集しています。', '{"日本語"}'),
  ('aabbccdd-1111-2222-3333-444455556666',       '山田建設株式会社', '埼玉県さいたま市大宮区4-5-6', '{"建築/躯体｜大工","建築/躯体｜鉄筋工","建築/躯体｜型枠工"}',           '{"長期歓迎","常用希望"}',   30, '大規模建築を中心に手がけています。職人さん大募集中です。', '{"日本語","英語"}'),
  ('dd111111-1111-2222-3333-444455556666',       '中村リフォーム',   NULL,                          '{"建築/躯体｜大工","建築/内装｜木工"}',                                  '{"1日から可"}',              1, '小規模リフォームの発注をしています。', '{"日本語"}'),
  ('ad333333-3333-3333-3333-333333333333',       '木村工務店',       NULL,                          NULL,                                                                     NULL,                       NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. client_recruit_areas (募集エリア)
-- ============================================================
INSERT INTO client_recruit_areas (client_id, prefecture, municipality) VALUES
  ('22222222-2222-2222-2222-222222222222', '東京都',   '港区'),
  ('22222222-2222-2222-2222-222222222222', '大阪府',   '大阪市北区'),
  ('aabbccdd-1111-2222-3333-444455556666', '東京都',   NULL),
  ('aabbccdd-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '埼玉県',   NULL),
  ('dd111111-1111-2222-3333-444455556666', '東京都',   NULL),
  ('ad333333-3333-3333-3333-333333333333', '静岡県',   NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. jobs (12 案件)
-- ============================================================
INSERT INTO jobs (id, owner_id, organization_id, title, description, trade_types, headcount, reward_upper, reward_lower, work_start_date, work_end_date, recruit_start_date, recruit_end_date, status) VALUES
  -- 鈴木工務店 (client@) の 6 案件
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '木造住宅の内装リフォーム工事',        '横浜市内の木造住宅のリフォーム工事です。内装の壁紙張り替え、フローリング張り替えをお願いします。',
   ARRAY['建築/内装｜木工']::text[],       2, 25000, 20000, CURRENT_DATE + interval '7 days',  CURRENT_DATE + interval '14 days', CURRENT_DATE - interval '3 days', CURRENT_DATE + interval '30 days', 'open'),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '店舗改装工事の大工作業',              '東京都内の店舗改装工事です。木工事全般をお願いします。経験豊富な方を希望します。',
   ARRAY['建築/躯体｜大工','建築/内装｜木工','建築/仕上げ｜造作大工工']::text[], 1, 30000, 25000, CURRENT_DATE + interval '14 days', CURRENT_DATE + interval '21 days', CURRENT_DATE - interval '3 days', CURRENT_DATE + interval '30 days', 'open'),
  ('88888888-8888-8888-8888-888888888881', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '千葉県戸建て新築 大工工事',           '千葉県船橋市の戸建て新築工事です。木造軸組工法の大工作業全般をお願いします。',
   ARRAY['建築/躯体｜大工']::text[],       2, 28000, 22000, CURRENT_DATE + interval '10 days', CURRENT_DATE + interval '30 days', CURRENT_DATE - interval '1 day',  CURRENT_DATE + interval '20 days', 'open'),
  ('88888888-8888-8888-8888-888888888882', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '東京都内マンション内装仕上げ工事',    '東京都品川区のマンション内装仕上げ工事です。クロス張り替え・床材施工をお願いします。',
   ARRAY['建築/内装｜木工']::text[],       3, 24000, 18000, CURRENT_DATE + interval '5 days',  CURRENT_DATE + interval '20 days', CURRENT_DATE - interval '2 days', CURRENT_DATE + interval '25 days', 'open'),
  ('88888888-8888-8888-8888-888888888883', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '神奈川県オフィスビル内装改修',        '川崎市のオフィスビル内装改修工事です。パーティション設置と天井仕上げをお願いします。',
   ARRAY['建築/内装｜木工']::text[],       2, 26000, 20000, CURRENT_DATE + interval '7 days',  CURRENT_DATE + interval '28 days', CURRENT_DATE - interval '5 days', CURRENT_DATE + interval '14 days', 'open'),
  ('88888888-8888-8888-8888-888888888884', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555',
   '大阪市商業施設 電気工事',             '大阪市中央区の商業施設電気工事です。照明設備の更新作業をお願いします。',
   ARRAY['設備/施工｜電気（その他全般）']::text[], 1, 35000, 30000, CURRENT_DATE + interval '14 days', CURRENT_DATE + interval '28 days', CURRENT_DATE - interval '1 day', CURRENT_DATE + interval '21 days', 'open'),
  -- 佐藤健太 (staff@) が作成した 2 案件 (組織は鈴木工務店)
  ('88888888-8888-8888-8888-888888888885', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555',
   '東京都内 RC造マンション躯体工事',     '東京都江東区のRC造マンション新築工事です。型枠・鉄筋工事をお願いします。',
   ARRAY['建築/躯体｜型枠工']::text[],     3, 32000, 26000, CURRENT_DATE + interval '10 days', CURRENT_DATE + interval '40 days', CURRENT_DATE - interval '2 days', CURRENT_DATE + interval '18 days', 'open'),
  ('88888888-8888-8888-8888-888888888886', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555',
   '横浜市 住宅塗装工事',                 '横浜市港北区の戸建て住宅の外壁塗装工事です。足場設置から塗装仕上げまでお願いします。',
   ARRAY['建築/仕上げ｜塗装工']::text[],   2, 28000, 22000, CURRENT_DATE + interval '14 days', CURRENT_DATE + interval '28 days', CURRENT_DATE - interval '1 day', CURRENT_DATE + interval '20 days', 'open'),
  -- 山田建設 (client2@) の 3 案件
  ('aabbccdd-6666-6666-6666-666666666661', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555',
   '東京都 大型マンション新築 大工工事',  '東京都世田谷区の大型マンション新築工事です。内部造作工事全般をお願いします。長期案件です。',
   ARRAY['建築/躯体｜大工','建築/躯体｜鉄筋工','建築/躯体｜型枠工','建築/躯体｜重量鳶']::text[], 4, 32000, 26000, CURRENT_DATE + interval '7 days',  CURRENT_DATE + interval '60 days', CURRENT_DATE - interval '3 days', CURRENT_DATE + interval '25 days', 'open'),
  ('aabbccdd-6666-6666-6666-666666666662', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555',
   '埼玉県 商業施設 鉄筋工事',            'さいたま市の商業施設建設に伴う鉄筋工事です。経験者を優遇します。',
   ARRAY['建築/躯体｜鉄筋工']::text[],     3, 30000, 24000, CURRENT_DATE + interval '10 days', CURRENT_DATE + interval '45 days', CURRENT_DATE - interval '2 days', CURRENT_DATE + interval '20 days', 'open'),
  ('aabbccdd-6666-6666-6666-666666666663', 'aabbccdd-1111-2222-3333-444455556666', 'aabbccdd-5555-5555-5555-555555555555',
   '東京都 オフィスビル内装工事',         '東京都千代田区のオフィスビル内装改修工事です。壁紙・床材の張り替え作業をお願いします。',
   ARRAY['建築/内装｜木工']::text[],       2, 27000, 21000, CURRENT_DATE + interval '5 days',  CURRENT_DATE + interval '20 days', CURRENT_DATE - interval '1 day', CURRENT_DATE + interval '18 days', 'open'),
  -- 個人発注者 (中村由美) の 1 案件 (組織なし)
  ('99999999-9999-9999-9999-999999999999', 'dd111111-1111-2222-3333-444455556666', NULL,
   '自宅キッチンリフォーム',              '埼玉県の自宅キッチンのリフォーム工事です。',
   ARRAY['建築/内装｜木工']::text[],       1, 25000, 20000, CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE, CURRENT_DATE + 60, 'open')
ON CONFLICT DO NOTHING;

-- 言語要件 (CON-002 言語フィルターの見た目)
UPDATE jobs SET language = ARRAY['日本語']::text[]        WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE jobs SET language = ARRAY['日本語','英語']::text[] WHERE id = '77777777-7777-7777-7777-777777777777';
UPDATE jobs SET language = ARRAY['中国語']::text[]        WHERE id = '88888888-8888-8888-8888-888888888881';

-- ============================================================
-- 14. job_areas (各案件のエリア)
-- ============================================================
INSERT INTO job_areas (job_id, prefecture, municipality) VALUES
  ('66666666-6666-6666-6666-666666666666', '神奈川県', '横浜市中区'),
  ('77777777-7777-7777-7777-777777777777', '東京都',   '渋谷区'),
  ('88888888-8888-8888-8888-888888888881', '千葉県',   NULL),
  ('88888888-8888-8888-8888-888888888882', '東京都',   '品川区'),
  ('88888888-8888-8888-8888-888888888883', '神奈川県', '川崎市川崎区'),
  ('88888888-8888-8888-8888-888888888884', '大阪府',   '大阪市中央区'),
  ('88888888-8888-8888-8888-888888888885', '東京都',   '江東区'),
  ('88888888-8888-8888-8888-888888888886', '神奈川県', '横浜市港北区'),
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '世田谷区'),
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '港区'),
  ('aabbccdd-6666-6666-6666-666666666661', '東京都',   '品川区'),
  ('aabbccdd-6666-6666-6666-666666666661', '神奈川県', '横浜市西区'),
  ('aabbccdd-6666-6666-6666-666666666661', '千葉県',   NULL),
  ('aabbccdd-6666-6666-6666-666666666661', '埼玉県',   NULL),
  ('aabbccdd-6666-6666-6666-666666666662', '埼玉県',   NULL),
  ('aabbccdd-6666-6666-6666-666666666663', '東京都',   '千代田区'),
  ('99999999-9999-9999-9999-999999999999', '埼玉県',   NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 15. applications (2 件 — CLI-007 発注者インボックス見た目確認用)
-- ============================================================
-- 高橋美咲 → 鈴木工務店 (木造住宅の内装リフォーム) : applied
-- 渡辺大輔 → 鈴木工務店 (店舗改装工事の大工作業)   : applied
INSERT INTO applications (id, job_id, applicant_id, headcount, working_type, preferred_first_work_date, status, message) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', '66666666-6666-6666-6666-666666666666', 'cc111111-1111-1111-1111-111111111111', 1, '常勤',     CURRENT_DATE + interval '20 days', 'applied', '塗装工事の経験を活かして内装工事にも挑戦したいです。'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', '77777777-7777-7777-7777-777777777777', 'cc222222-2222-2222-2222-222222222222', 1, 'スポット', CURRENT_DATE + interval '14 days', 'applied', '電気配線関連の作業もお手伝いできます。よろしくお願いします。')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- 動作確認クエリ (実行後に SQL Editor から流して確認)
-- ============================================================
-- SELECT count(*) AS test_users FROM auth.users WHERE email LIKE '%@test.local';
--   -> 8 になるはず (contractor, contractor2, contractor3, individual-client,
--                     adm-small-client, client, client2, staff)
-- SELECT id, email, role FROM public.users WHERE role = 'admin';
--   -> 既存の管理者ユーザーが 1 行残っているはず (Workspace メアド)
-- SELECT count(*) AS test_jobs FROM jobs WHERE status = 'open'
--   AND owner_id IN (
--     '22222222-2222-2222-2222-222222222222',
--     '33333333-3333-3333-3333-333333333333',
--     'aabbccdd-1111-2222-3333-444455556666',
--     'dd111111-1111-2222-3333-444455556666'
--   );
--   -> 12 になるはず
