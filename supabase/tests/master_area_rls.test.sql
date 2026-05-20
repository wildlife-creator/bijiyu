-- pgTAP tests for master-area feature (Phase 7.1)
-- Run with: supabase test db
--
-- 検証対象 4 テーブル:
--   - master_municipalities (anon SELECT 可、INSERT/UPDATE/DELETE 拒否)
--   - job_areas (owner / 同一組織は CRUD 可、他人は拒否、トリガーで 10 件上限)
--   - client_recruit_areas (owner は CRUD 可、他人は拒否)
--   - user_available_areas (self CRUD 可、UNIQUE NULLS NOT DISTINCT 違反検知)
--
-- 既存ルール (CLAUDE.md):
--   - pgTAP の UPDATE / DELETE は RLS でサイレントブロックされるため
--     `throws_ok` ではキャッチできない → 実データ不変を `is()` で検証
--   - pgTAP テスト専用 UUID は seed.sql と重複させない (本ファイルは
--     `aaee....` プレフィックスで揃える)

BEGIN;
SELECT plan(25);

-- ============================================================
-- 0. テスト専用ユーザー (seed 重複なし)
-- ============================================================

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aaee0001-0000-0000-0000-000000000001',
   'master-area-rls-1@test.com',
   crypt('password123', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb,
   NOW(), NOW()),
  ('aaee0002-0000-0000-0000-000000000002',
   'master-area-rls-2@test.com',
   crypt('password123', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb,
   NOW(), NOW());

-- public.users は handle_new_user トリガーで自動 INSERT されるが、
-- テストでは role が contractor の最小レコードで上書き
UPDATE public.users
   SET role = 'contractor', last_name = 'テスト1', first_name = 'RLS'
 WHERE id = 'aaee0001-0000-0000-0000-000000000001';
UPDATE public.users
   SET role = 'contractor', last_name = 'テスト2', first_name = 'RLS'
 WHERE id = 'aaee0002-0000-0000-0000-000000000002';

-- ユーザー1が所有する案件を作成 (RLS テスト用)
INSERT INTO jobs (id, owner_id, title, status)
VALUES ('aaee0001-1000-0000-0000-000000000001',
        'aaee0001-0000-0000-0000-000000000001',
        'RLS テスト案件 user1', 'draft');

-- ユーザー1の client_profiles を作成 (client_recruit_areas RLS テスト用)
INSERT INTO client_profiles (user_id, display_name)
VALUES ('aaee0001-0000-0000-0000-000000000001', 'RLS テスト法人 user1');

-- ============================================================
-- 1. master_municipalities: 件数 + RLS 有効
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM master_municipalities),
  1897,
  'master_municipalities has 1897 rows'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'master_municipalities'),
  true,
  'master_municipalities has RLS enabled'
);

-- ============================================================
-- 2. anon が master_municipalities を SELECT 可
-- ============================================================

SET LOCAL role TO anon;

SELECT is(
  (SELECT count(*)::int FROM master_municipalities),
  1897,
  'anon can SELECT master_municipalities (1897 rows)'
);

-- ============================================================
-- 3. authenticated は master_municipalities への INSERT 拒否、
--    UPDATE / DELETE はサイレントブロック (実データ不変で検証)
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0001-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO master_municipalities (prefecture, municipality, sort_order)
    VALUES ('架空県', '架空市', 99999)$$,
  '42501',
  NULL,
  'authenticated cannot INSERT into master_municipalities'
);

-- UPDATE をサイレントブロック検証
UPDATE master_municipalities SET municipality = 'hacked' WHERE municipality = '横浜市港北区';
SELECT is(
  (SELECT count(*)::int FROM master_municipalities WHERE municipality = '横浜市港北区'),
  1,
  'authenticated UPDATE did not modify master_municipalities (silent block)'
);

-- DELETE もサイレントブロック検証
DELETE FROM master_municipalities WHERE municipality = '横浜市港北区';
SELECT is(
  (SELECT count(*)::int FROM master_municipalities WHERE municipality = '横浜市港北区'),
  1,
  'authenticated DELETE did not remove master_municipalities row'
);

-- ============================================================
-- 4. job_areas: owner 自身が INSERT 成功
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0001-0000-0000-0000-000000000001","role":"authenticated"}';

INSERT INTO job_areas (job_id, prefecture, municipality)
VALUES ('aaee0001-1000-0000-0000-000000000001', '東京都', '港区');

