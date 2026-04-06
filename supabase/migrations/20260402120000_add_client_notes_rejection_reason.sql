-- applications テーブルに CLI-009 入力用カラムを追加
ALTER TABLE applications ADD COLUMN client_notes text;
ALTER TABLE applications ADD COLUMN rejection_reason text;

COMMENT ON COLUMN applications.client_notes IS '発注者からの連絡事項（CLI-009-B で入力）';
COMMENT ON COLUMN applications.rejection_reason IS 'お断り理由（CLI-009-C で入力、受注者には非公開）';
