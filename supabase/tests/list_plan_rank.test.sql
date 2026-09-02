-- pgTAP tests for 一覧のプラン順ランク列（P6）
--   users.list_plan_rank / jobs.owner_plan_rank が契約（subscriptions）の変化に
--   トリガーで自動追従すること（手動更新・cron に頼らない）。
--   - 契約作成で 0 → 2（ハイエンド）/ プラン変更で 2 → 1（プレミアム）/ 解約で → 0
--   - past_due は維持 / スタンダード以下は 0
--   - 担当者（staff）作成の案件は組織オーナーのランクを引き継ぐ
--   - 契約付与 → 組織作成 → 案件の organization_id 付け替え、の順でもランクが付く
--   - 契約行の DELETE でも 0 に戻る
-- Run with: supabase test db
-- seed と重複しない専用 UUID（f6a00000-…）を使用する。

BEGIN;
SELECT plan(17);

-- ============================================================
-- Setup（privileged role = RLS バイパス）
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('f6a00000-0000-0000-0000-0000000000a1'::uuid, 'rank-owner@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('f6a00000-0000-0000-0000-0000000000a2'::uuid, 'rank-staff@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('f6a00000-0000-0000-0000-0000000000b1'::uuid, 'rank-small@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = 'f6a00000-0000-0000-0000-0000000000a1';
UPDATE public.users SET role = 'staff'  WHERE id = 'f6a00000-0000-0000-0000-0000000000a2';
UPDATE public.users SET role = 'client' WHERE id = 'f6a00000-0000-0000-0000-0000000000b1';

-- オーナー名義の案件（契約より先に作る = 契約付与でランクが後追いで付くことを確認）
INSERT INTO jobs (id, owner_id, organization_id, title, status)
VALUES ('f6a00000-0000-0000-0000-00000000ee01', 'f6a00000-0000-0000-0000-0000000000a1', NULL, 'オーナー案件', 'open');

-- ============================================================
-- 1. 初期値
-- ============================================================
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  0::smallint,
  'users.list_plan_rank defaults to 0 (no subscription)'
);
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee01'),
  0::smallint,
  'jobs.owner_plan_rank defaults to 0 (owner has no subscription)'
);

-- ============================================================
-- 2. 契約作成（ハイエンド）→ 2
-- ============================================================
INSERT INTO subscriptions (id, user_id, plan_type, status, stripe_subscription_id)
VALUES ('f6a00000-0000-0000-0000-00000000cc01', 'f6a00000-0000-0000-0000-0000000000a1', 'corporate_premium', 'active', 'sub_rank_test_1');

SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  2::smallint,
  'INSERT corporate_premium subscription -> users.list_plan_rank = 2'
);
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee01'),
  2::smallint,
  'INSERT subscription -> existing job (owner_id) gets owner_plan_rank = 2'
);

-- ============================================================
-- 3. 契約付与 → 組織作成 → 案件の organization_id 付け替え（昇格フローの順序）
-- ============================================================
INSERT INTO organizations (id, owner_id) VALUES
  ('f6a00000-0000-0000-0000-00000000aa01', 'f6a00000-0000-0000-0000-0000000000a1');
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('f6a00000-0000-0000-0000-00000000aa01', 'f6a00000-0000-0000-0000-0000000000a1', 'owner', false),
  ('f6a00000-0000-0000-0000-00000000aa01', 'f6a00000-0000-0000-0000-0000000000a2', 'staff', false);

-- ensure_organization_exists と同じく既存案件に organization_id を付ける
UPDATE jobs SET organization_id = 'f6a00000-0000-0000-0000-00000000aa01'
 WHERE id = 'f6a00000-0000-0000-0000-00000000ee01';
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee01'),
  2::smallint,
  'job re-attached to the organization keeps owner_plan_rank = 2 (via org owner)'
);

-- 担当者（staff）が作成した案件は組織オーナーのランクを引き継ぐ
INSERT INTO jobs (id, owner_id, organization_id, title, status)
VALUES ('f6a00000-0000-0000-0000-00000000ee02', 'f6a00000-0000-0000-0000-0000000000a2', 'f6a00000-0000-0000-0000-00000000aa01', '担当者案件', 'open');
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee02'),
  2::smallint,
  'staff-created job inherits the organization owner rank (2)'
);
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a2'),
  0::smallint,
  'staff user itself stays list_plan_rank = 0 (no own subscription)'
);

-- ============================================================
-- 4. プラン変更（ハイエンド → プレミアム）→ 1（本人 + 本人名義 + 担当者作成の案件）
-- ============================================================
UPDATE subscriptions SET plan_type = 'corporate' WHERE id = 'f6a00000-0000-0000-0000-00000000cc01';
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  1::smallint,
  'UPDATE plan_type corporate -> users.list_plan_rank = 1'
);
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee02'),
  1::smallint,
  'UPDATE plan_type -> staff-created job follows (1)'
);

-- ============================================================
-- 5. past_due は維持 / cancelled で 0
-- ============================================================
UPDATE subscriptions SET status = 'past_due' WHERE id = 'f6a00000-0000-0000-0000-00000000cc01';
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  1::smallint,
  'past_due keeps the rank (1)'
);

UPDATE subscriptions SET status = 'cancelled' WHERE id = 'f6a00000-0000-0000-0000-00000000cc01';
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  0::smallint,
  'cancelled -> users.list_plan_rank = 0'
);
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee01'),
  0::smallint,
  'cancelled -> owner job owner_plan_rank = 0'
);
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee02'),
  0::smallint,
  'cancelled -> staff-created job owner_plan_rank = 0'
);

-- ============================================================
-- 6. 再契約（新しい行の INSERT）→ 2、契約行の DELETE → 0
-- ============================================================
INSERT INTO subscriptions (id, user_id, plan_type, status, stripe_subscription_id)
VALUES ('f6a00000-0000-0000-0000-00000000cc02', 'f6a00000-0000-0000-0000-0000000000a1', 'corporate_premium', 'active', 'sub_rank_test_2');
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6a00000-0000-0000-0000-00000000ee02'),
  2::smallint,
  're-subscribe (new row) -> staff-created job owner_plan_rank = 2'
);

DELETE FROM subscriptions WHERE id = 'f6a00000-0000-0000-0000-00000000cc02';
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000a1'),
  0::smallint,
  'DELETE subscription -> users.list_plan_rank = 0'
);

-- ============================================================
-- 7. スタンダード以下は「その他」= 0
-- ============================================================
INSERT INTO subscriptions (id, user_id, plan_type, status, stripe_subscription_id)
VALUES ('f6a00000-0000-0000-0000-00000000cc03', 'f6a00000-0000-0000-0000-0000000000b1', 'small', 'active', 'sub_rank_test_3');
SELECT is(
  (SELECT list_plan_rank FROM users WHERE id = 'f6a00000-0000-0000-0000-0000000000b1'),
  0::smallint,
  'small (スタンダード) plan -> list_plan_rank = 0 (その他)'
);

-- ============================================================
-- 8. seed のバックフィル整合: 表示対象のハイエンド発注者と、その急募案件
-- ============================================================
SELECT is(
  (SELECT owner_plan_rank FROM jobs WHERE id = 'f6660000-0000-4000-8000-000000000001'),
  2::smallint,
  'seed: highend-client urgent job has owner_plan_rank = 2'
);

SELECT * FROM finish();
ROLLBACK;