SELECT is(
  (SELECT count(*)::int FROM job_areas
     WHERE job_id = 'aaee0001-1000-0000-0000-000000000001'),
  1,
  'owner can INSERT into job_areas'
);

-- ============================================================
-- 5. 他人 (user2) は他人の jobs に紐づく job_areas INSERT 拒否
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0002-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO job_areas (job_id, prefecture, municipality)
    VALUES ('aaee0001-1000-0000-0000-000000000001', '北海道', NULL)$$,
  '42501',
  NULL,
  'non-owner cannot INSERT job_areas for someone else''s job'
);

-- 他人による UPDATE もサイレントブロック (件数で確認)
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0002-0000-0000-0000-000000000002","role":"authenticated"}';
UPDATE job_areas SET prefecture = '北海道'
 WHERE job_id = 'aaee0001-1000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM job_areas
     WHERE job_id = 'aaee0001-1000-0000-0000-000000000001'
       AND prefecture = '東京都'),
  1,
  'non-owner UPDATE on job_areas was silently blocked (data unchanged)'
);

-- ============================================================
-- 6. owner が SELECT 可 (全 authenticated に SELECT 開放されているため
--    他人からも SELECT 可 = カードに表示するためにこの設計)
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0002-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM job_areas
     WHERE job_id = 'aaee0001-1000-0000-0000-000000000001'),
  1,
  'authenticated (non-owner) can SELECT job_areas (open to all)'
);

-- ============================================================
-- 7. enforce_job_areas_max トリガー: 11 件目で例外
--    既に 1 件入っているので 10 件追加すると 11 件になる
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0001-0000-0000-0000-000000000001","role":"authenticated"}';

INSERT INTO job_areas (job_id, prefecture, municipality)
SELECT 'aaee0001-1000-0000-0000-000000000001', '神奈川県', m
  FROM (VALUES ('横浜市港北区'), ('横浜市中区'), ('横浜市西区'),
               ('横浜市南区'), ('横浜市北区'), ('横浜市港南区'),
               ('横浜市磯子区'), ('横浜市金沢区'), ('横浜市旭区')) AS t(m);
-- ここまで 1 + 9 = 10 件

SELECT throws_ok(
  $$INSERT INTO job_areas (job_id, prefecture, municipality)
    VALUES ('aaee0001-1000-0000-0000-000000000001', '神奈川県', '横浜市緑区')$$,
  NULL,
  'job_areas exceeds 10 rows per job (job_id=aaee0001-1000-0000-0000-000000000001)',
  'enforce_job_areas_max trigger blocks 11th row'
);

-- ============================================================
-- 8. client_recruit_areas: owner 自身が INSERT 成功
-- ============================================================

INSERT INTO client_recruit_areas (client_id, prefecture, municipality)
VALUES ('aaee0001-0000-0000-0000-000000000001', '東京都', NULL);

SELECT is(
  (SELECT count(*)::int FROM client_recruit_areas
     WHERE client_id = 'aaee0001-0000-0000-0000-000000000001'),
  1,
  'owner can INSERT into client_recruit_areas'
);

-- ============================================================
-- 9. 他人は client_recruit_areas を他人の client_id で INSERT 拒否
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0002-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO client_recruit_areas (client_id, prefecture, municipality)
    VALUES ('aaee0001-0000-0000-0000-000000000001', '北海道', NULL)$$,
  '42501',
  NULL,
  'non-owner cannot INSERT client_recruit_areas for another client'
);

-- 他人の DELETE もサイレントブロック (件数で確認)
DELETE FROM client_recruit_areas
 WHERE client_id = 'aaee0001-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM client_recruit_areas
     WHERE client_id = 'aaee0001-0000-0000-0000-000000000001'),
  1,
  'non-owner DELETE on client_recruit_areas was silently blocked'
);

-- ============================================================
-- 10. authenticated は SELECT 可 (clients 一覧表示のため公開)
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM client_recruit_areas
     WHERE client_id = 'aaee0001-0000-0000-0000-000000000001'),
  1,
  'authenticated (non-owner) can SELECT client_recruit_areas'
);

-- ============================================================
-- 11. user_available_areas: self INSERT 成功
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0002-0000-0000-0000-000000000002","role":"authenticated"}';

INSERT INTO user_available_areas (user_id, prefecture, municipality)
VALUES ('aaee0002-0000-0000-0000-000000000002', '大阪府', '大阪市北区');

