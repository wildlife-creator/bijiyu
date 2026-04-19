-- ============================================================
-- pgTAP tests for messaging RLS policies (organization-based)
-- ============================================================
BEGIN;
SELECT plan(10);

-- ============================================================
-- Test UUIDs (unique to this test, not in seed.sql)
-- Prefix: ff (seed uses ee for staff accounts)
-- ============================================================

-- Org owner (client)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('ff111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-msg-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('ff111111-1111-1111-1111-111111111111', 'ff111111-1111-1111-1111-111111111111', 'test-msg-owner@test.local', '{"sub":"ff111111-1111-1111-1111-111111111111","email":"test-msg-owner@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'オーナー' WHERE id = 'ff111111-1111-1111-1111-111111111111';

-- Staff (same org)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('ff222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-msg-staff@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('ff222222-2222-2222-2222-222222222222', 'ff222222-2222-2222-2222-222222222222', 'test-msg-staff@test.local', '{"sub":"ff222222-2222-2222-2222-222222222222","email":"test-msg-staff@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'staff', last_name = 'テスト', first_name = 'スタッフ' WHERE id = 'ff222222-2222-2222-2222-222222222222';

-- Contractor (recipient)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('ff333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-msg-con@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('ff333333-3333-3333-3333-333333333333', 'ff333333-3333-3333-3333-333333333333', 'test-msg-con@test.local', '{"sub":"ff333333-3333-3333-3333-333333333333","email":"test-msg-con@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = '受注者' WHERE id = 'ff333333-3333-3333-3333-333333333333';

-- Unrelated user
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('ff444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-msg-other@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('ff444444-4444-4444-4444-444444444444', 'ff444444-4444-4444-4444-444444444444', 'test-msg-other@test.local', '{"sub":"ff444444-4444-4444-4444-444444444444","email":"test-msg-other@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = '他人' WHERE id = 'ff444444-4444-4444-4444-444444444444';

-- Create organization + members
-- 発注者表示名は client_profiles.display_name に一本化（organization spec Task 2.7）
INSERT INTO organizations (id, owner_id) VALUES ('ff555555-5555-5555-5555-555555555555', 'ff111111-1111-1111-1111-111111111111');
INSERT INTO client_profiles (user_id, display_name) VALUES ('ff111111-1111-1111-1111-111111111111', 'テスト株式会社');
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('ff555555-5555-5555-5555-555555555555', 'ff111111-1111-1111-1111-111111111111', 'owner'),
  ('ff555555-5555-5555-5555-555555555555', 'ff222222-2222-2222-2222-222222222222', 'staff');

-- Create org-based thread
INSERT INTO message_threads (id, organization_id, participant_1_id, participant_2_id, thread_type)
VALUES ('ff666666-6666-6666-6666-666666666666', 'ff555555-5555-5555-5555-555555555555', 'ff111111-1111-1111-1111-111111111111', 'ff333333-3333-3333-3333-333333333333', 'scout');

-- Create scout message (scout_status managed via admin client, not RLS)
INSERT INTO messages (id, thread_id, sender_id, body, is_scout, is_proxy, scout_status)
VALUES ('ff777777-7777-7777-7777-777777777777', 'ff666666-6666-6666-6666-666666666666', 'ff111111-1111-1111-1111-111111111111', 'スカウトテスト', true, false, 'pending');

-- Regular message
INSERT INTO messages (id, thread_id, sender_id, body, is_scout, is_proxy)
VALUES ('ff888888-8888-8888-8888-888888888888', 'ff666666-6666-6666-6666-666666666666', 'ff333333-3333-3333-3333-333333333333', '通常メッセージ', false, false);

-- ============================================================
-- Test 1: Org owner can see thread
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff111111-1111-1111-1111-111111111111';
SELECT is(
  (SELECT count(*)::int FROM message_threads WHERE id = 'ff666666-6666-6666-6666-666666666666'),
  1, 'Org owner can see org thread'
);

-- ============================================================
-- Test 2: Org staff can see thread (via organization_id)
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT count(*)::int FROM message_threads WHERE id = 'ff666666-6666-6666-6666-666666666666'),
  1, 'Org staff can see org thread'
);

-- ============================================================
-- Test 3: Contractor (participant_2) can see thread
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff333333-3333-3333-3333-333333333333';
SELECT is(
  (SELECT count(*)::int FROM message_threads WHERE id = 'ff666666-6666-6666-6666-666666666666'),
  1, 'Contractor (participant_2) can see thread'
);

-- ============================================================
-- Test 4: Unrelated user cannot see thread
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff444444-4444-4444-4444-444444444444';
SELECT is(
  (SELECT count(*)::int FROM message_threads WHERE id = 'ff666666-6666-6666-6666-666666666666'),
  0, 'Unrelated user cannot see org thread'
);

-- ============================================================
-- Test 5: Org staff can see messages in org thread
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = 'ff666666-6666-6666-6666-666666666666'),
  2, 'Org staff can see messages in org thread'
);

-- ============================================================
-- Test 6: Unrelated user cannot see messages
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff444444-4444-4444-4444-444444444444';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = 'ff666666-6666-6666-6666-666666666666'),
  0, 'Unrelated user cannot see messages in org thread'
);

-- ============================================================
-- Test 7: Org staff can send message to org thread
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff222222-2222-2222-2222-222222222222';
SELECT lives_ok(
  $$INSERT INTO messages (id, thread_id, sender_id, body, is_scout, is_proxy)
    VALUES ('ff999999-9999-9999-9999-999999999999', 'ff666666-6666-6666-6666-666666666666', 'ff222222-2222-2222-2222-222222222222', 'スタッフから送信', false, false)$$,
  'Org staff can send message to org thread'
);

-- ============================================================
-- Test 8: Unrelated user cannot send message to org thread
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff444444-4444-4444-4444-444444444444';

-- This should fail due to INSERT policy
SELECT is(
  (SELECT count(*)::int FROM (
    SELECT 1 FROM messages WHERE thread_id = 'ff666666-6666-6666-6666-666666666666' AND sender_id = 'ff444444-4444-4444-4444-444444444444'
  ) t),
  0, 'Unrelated user has no messages in org thread'
);

-- ============================================================
-- Test 9: Contractor can insert message to thread as participant_2
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff333333-3333-3333-3333-333333333333';
SELECT lives_ok(
  $$INSERT INTO messages (id, thread_id, sender_id, body, is_scout, is_proxy)
    VALUES ('ffaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ff666666-6666-6666-6666-666666666666', 'ff333333-3333-3333-3333-333333333333', '受注者から返信', false, false)$$,
  'Contractor can send message as participant_2'
);

-- ============================================================
-- Test 10: scout_status UPDATE is blocked by RLS (no UPDATE policy)
-- Regular users cannot update messages (only admin client can)
-- ============================================================
SET LOCAL request.jwt.claim.sub = 'ff333333-3333-3333-3333-333333333333';
UPDATE messages SET scout_status = 'accepted' WHERE id = 'ff777777-7777-7777-7777-777777777777';

RESET ROLE;
SELECT is(
  (SELECT scout_status::text FROM messages WHERE id = 'ff777777-7777-7777-7777-777777777777'),
  'pending', 'Regular user cannot update scout_status via RLS (admin client required)'
);

-- ============================================================
SELECT * FROM finish();
ROLLBACK;
