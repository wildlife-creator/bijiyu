-- 工事全体の工期（プロジェクト全体の期間）を jobs に追加
-- 任意入力。未入力の案件では詳細画面に表示しない
ALTER TABLE jobs
  ADD COLUMN project_start_date date,
  ADD COLUMN project_end_date date;

COMMENT ON COLUMN jobs.project_start_date IS '工事全体の工期（開始日・任意）';
COMMENT ON COLUMN jobs.project_end_date IS '工事全体の工期（終了日・任意）';
