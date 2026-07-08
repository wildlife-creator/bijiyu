-- ============================================================
-- pgTAP tests for admin_proxy_threads view (admin spec Task 2.2)
-- - View aggregates only threads containing is_proxy = true messages
-- - anon / authenticated cannot SELECT (service_role only)
-- ============================================================
BEGIN;
SELECT plan(9);

-- ============================================================
-- Test UUIDs (unique to this test, not in seed.sql)
-- Prefix: fade (seed / other tests use cc / ee / ff)
-- ============================================================

-- Org owner (client)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('fade1111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-proxy-owner@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('fade1111-1111-1111-1111-111111111111', 'fade1111-1111-1111-1111-111111111111', 'test-proxy-owner@test.local', '{"sub":"fade1111-1111-1111-1111-111111111111","email":"test-proxy-owner@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'client', last_name = '代理', first_name = 'オーナー' WHERE id = 'fade1111-1111-1111-1111-111111111111';

-- Contractor (proxy thread counterpart)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('fade2222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-proxy-con@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('fade2222-2222-2222-2222-222222222222', 'fade2222-2222-2222-2222-222222222222', 'test-proxy-con@test.local', '{"sub":"fade2222-2222-2222-2222-222222222222","email":"test-proxy-con@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = '代理', first_name = '受注者' WHERE id = 'fade2222-2222-2222-2222-222222222222';

-- Contractor (normal thread counterpart)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('fade3333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-proxy-con2@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('fade3333-3333-3333-3333-333333333333', 'fade3333-3333-3333-3333-333333333333', 'test-proxy-con2@test.local', '{"sub":"fade3333-3333-3333-3333-333333333333","email":"test-proxy-con2@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = '通常', first_name = '受注者' WHERE id = 'fade3333-3333-3333-3333-333333333333';

-- Organization + thread with proxy message
INSERT INTO organizations (id, owner_id) VALUES ('fade5555-5555-5555-5555-555555555555', 'fade1111-1111-1111-1111-111111111111');
INSERT INTO organization_members (organization_id, user_id, org_role) VALUES
  ('fade5555-5555-5555-5555-555555555555', 'fade1111-1111-1111-1111-111111111111', 'owner');

INSERT INTO message_threads (id, organization_id, participant_1_id, participant_2_id, thread_type)
VALUES ('fade6666-6666-6666-6666-666666666666', 'fade5555-5555-5555-5555-555555555555', 'fade1111-1111-1111-1111-111111111111', 'fade2222-2222-2222-2222-222222222222', 'message');

INSERT INTO messages (id, thread_id, sender_id, body, is_proxy, created_at) VALUES
  ('fade7777-7777-7777-7777-777777777771', 'fade6666-6666-6666-6666-666666666666', 'fade1111-1111-1111-1111-111111111111', '代理メッセージ', true, now() - interval '2 hours'),
  ('fade7777-7777-7777-7777-777777777772', 'fade6666-6666-6666-6666-666666666666', 'fade2222-2222-2222-2222-222222222222', '通常返信', false, now() - interval '1 hour');

-- Thread WITHOUT proxy messages (must not appear in the view)
INSERT INTO message_threads (id, organization_id, participant_1_id, participant_2_id, thread_type)
VALUES ('fade8888-8888-8888-8888-888888888888', 'fade5555-5555-5555-5555-555555555555', 'fade1111-1111-1111-1111-111111111111', 'fade3333-3333-3333-3333-333333333333', 'message');

INSERT INTO messages (id, thread_id, sender_id, body, is_proxy) VALUES
  ('fade9999-9999-9999-9999-999999999991', 'fade8888-8888-8888-8888-888888888888', 'fade1111-1111-1111-1111-111111111111', '通常メッセージのみ', false);

-- ============================================================
-- Test 1: thread containing a proxy message appears in the view
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM admin_proxy_threads WHERE thread_id = 'fade6666-6666-6666-6666-666666666666'),
  1,
  'thread with is_proxy message appears in admin_proxy_threads'
);

-- ============================================================
-- Test 2: thread without proxy messages does NOT appear
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM admin_proxy_threads WHERE thread_id = 'fade8888-8888-8888-8888-888888888888'),
  0,
  'thread without is_proxy message is excluded from the view'
);

-- ============================================================
-- Test 3: proxy_count counts only is_proxy = true messages
-- ============================================================
SELECT is(
  (SELECT proxy_count::int FROM admin_proxy_threads WHERE thread_id = 'fade6666-6666-6666-6666-666666666666'),
  1,
  'proxy_count counts only is_proxy messages'
);

-- ============================================================
-- Test 4: last_message_at = max(created_at) across ALL messages
-- ============================================================
SELECT is(
  (SELECT last_message_at FROM admin_proxy_threads WHERE thread_id = 'fade6666-6666-6666-6666-666666666666'),
  (SELECT max(created_at) FROM messages WHERE thread_id = 'fade6666-6666-6666-6666-666666666666'),
  'last_message_at equals the newest message timestamp (proxy or not)'
);

-- ============================================================
-- Test 5: contractor_id = organization_X_id が null な side の participant_X_id
-- (通常方向スレッド: participant_2 = 受注者 = 個人 identity)
-- ============================================================
SELECT is(
  (SELECT contractor_id FROM admin_proxy_threads WHERE thread_id = 'fade6666-6666-6666-6666-666666666666'),
  'fade2222-2222-2222-2222-222222222222'::uuid,
  'contractor_id maps to participant_2 side when organization_2 is null'
);

-- ============================================================
-- Test 5b (R4): 受注者起点スレッド (participant_1 = 受注者、
-- organization_1_id = null、organization_2_id = org) でも
-- contractor_id が participant_1 側に解決されること。
-- 旧設計では participant_2 決め打ちで職人/発注者欄が逆転していた。
-- ============================================================

-- 新規 contractor (identity ペア重複回避用)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, phone, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token, is_sso_user)
VALUES ('fade4444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-proxy-con-init@test.local', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', NULL, '', '', '', 0, '', false);
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('fade4444-4444-4444-4444-444444444444', 'fade4444-4444-4444-4444-444444444444', 'test-proxy-con-init@test.local', '{"sub":"fade4444-4444-4444-4444-444444444444","email":"test-proxy-con-init@test.local"}', 'email', now(), now(), now());
UPDATE public.users SET role = 'contractor', last_name = '受注者', first_name = '起点' WHERE id = 'fade4444-4444-4444-4444-444444444444';

INSERT INTO message_threads (
  id, organization_id, organization_1_id, organization_2_id,
  participant_1_id, participant_2_id, thread_type
) VALUES (
  'fadeaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'fade5555-5555-5555-5555-555555555555',
  NULL,
  'fade5555-5555-5555-5555-555555555555',
  'fade4444-4444-4444-4444-444444444444', -- 受注者 (個人 identity、participant_1)
  'fade1111-1111-1111-1111-111111111111', -- 発注者オーナー (participant_2)
  'message'
);
INSERT INTO messages (id, thread_id, sender_id, body, is_proxy)
VALUES (
  'fadebbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'fadeaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'fade1111-1111-1111-1111-111111111111',
  '代理メッセ (受注者起点スレッド)',
  true
);

SELECT is(
  (SELECT contractor_id FROM admin_proxy_threads WHERE thread_id = 'fadeaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'fade4444-4444-4444-4444-444444444444'::uuid,
  'R4: 受注者起点スレッドでも contractor_id が participant_1 (個人 identity 側) に解決される'
);

-- Bonus: organization_id も新カラムベースで解決される (COALESCE)
SELECT is(
  (SELECT organization_id FROM admin_proxy_threads WHERE thread_id = 'fadeaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'fade5555-5555-5555-5555-555555555555'::uuid,
  'R4: 受注者起点スレッドの organization_id が organization_2_id から COALESCE で解決される'
);

-- ============================================================
-- Test 6: anon cannot SELECT (permission denied)
-- ============================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  'SELECT count(*) FROM admin_proxy_threads',
  '42501',
  NULL,
  'anon cannot SELECT admin_proxy_threads'
);
RESET ROLE;

-- ============================================================
-- Test 7: authenticated cannot SELECT (permission denied)
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fade1111-1111-1111-1111-111111111111';
SELECT throws_ok(
  'SELECT count(*) FROM admin_proxy_threads',
  '42501',
  NULL,
  'authenticated cannot SELECT admin_proxy_threads'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
