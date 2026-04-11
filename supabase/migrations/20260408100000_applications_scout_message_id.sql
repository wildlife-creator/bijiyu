-- ============================================================
-- applications: scout_message_id カラム追加
-- スカウト経由の応募を識別するため、元のスカウトメッセージIDを記録する
-- ============================================================

ALTER TABLE applications
  ADD COLUMN scout_message_id uuid REFERENCES messages(id);

-- 部分インデックス（scout_message_id IS NOT NULL の応募のみ）
CREATE INDEX idx_applications_scout_message_id
  ON applications (scout_message_id)
  WHERE scout_message_id IS NOT NULL;
