-- pgTAP tests for job-posting feature: jobs + job_images RLS policies
-- Run with: supabase test db

BEGIN;
SELECT plan(10);

-- ============================================================
-- Setup: create test users (distinct UUIDs from seed data)
-- ============================================================

-- Client user A (job owner)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'ca000001-0001-0001-0001-000000000001',
  'client-rls-a@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);
UPDATE public.users SET role = 'client' WHERE id = 'ca000001-0001-0001-0001-000000000001';

-- Client user B
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'cb000002-0002-0002-0002-000000000002',
  'client-rls-b@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);
UPDATE public.users SET role = 'client' WHERE id = 'cb000002-0002-0002-0002-000000000002';

-- Contractor user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  'cc000003-0003-0003-0003-000000000003',
  'contractor-rls@test.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);
-- contractor role is default from trigger

-- ============================================================
-- Setup: create subscriptions for client users (required by is_paid_user)
-- ============================================================

INSERT INTO public.subscriptions (user_id, plan_type, status)
VALUES ('ca000001-0001-0001-0001-000000000001', 'individual', 'active');

INSERT INTO public.subscriptions (user_id, plan_type, status)
VALUES ('cb000002-0002-0002-0002-000000000002', 'individual', 'active');

-- ============================================================
-- Setup: create test jobs (as service role / postgres)
-- ============================================================

INSERT INTO public.jobs (id, owner_id, title, description, status)
VALUES (
  'da000001-0001-0001-0001-000000000001',
  'ca000001-0001-0001-0001-000000000001',
  'Client A Job 1',
  'Description for Client A',
  'open'
);

INSERT INTO public.jobs (id, owner_id, title, description, status)
VALUES (
  'db000002-0002-0002-0002-000000000002',
  'cb000002-0002-0002-0002-000000000002',
  'Client B Job 1',
  'Description for Client B',
  'open'
);

INSERT INTO public.job_images (id, job_id, image_url, image_type, sort_order)
VALUES (
  'ea000001-0001-0001-0001-000000000001',
  'da000001-0001-0001-0001-000000000001',
  'https://example.com/image.jpg',
  'photo',
  0
);

-- ============================================================
-- Test 1: Client A can read own job
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"ca000001-0001-0001-0001-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.jobs WHERE id = 'da000001-0001-0001-0001-000000000001'),
  1,
  'Client A can read own job'
);

-- ============================================================
-- Test 2: Client A can read public open jobs (Client B job)
-- ============================================================
SELECT ok(
  (SELECT count(*) > 0 FROM public.jobs WHERE id = 'db000002-0002-0002-0002-000000000002'),
  'Client A can read other open jobs'
);

-- ============================================================
-- Test 3: Client A can update own job
-- ============================================================
SELECT lives_ok(
  $$UPDATE public.jobs SET title = 'Updated Title' WHERE id = 'da000001-0001-0001-0001-000000000001'$$,
  'Client A can update own job'
);

-- ============================================================
-- Test 4: Client A cannot update Client B job
-- ============================================================
UPDATE public.jobs SET title = 'Hacked Title' WHERE id = 'db000002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT title FROM public.jobs WHERE id = 'db000002-0002-0002-0002-000000000002'),
  'Client B Job 1',
  'Client A cannot update Client B job (title unchanged)'
);

-- ============================================================
-- Test 5: Client A can insert job
-- ============================================================
SELECT lives_ok(
  $$INSERT INTO public.jobs (owner_id, title, status) VALUES ('ca000001-0001-0001-0001-000000000001', 'New Job', 'draft')$$,
  'Client A can insert job'
);

-- ============================================================
-- Test 6: Client A can read own job images
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM public.job_images WHERE job_id = 'da000001-0001-0001-0001-000000000001'),
  1,
  'Client A can read own job images'
);

-- ============================================================
-- Test 7: Contractor cannot insert jobs
-- ============================================================
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"cc000003-0003-0003-0003-000000000003","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.jobs (owner_id, title, status) VALUES ('cc000003-0003-0003-0003-000000000003', 'Contractor Job', 'draft')$$,
  NULL,
  NULL,
  'Contractor cannot insert jobs'
);

-- ============================================================
-- Test 8: Contractor can read public open jobs
-- ============================================================
SELECT ok(
  (SELECT count(*) > 0 FROM public.jobs WHERE status = 'open'),
  'Contractor can read public open jobs'
);

-- ============================================================
-- Test 9: Contractor cannot update jobs
-- ============================================================
UPDATE public.jobs SET title = 'Hacked' WHERE id = 'da000001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT title FROM public.jobs WHERE id = 'da000001-0001-0001-0001-000000000001'),
  'Updated Title',
  'Contractor cannot update other users jobs'
);

-- ============================================================
-- Test 10: Client B cannot delete Client A job images
-- ============================================================
RESET role;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"cb000002-0002-0002-0002-000000000002","role":"authenticated"}';

DELETE FROM public.job_images WHERE id = 'ea000001-0001-0001-0001-000000000001';
-- Reset to service role to check if image still exists
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.job_images WHERE id = 'ea000001-0001-0001-0001-000000000001'),
  1,
  'Client B cannot delete Client A job images'
);

SELECT * FROM finish();
ROLLBACK;
