-- ============================================================
-- support-attachments バケットに image/webp を許可する
-- ============================================================
--
-- スマホ写真対応の第三弾 (お問い合わせ / トラブル報告の添付)。
-- 既に JPEG/PNG/PDF を許可しているので image/webp を追加する。
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
WHERE id = 'support-attachments';
