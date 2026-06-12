-- ============================================================
-- pgTAP tests for identity_verifications.updated_at (admin spec Task 9)
--
-- 既存バグの回帰防止: identity_verifications には set_updated_at トリガーが
-- 貼られているのに updated_at カラムが無く、全 UPDATE が
-- `record "new" has no field "updated_at"` で失敗していた
-- （ADM-012 の承認/否認 UPDATE 実装で顕在化）。
-- ============================================================
BEGIN;
SELECT plan(3);

-- ============================================================
-- Test 1: updated_at column exists
-- ============================================================
SELECT has_column(
  'public', 'identity_verifications', 'updated_at',
  'identity_verifications.updated_at column exists'
);

-- ============================================================
-- Test 2: UPDATE succeeds (trigger no longer fails)
-- seed の承認済みレコード（contractor@test.local の identity）を対象に
-- 値を変えない UPDATE で検証する
-- ============================================================
SELECT lives_ok(
  $$ UPDATE identity_verifications
     SET rejection_reason = rejection_reason
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND document_type = 'identity' $$,
  'UPDATE on identity_verifications succeeds (set_updated_at trigger works)'
);

-- ============================================================
-- Test 3: trigger updates updated_at on UPDATE
-- NOW() はトランザクション内で固定のため「直前の UPDATE からの前進」は
-- 検証できない。古い updated_at を持つ行を INSERT（INSERT では
-- BEFORE UPDATE トリガーは発火しない）してから UPDATE し、
-- トリガーが値を現在時刻へ更新することを検証する。
-- UUID は seed 未使用のテスト専用値（status='rejected' で pending unique を回避）
-- ============================================================
SELECT lives_ok(
  $$ DO $body$
     DECLARE
       v_after timestamptz;
     BEGIN
       INSERT INTO identity_verifications
         (id, user_id, document_type, document_url_1, status, updated_at)
       VALUES
         ('ade09999-0000-4000-8000-000000000001',
          '11111111-1111-1111-1111-111111111111',
          'identity', 'test/old.jpg', 'rejected',
          '2000-01-01T00:00:00Z');

       UPDATE identity_verifications
       SET rejection_reason = 'pgTAP trigger check'
       WHERE id = 'ade09999-0000-4000-8000-000000000001';

       SELECT updated_at INTO v_after
       FROM identity_verifications
       WHERE id = 'ade09999-0000-4000-8000-000000000001';

       IF v_after <= '2001-01-01T00:00:00Z' THEN
         RAISE EXCEPTION 'updated_at was not advanced by trigger';
       END IF;
     END
     $body$ $$,
  'set_updated_at trigger advances updated_at'
);

SELECT * FROM finish();
ROLLBACK;
