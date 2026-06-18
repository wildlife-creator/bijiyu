-- ============================================================
-- pgTAP tests for audit_logs RLS (admin spec Task 3.2)
-- audit_logs は server-side only 設計:
-- - INSERT ポリシーなし → authenticated / anon からの INSERT は拒否される
-- - 書き込みは service_role（admin client）のみ
-- この現行設計を固定化する（writeAuditLog が admin client を使う根拠）
-- ============================================================
BEGIN;
SELECT plan(2);

-- ============================================================
-- Test 1: authenticated cannot INSERT into audit_logs
-- (seed user: contractor@test.local = 11111111-1111-1111-1111-111111111111)
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT throws_ok(
  $$ INSERT INTO audit_logs (actor_id, action, target_type, target_id)
     VALUES ('11111111-1111-1111-1111-111111111111', 'test.action', 'auth',
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  NULL,
  'authenticated cannot INSERT into audit_logs'
);
RESET ROLE;

-- ============================================================
-- Test 2: anon cannot INSERT into audit_logs
-- ============================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ INSERT INTO audit_logs (actor_id, action, target_type, target_id)
     VALUES (NULL, 'test.action', 'auth',
             '00000000-0000-0000-0000-000000000000') $$,
  '42501',
  NULL,
  'anon cannot INSERT into audit_logs'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
