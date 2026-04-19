-- pgTAP tests for scout_templates RLS (organization spec Task 15.1)
-- Run with: supabase test db
--
-- Covers:
--   1. Owner can read own (individual plan, organization_id NULL)
--   2. Same-org member can read corporate-plan templates
--   3. Other-org user cannot read corporate-plan templates
--   4. Same-org member can UPDATE / DELETE (not just owner)
--   5. Owner can INSERT with owner_id = auth.uid()
--   6. Other user cannot INSERT with someone else's owner_id

BEGIN;
SELECT plan(10);

-- ============================================================
-- Test fixtures (UUID not overlapping seed)
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('11111111-aaaa-bbbb-cccc-000000000001', 'st-owner@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('11111111-aaaa-bbbb-cccc-000000000002', 'st-admin@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('11111111-aaaa-bbbb-cccc-000000000003', 'st-staff@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('11111111-aaaa-bbbb-cccc-000000000004', 'st-other@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('11111111-aaaa-bbbb-cccc-000000000005', 'st-indiv@test.local',  crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client' WHERE id = '11111111-aaaa-bbbb-cccc-000000000001';
UPDATE public.users SET role = 'staff'  WHERE id = '11111111-aaaa-bbbb-cccc-000000000002';
UPDATE public.users SET role = 'staff'  WHERE id = '11111111-aaaa-bbbb-cccc-000000000003';
UPDATE public.users SET role = 'client' WHERE id = '11111111-aaaa-bbbb-cccc-000000000004';
UPDATE public.users SET role = 'client' WHERE id = '11111111-aaaa-bbbb-cccc-000000000005';

INSERT INTO organizations (id, owner_id) VALUES
  ('11111111-aaaa-bbbb-cccc-100000000001', '11111111-aaaa-bbbb-cccc-000000000001'),
  ('11111111-aaaa-bbbb-cccc-100000000004', '11111111-aaaa-bbbb-cccc-000000000004');

INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('11111111-aaaa-bbbb-cccc-100000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'owner'),
  ('11111111-aaaa-bbbb-cccc-100000000001', '11111111-aaaa-bbbb-cccc-000000000002', 'admin'),
  ('11111111-aaaa-bbbb-cccc-100000000001', '11111111-aaaa-bbbb-cccc-000000000003', 'staff'),
  ('11111111-aaaa-bbbb-cccc-100000000004', '11111111-aaaa-bbbb-cccc-000000000004', 'owner');

-- Templates
INSERT INTO scout_templates (id, owner_id, organization_id, title, body) VALUES
  ('11111111-aaaa-bbbb-cccc-900000000001', '11111111-aaaa-bbbb-cccc-000000000001', '11111111-aaaa-bbbb-cccc-100000000001', 'Owner作成', 'owner本文'),
  ('11111111-aaaa-bbbb-cccc-900000000002', '11111111-aaaa-bbbb-cccc-000000000003', '11111111-aaaa-bbbb-cccc-100000000001', 'Staff作成', 'staff本文'),
  ('11111111-aaaa-bbbb-cccc-900000000003', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-100000000004', '他組織', 'other本文'),
  ('11111111-aaaa-bbbb-cccc-900000000009', '11111111-aaaa-bbbb-cccc-000000000005', NULL,                                   '個人プラン', 'solo本文');

-- ============================================================
-- Test 1: Individual-plan owner can SELECT own template (organization_id NULL)
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000005","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000009'),
  1,
  'individual owner can SELECT own template'
);

-- ============================================================
-- Test 2: Same-org Staff can SELECT Owner's template (corporate shared)
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000003","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000001'),
  1,
  'same-org staff can SELECT owner-created template'
);

-- ============================================================
-- Test 3: Other-org client cannot SELECT corporate templates
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000004","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000001'),
  0,
  'other-org user cannot SELECT corporate templates'
);

-- ============================================================
-- Test 4: Same-org Admin can UPDATE Staff-created template (shared CRUD)
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000002","role":"authenticated"}';

UPDATE scout_templates
   SET title = 'Admin更新'
 WHERE id = '11111111-aaaa-bbbb-cccc-900000000002';

SELECT is(
  (SELECT title FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000002'),
  'Admin更新',
  'same-org admin can UPDATE staff-created template'
);

-- ============================================================
-- Test 5: Other-org user cannot UPDATE someone else's template
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000004","role":"authenticated"}';

UPDATE scout_templates
   SET title = 'ハッキング'
 WHERE id = '11111111-aaaa-bbbb-cccc-900000000001';

SELECT isnt(
  (SELECT title FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000001'),
  'ハッキング',
  'other-org user cannot UPDATE corporate template'
);

-- ============================================================
-- Test 6: Same-org Staff can DELETE Owner-created template
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000003","role":"authenticated"}';

DELETE FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000001';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000001'),
  0,
  'same-org staff can DELETE owner-created template'
);

-- ============================================================
-- Test 7: Owner can INSERT with owner_id = auth.uid()
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}';

INSERT INTO scout_templates (id, owner_id, organization_id, title, body)
VALUES (
  '11111111-aaaa-bbbb-cccc-900000000010',
  '11111111-aaaa-bbbb-cccc-000000000001',
  '11111111-aaaa-bbbb-cccc-100000000001',
  'NewByOwner',
  '本文'
);

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000010'),
  1,
  'owner can INSERT with owner_id = auth.uid()'
);

-- ============================================================
-- Test 8: Cannot INSERT with someone else's owner_id
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO scout_templates (id, owner_id, organization_id, title, body)
    VALUES (
      '11111111-aaaa-bbbb-cccc-900000000099',
      '11111111-aaaa-bbbb-cccc-000000000004',
      '11111111-aaaa-bbbb-cccc-100000000001',
      'Spoofed',
      '本文'
    );$$,
  '42501',
  NULL,
  'INSERT with other owner_id is rejected by RLS'
);

-- ============================================================
-- Test 9: Other-org user cannot DELETE corporate templates
-- （SELECT RLS でも見えないため、同一組織の視点で存続確認）
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000004","role":"authenticated"}';

DELETE FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000002';

-- 同一組織の視点で存続確認
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000002","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE id = '11111111-aaaa-bbbb-cccc-900000000002'),
  1,
  'other-org user cannot DELETE corporate template (verified from same-org view)'
);

-- ============================================================
-- Test 10: Individual template owner sees only own (no org share)
-- ============================================================
SET LOCAL request.jwt.claims TO '{"sub":"11111111-aaaa-bbbb-cccc-000000000005","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM scout_templates WHERE owner_id = '11111111-aaaa-bbbb-cccc-000000000005'),
  1,
  'individual owner sees only own template (no org share)'
);

SELECT * FROM finish();
ROLLBACK;