SELECT is(
  (SELECT count(*)::int FROM user_available_areas
     WHERE user_id = 'aaee0002-0000-0000-0000-000000000002'),
  1,
  'self can INSERT into user_available_areas'
);

-- ============================================================
-- 12. user_available_areas: UNIQUE NULLS NOT DISTINCT 違反
--    同じ (user_id, prefecture, municipality) を再 INSERT
-- ============================================================

SELECT throws_ok(
  $$INSERT INTO user_available_areas (user_id, prefecture, municipality)
    VALUES ('aaee0002-0000-0000-0000-000000000002', '大阪府', '大阪市北区')$$,
  '23505',
  NULL,
  'duplicate (user_id, prefecture, municipality) raises unique_violation'
);

-- ============================================================
-- 13. user_available_areas: NULL municipality も UNIQUE 制約対象
--    NULLS NOT DISTINCT のため「同県全域」の重複も検出
-- ============================================================

INSERT INTO user_available_areas (user_id, prefecture, municipality)
VALUES ('aaee0002-0000-0000-0000-000000000002', '京都府', NULL);

SELECT throws_ok(
  $$INSERT INTO user_available_areas (user_id, prefecture, municipality)
    VALUES ('aaee0002-0000-0000-0000-000000000002', '京都府', NULL)$$,
  '23505',
  NULL,
  'duplicate (user_id, prefecture, NULL) raises unique_violation (NULLS NOT DISTINCT)'
);

-- ============================================================
-- 14. user_available_areas: 他人による INSERT 拒否
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0001-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO user_available_areas (user_id, prefecture, municipality)
    VALUES ('aaee0002-0000-0000-0000-000000000002', '北海道', NULL)$$,
  '42501',
  NULL,
  'non-self cannot INSERT into user_available_areas'
);

-- 他人による DELETE もサイレントブロック
DELETE FROM user_available_areas
 WHERE user_id = 'aaee0002-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*)::int FROM user_available_areas
     WHERE user_id = 'aaee0002-0000-0000-0000-000000000002'),
  2,
  'non-self DELETE on user_available_areas was silently blocked'
);

-- ============================================================
-- 15. user_available_areas: 全 authenticated に SELECT 開放
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM user_available_areas
     WHERE user_id = 'aaee0002-0000-0000-0000-000000000002'),
  2,
  'authenticated (non-self) can SELECT user_available_areas'
);

-- ============================================================
-- 16. RPC: replace_user_areas は SECURITY INVOKER で RLS 経由
--    自分の user_id なら成功
-- ============================================================

RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"aaee0001-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT replace_user_areas(
  'aaee0001-0000-0000-0000-000000000001',
  '[{"prefecture":"東京都","municipality":"渋谷区"},
    {"prefecture":"千葉県","municipality":null}]'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM user_available_areas
     WHERE user_id = 'aaee0001-0000-0000-0000-000000000001'),
  2,
  'replace_user_areas inserted 2 rows for self'
);

-- ============================================================
-- 17. RPC: 他人の user_id を渡したら RLS 違反で例外
--   `replace_user_areas` は SECURITY INVOKER で RLS が効く。
--   DELETE 部分はサイレント (0 行) で通るが、INSERT 部分で WITH CHECK
--   に引っかかり 42501 が RAISE される。これは想定通りの防御。
-- ============================================================

SELECT throws_ok(
  $$SELECT replace_user_areas(
      'aaee0002-0000-0000-0000-000000000002',
      '[{"prefecture":"鹿児島県","municipality":null}]'::jsonb
    )$$,
  '42501',
  NULL,
  'replace_user_areas with other user_id raises RLS error (42501)'
);

-- user2 の既存データが変わっていないこと
SELECT is(
  (SELECT count(*)::int FROM user_available_areas
     WHERE user_id = 'aaee0002-0000-0000-0000-000000000002'
       AND prefecture = '鹿児島県'),
  0,
  'failed RPC attempt did not leak any data into other user row'
);

-- ============================================================
-- 18. master_municipalities の deprecated_at 付与は service_role のみ可
-- ============================================================

RESET role;
SET LOCAL role TO service_role;

-- 適当な行を一時的に deprecated にしてロールバックで戻す
UPDATE master_municipalities
   SET deprecated_at = NOW()
 WHERE municipality = '横浜市港北区';

SELECT is(
  (SELECT deprecated_at IS NOT NULL
     FROM master_municipalities WHERE municipality = '横浜市港北区'),
  true,
  'service_role can UPDATE master_municipalities.deprecated_at'
);

ROLLBACK;
