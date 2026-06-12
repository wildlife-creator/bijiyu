-- ============================================================
-- pgTAP tests for applications.cancelled_by (admin spec Task 2.1)
-- - CHECK constraint value range ('contractor' / 'admin' only)
-- - Backfill: existing cancelled rows are 'contractor'
-- ============================================================
BEGIN;
SELECT plan(6);

-- ============================================================
-- Test 1: column exists
-- ============================================================
SELECT has_column(
  'public', 'applications', 'cancelled_by',
  'applications.cancelled_by column exists'
);

-- ============================================================
-- Test 2: CHECK rejects values outside ('contractor', 'admin')
-- (seed cancelled application: cccccccc-cccc-cccc-cccc-cccccccccc03)
-- ============================================================
SELECT throws_ok(
  $$ UPDATE applications SET cancelled_by = 'client'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc03' $$,
  '23514',
  NULL,
  'CHECK constraint rejects invalid cancelled_by value'
);

-- ============================================================
-- Test 3: CHECK allows 'admin'
-- ============================================================
SELECT lives_ok(
  $$ UPDATE applications SET cancelled_by = 'admin'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc03' $$,
  'CHECK constraint allows cancelled_by = admin'
);

-- ============================================================
-- Test 4: CHECK allows 'contractor' (restores seed value)
-- ============================================================
SELECT lives_ok(
  $$ UPDATE applications SET cancelled_by = 'contractor'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc03' $$,
  'CHECK constraint allows cancelled_by = contractor'
);

-- ============================================================
-- Test 5: seed actually contains cancelled rows (guard for Test 6)
-- ============================================================
SELECT cmp_ok(
  (SELECT count(*)::int FROM applications WHERE status = 'cancelled'),
  '>=', 1,
  'seed contains at least one cancelled application'
);

-- ============================================================
-- Test 6: backfill — no cancelled row is left with cancelled_by = NULL
-- ============================================================
-- 当初は「全行 contractor」を検証していたが、admin spec Task 13 で
-- 運営キャンセル（cancelled_by = 'admin'）の seed 行を意図的に追加したため、
-- 検証意図（バックフィル/記録漏れ = NULL が存在しないこと）に合わせて更新。
SELECT is(
  (SELECT count(*)::int FROM applications
   WHERE status = 'cancelled'
   AND cancelled_by IS NULL),
  0,
  'no cancelled row is left with cancelled_by = NULL'
);

SELECT * FROM finish();
ROLLBACK;
