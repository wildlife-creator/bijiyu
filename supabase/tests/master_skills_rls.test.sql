-- pgTAP tests for master-skills feature: RLS policies on the 3 master tables
-- Run with: supabase test db
--
-- 検証項目 (Phase 9.2 / Requirements 1.5, 2.7, 11.7):
--   - anon / authenticated は SELECT 可
--   - INSERT / UPDATE / DELETE は anon / authenticated から拒否される
--   - service_role からは INSERT 可 (RLS バイパス)
--   - 初期データ件数 113 / 599 / 244 が正しく投入されている
--
-- pgTAP の UUID は seed.sql と重複させない (テスト専用 UUID: f0f0...)

BEGIN;
SELECT plan(18);

-- 注意: PostgreSQL の RLS は UPDATE / DELETE を「0 行更新」でサイレントに
-- 拒否するため、`throws_ok` ではキャッチできない (INSERT のみエラーを投げる)。
-- そのため UPDATE / DELETE の防御は「実際にデータが変更されていないこと」を
-- count / 値の比較で検証する。

-- ============================================================
-- 1. 件数確認 (初期データ投入の検証)
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM master_trade_types),
  113,
  'master_trade_types has 113 initial rows'
);

SELECT is(
  (SELECT count(*)::int FROM master_qualifications),
  599,
  'master_qualifications has 599 initial rows'
);

SELECT is(
  (SELECT count(*)::int FROM master_skill_tags),
  244,
  'master_skill_tags has 244 initial rows'
);

-- ============================================================
-- 2. RLS 有効化の確認
-- ============================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'master_trade_types'),
  true,
  'master_trade_types has RLS enabled'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'master_qualifications'),
  true,
  'master_qualifications has RLS enabled'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'master_skill_tags'),
  true,
  'master_skill_tags has RLS enabled'
);

-- ============================================================
-- 3. anon (未認証) から SELECT 可
-- ============================================================

SET LOCAL role TO anon;

SELECT is(
  (SELECT count(*)::int FROM master_trade_types WHERE deprecated_at IS NULL),
  113,
  'anon can SELECT all active master_trade_types'
);

-- seed.sql で 1 件（'特級ボイラー技士'）を deprecated に倒しているため active は 598
SELECT is(
  (SELECT count(*)::int FROM master_qualifications WHERE deprecated_at IS NULL),
  598,
  'anon can SELECT all active master_qualifications (599 inserted - 1 deprecated in seed)'
);

SELECT is(
  (SELECT count(*)::int FROM master_skill_tags WHERE deprecated_at IS NULL),
  244,
  'anon can SELECT all active master_skill_tags'
);

-- ============================================================
-- 4. anon から INSERT / UPDATE / DELETE は拒否 (書き込みポリシー未定義)
-- ============================================================

SELECT throws_ok(
  $$INSERT INTO master_trade_types (label) VALUES ('anon書き込みテスト')$$,
  '42501',
  NULL,
  'anon cannot INSERT into master_trade_types'
);

-- anon UPDATE は RLS によりサイレントブロックされる (0 行更新)
UPDATE master_trade_types SET label = 'hacked' WHERE label = '建築/躯体｜大工';

SELECT is(
  (SELECT label FROM master_trade_types WHERE label = '建築/躯体｜大工' LIMIT 1),
  '建築/躯体｜大工',
  'anon UPDATE did not change the row (RLS silent block protected the data)'
);

-- anon DELETE も同様にサイレントブロックされる
DELETE FROM master_trade_types WHERE label = '建築/躯体｜大工';

SELECT is(
  (SELECT count(*)::int FROM master_trade_types WHERE label = '建築/躯体｜大工'),
  1,
  'anon DELETE did not remove the row'
);

-- ============================================================
-- 5. authenticated から SELECT 可、INSERT/UPDATE/DELETE 拒否
-- ============================================================

RESET role;

-- pgTAP テスト専用 UUID (seed.sql と重複させない)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'f0f0f0f0-aaaa-bbbb-cccc-ddddeeeeffff',
  'master-rls-test@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f0f0f0f0-aaaa-bbbb-cccc-ddddeeeeffff","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM master_trade_types WHERE deprecated_at IS NULL),
  113,
  'authenticated can SELECT active master_trade_types'
);

-- seed.sql の deprecated（'特級ボイラー技士'）を除いた active 件数
SELECT is(
  (SELECT count(*)::int FROM master_qualifications WHERE deprecated_at IS NULL),
  598,
  'authenticated can SELECT active master_qualifications (599 - 1 deprecated)'
);

SELECT is(
  (SELECT count(*)::int FROM master_skill_tags WHERE deprecated_at IS NULL),
  244,
  'authenticated can SELECT active master_skill_tags'
);

SELECT throws_ok(
  $$INSERT INTO master_qualifications (label) VALUES ('authユーザー書き込みテスト')$$,
  '42501',
  NULL,
  'authenticated user cannot INSERT into master_qualifications'
);

-- authenticated UPDATE もサイレントブロック (実データ不変で検証)
UPDATE master_skill_tags SET label = 'hacked' WHERE label = '送配電線工';

SELECT is(
  (SELECT count(*)::int FROM master_skill_tags WHERE label = '送配電線工'),
  1,
  'authenticated UPDATE did not change the master_skill_tags row'
);

-- ============================================================
-- 6. service_role からは INSERT 可 (RLS バイパス)
-- ============================================================

RESET role;
SET LOCAL role TO service_role;

INSERT INTO master_trade_types (label) VALUES ('テスト/サービス｜service_role 挿入確認');

SELECT is(
  (SELECT count(*)::int FROM master_trade_types WHERE label = 'テスト/サービス｜service_role 挿入確認'),
  1,
  'service_role can INSERT into master_trade_types'
);

ROLLBACK;
