-- ============================================================
-- 書類系バケットに image/webp を許可する
-- ============================================================
--
-- スマホ写真対応の第二弾 (本人確認 / CCUS / 発注可否の書類添付)。
-- これらのバケットは既に JPEG/PNG/PDF を許可しているので image/webp を追加する。
-- iPhone の HEIC 写真はブラウザ側で JPEG に変換してからアップロードするため
-- HEIC の追加は不要 (常に image/jpeg で保存される)。
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]
WHERE id IN ('identity-documents', 'ccus-documents', 'application-documents');
