-- ============================================================
-- admin spec Task 2.1: applications.cancelled_by
-- キャンセル実行者の記録（admin の発注取消と受注者の自力キャンセルを区別する）
-- - NULL 許容・インデックス不要（status との複合フィルタで十分小さい）
-- - cancelled_by は status = 'cancelled' の行でのみ意味を持つ（CHECK は値域のみ）
-- ============================================================

ALTER TABLE applications
  ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('contractor', 'admin'));

COMMENT ON COLUMN applications.cancelled_by IS
  'キャンセル実行者（contractor=受注者の自力キャンセル / admin=運営による発注取消）。status=cancelled の行でのみ意味を持つ';

-- 既存の cancelled 行をバックフィル
-- （現状キャンセルは受注者のみ可能だったため 'contractor' で矛盾なし）
UPDATE applications SET cancelled_by = 'contractor' WHERE status = 'cancelled';
