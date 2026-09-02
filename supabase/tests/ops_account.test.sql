-- pgTAP tests for 管理運営アカウント（P5）
--   1. users.is_hidden 列（既定 false、RLS で隠さない = 公開 SELECT でも読める）
--   2. messages の SELECT / INSERT ポリシーが identity ペア（organization_1_id / organization_2_id）対応
--      → 組織⇔組織スレッドで、旧 organization_id に入らなかった側の組織メンバー（担当者）も本文を読め・返信できる
-- Run with: supabase test db
-- seed と重複しない専用 UUID を使用する。

BEGIN;
SELECT plan(9);

-- ============================================================
-- Setup（privileged role = RLS バイパス）
-- ============================================================
-- 運営（org A の owner）、発注者 B の owner、発注者 B の担当者（staff）
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('0b5e0000-0000-0000-0000-0000000000a1'::uuid, 'ops-rls@test.local',          crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('0b5e0000-0000-0000-0000-0000000000b1'::uuid, 'client-b-owner-rls@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('0b5e0000-0000-0000-0000-0000000000b2'::uuid, 'client-b-staff-rls@test.local', crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('0b5e0000-0000-0000-0000-0000000000c1'::uuid, 'outsider-rls@test.local',     crypt('x', gen_salt('bf')), NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

UPDATE public.users SET role = 'client', is_hidden = true WHERE id = '0b5e0000-0000-0000-0000-0000000000a1';
UPDATE public.users SET role = 'client' WHERE id = '0b5e0000-0000-0000-0000-0000000000b1';
UPDATE public.users SET role = 'staff'  WHERE id = '0b5e0000-0000-0000-0000-0000000000b2';

INSERT INTO organizations (id, owner_id) VALUES
  ('0b5e0000-0000-0000-0000-00000000aa01', '0b5e0000-0000-0000-0000-0000000000a1'),
  ('0b5e0000-0000-0000-0000-00000000bb01', '0b5e0000-0000-0000-0000-0000000000b1');
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account) VALUES
  ('0b5e0000-0000-0000-0000-00000000aa01', '0b5e0000-0000-0000-0000-0000000000a1', 'owner', false),
  ('0b5e0000-0000-0000-0000-00000000bb01', '0b5e0000-0000-0000-0000-0000000000b1', 'owner', false),
  ('0b5e0000-0000-0000-0000-00000000bb01', '0b5e0000-0000-0000-0000-0000000000b2', 'staff', false);

-- 組織⇔組織スレッド（運営が /messages/new で作る形: 旧 organization_id は作成者側 = org A）
INSERT INTO message_threads (id, participant_1_id, participant_2_id, organization_1_id, organization_2_id, organization_id, thread_type)
VALUES ('0b5e0000-0000-0000-0000-00000000dd01',
        '0b5e0000-0000-0000-0000-0000000000a1', '0b5e0000-0000-0000-0000-0000000000b1',
        '0b5e0000-0000-0000-0000-00000000aa01', '0b5e0000-0000-0000-0000-00000000bb01',
        '0b5e0000-0000-0000-0000-00000000aa01', 'message');
INSERT INTO messages (id, thread_id, sender_id, body)
VALUES ('0b5e0000-0000-0000-0000-00000000ee01', '0b5e0000-0000-0000-0000-00000000dd01', '0b5e0000-0000-0000-0000-0000000000a1', '職人さんをご紹介します');

-- ============================================================
-- 1. users.is_hidden
-- ============================================================
SELECT is(
  (SELECT is_hidden FROM users WHERE id = '0b5e0000-0000-0000-0000-0000000000b1'),
  false,
  'users.is_hidden defaults to false'
);

-- 他の会員（outsider）から公開 SELECT で is_hidden の行も読める（RLS では隠さない = メッセージ相手等で必要）
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000c1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM users WHERE id = '0b5e0000-0000-0000-0000-0000000000a1'),
  1,
  'hidden (ops) user is still readable via users_select_public (exclusion is done per query, not RLS)'
);

-- ============================================================
-- 2. messages RLS: identity ペア対応
-- ============================================================
-- Test 3: 発注者 B の担当者（participant ではなく、旧 organization_id にも入っていない org B のメンバー）が本文を読める
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000b2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = '0b5e0000-0000-0000-0000-00000000dd01'),
  1,
  'org-2 staff (not participant, not in legacy organization_id) can SELECT messages via organization_2_id'
);

-- Test 4: 同じ担当者が返信できる
SELECT lives_ok(
  $$INSERT INTO messages (thread_id, sender_id, body)
    VALUES ('0b5e0000-0000-0000-0000-00000000dd01', '0b5e0000-0000-0000-0000-0000000000b2', '担当者からの返信')$$,
  'org-2 staff can INSERT a reply via organization_2_id'
);

-- Test 5: 発注者 B の owner（participant_2）も読める（従来どおり）
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = '0b5e0000-0000-0000-0000-00000000dd01'),
  2,
  'participant_2 (org-2 owner) can SELECT all messages'
);

-- Test 6: 運営（participant_1 / org A）も読める（従来どおり）
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = '0b5e0000-0000-0000-0000-00000000dd01'),
  2,
  'participant_1 (ops, org-1 owner) can SELECT all messages'
);

-- Test 7: 無関係の会員は読めない
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000c1","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM messages WHERE thread_id = '0b5e0000-0000-0000-0000-00000000dd01'),
  0,
  'outsider cannot SELECT messages of an org-to-org thread'
);

-- Test 8: 無関係の会員は書けない
SELECT throws_ok(
  $$INSERT INTO messages (thread_id, sender_id, body)
    VALUES ('0b5e0000-0000-0000-0000-00000000dd01', '0b5e0000-0000-0000-0000-0000000000c1', '部外者')$$,
  '42501',
  NULL,
  'outsider cannot INSERT into an org-to-org thread'
);

-- Test 9: sender_id を偽って（担当者が owner 名義で）書けない
SET LOCAL request.jwt.claims TO '{"sub":"0b5e0000-0000-0000-0000-0000000000b2","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO messages (thread_id, sender_id, body)
    VALUES ('0b5e0000-0000-0000-0000-00000000dd01', '0b5e0000-0000-0000-0000-0000000000b1', 'なりすまし')$$,
  '42501',
  NULL,
  'messages_insert still requires sender_id = auth.uid()'
);

SELECT * FROM finish();
ROLLBACK;
