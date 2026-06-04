-- pgTAP tests for ensure_organization_exists 昇格時の組織ID自動付与
-- (organization-scoping-consistency Req 11 / tasks 7.6)
-- Run with: supabase test db
--
-- 個人ユーザーに organization_id=NULL の jobs / scout_templates / job_inquiries /
-- client_reviews を用意 → ensure_organization_exists(uid) を呼ぶ →
-- 4対象に組織IDが付与されること、個人発注者ぶんは NULL のままであることを検証する。
-- message_threads は付与対象外（Req 11.2）のため検証しない。
-- 専用 UUID（seed と重複させない）を使う（SECURITY DEFINER 関数が auth.users / public.users を参照するため）。

BEGIN;
SELECT plan(7);

-- ============================================================
-- Setup: テスト専用ユーザー（auth トリガーで public.users が自動作成される）
--   promo  = 昇格する発注者
--   contra = 評価を書く受注者（client_reviews.reviewer / applications.applicant）
--   indiv  = 昇格しない個人発注者（対照群・NULL のまま据え置き）
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('0c5c0000-0000-4000-8000-000000000001', 'osc-promo@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('0c5c0000-0000-4000-8000-0000000000c1', 'osc-contra@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('0c5c0000-0000-4000-8000-000000000002', 'osc-indiv@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = '0c5c0000-0000-4000-8000-000000000001';
UPDATE public.users SET role = 'client' WHERE id = '0c5c0000-0000-4000-8000-000000000002';

-- 昇格する発注者(promo)の組織ID空データ（4対象）
INSERT INTO jobs (id, owner_id, title, trade_types, status)
VALUES ('0c5c0000-0000-4000-8000-0000000d0001', '0c5c0000-0000-4000-8000-000000000001', '昇格前の案件', ARRAY['建築/内装｜木工']::text[], 'open');

INSERT INTO scout_templates (id, owner_id, title, body)
VALUES ('0c5c0000-0000-4000-8000-0000000e0001', '0c5c0000-0000-4000-8000-000000000001', '昇格前テンプレ', '本文');

INSERT INTO job_inquiries (id, name, email, topics, content, target_client_id)
VALUES ('0c5c0000-0000-4000-8000-0000000f0001', '問合せ太郎', 'q@test.local', ARRAY['その他']::text[], '昇格前の問い合わせ', '0c5c0000-0000-4000-8000-000000000001');

INSERT INTO applications (id, job_id, applicant_id, status)
VALUES ('0c5c0000-0000-4000-8000-0000000a0001', '0c5c0000-0000-4000-8000-0000000d0001', '0c5c0000-0000-4000-8000-0000000000c1', 'accepted');

INSERT INTO client_reviews (id, application_id, reviewer_id, reviewee_id)
VALUES ('0c5c0000-0000-4000-8000-0000000b0001', '0c5c0000-0000-4000-8000-0000000a0001', '0c5c0000-0000-4000-8000-0000000000c1', '0c5c0000-0000-4000-8000-000000000001');

-- 昇格しない個人発注者(indiv)の組織ID空データ（対照群）
INSERT INTO jobs (id, owner_id, title, trade_types, status)
VALUES ('0c5c0000-0000-4000-8000-0000000d0002', '0c5c0000-0000-4000-8000-000000000002', '個人発注者の案件', ARRAY['建築/内装｜木工']::text[], 'closed');

INSERT INTO applications (id, job_id, applicant_id, status)
VALUES ('0c5c0000-0000-4000-8000-0000000a0002', '0c5c0000-0000-4000-8000-0000000d0002', '0c5c0000-0000-4000-8000-0000000000c1', 'accepted');

INSERT INTO client_reviews (id, application_id, reviewer_id, reviewee_id)
VALUES ('0c5c0000-0000-4000-8000-0000000b0002', '0c5c0000-0000-4000-8000-0000000a0002', '0c5c0000-0000-4000-8000-0000000000c1', '0c5c0000-0000-4000-8000-000000000002');

-- ============================================================
-- Act: 昇格処理（組織が無いので新規作成 + 既存データへ組織ID付与）
-- ============================================================
SELECT lives_ok(
  $$SELECT ensure_organization_exists('0c5c0000-0000-4000-8000-000000000001'::uuid);$$,
  'ensure_organization_exists が昇格する発注者で正常に動作する'
);

-- 付与された組織ID（promo が owner の有効組織）
-- 以降の is() では organizations 参照のサブクエリで突き合わせる。

-- ============================================================
-- Test: promo の4対象に組織IDが付与される
-- ============================================================
SELECT is(
  (SELECT organization_id FROM jobs WHERE id = '0c5c0000-0000-4000-8000-0000000d0001'),
  (SELECT id FROM organizations WHERE owner_id = '0c5c0000-0000-4000-8000-000000000001' AND deleted_at IS NULL LIMIT 1),
  'jobs.organization_id が新組織に付与される'
);

SELECT is(
  (SELECT organization_id FROM scout_templates WHERE id = '0c5c0000-0000-4000-8000-0000000e0001'),
  (SELECT id FROM organizations WHERE owner_id = '0c5c0000-0000-4000-8000-000000000001' AND deleted_at IS NULL LIMIT 1),
  'scout_templates.organization_id が新組織に付与される'
);

SELECT is(
  (SELECT target_organization_id FROM job_inquiries WHERE id = '0c5c0000-0000-4000-8000-0000000f0001'),
  (SELECT id FROM organizations WHERE owner_id = '0c5c0000-0000-4000-8000-000000000001' AND deleted_at IS NULL LIMIT 1),
  'job_inquiries.target_organization_id が新組織に付与される'
);

SELECT is(
  (SELECT organization_id FROM client_reviews WHERE id = '0c5c0000-0000-4000-8000-0000000b0001'),
  (SELECT id FROM organizations WHERE owner_id = '0c5c0000-0000-4000-8000-000000000001' AND deleted_at IS NULL LIMIT 1),
  'client_reviews.organization_id が新組織に付与される（jobs 付与の後）'
);

-- ============================================================
-- Test: 個人発注者(indiv・未昇格)のデータは NULL のまま（誤紐付け防止）
-- ============================================================
SELECT is(
  (SELECT organization_id FROM jobs WHERE id = '0c5c0000-0000-4000-8000-0000000d0002'),
  NULL,
  '昇格しない個人発注者の jobs.organization_id は NULL のまま'
);

SELECT is(
  (SELECT organization_id FROM client_reviews WHERE id = '0c5c0000-0000-4000-8000-0000000b0002'),
  NULL,
  '昇格しない個人発注者の client_reviews.organization_id は NULL のまま'
);

SELECT * FROM finish();
ROLLBACK;
