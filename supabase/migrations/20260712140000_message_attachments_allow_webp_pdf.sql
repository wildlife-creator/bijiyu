-- ============================================================
-- message-attachments バケットに image/webp と application/pdf を許可する
-- ============================================================
--
-- スマホ写真対応の第五弾 (メッセージ添付)。
-- 従来 JPEG/PNG のみだったが、以下を許可する:
--   - image/webp : 表示互換があるためそのまま保存 (変換不要)
--   - application/pdf : 資料 PDF の添付を許可 (メッセージバブルでは
--     「PDFを開く」リンクとして表示する)
-- iPhone の HEIC 写真はブラウザ側で JPEG に変換してからアップロードするため
-- HEIC の追加は不要 (常に image/jpeg で保存される)。
--
-- message-attachments は非公開バケット。表示は署名付き URL 経由。
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]
WHERE id = 'message-attachments';
