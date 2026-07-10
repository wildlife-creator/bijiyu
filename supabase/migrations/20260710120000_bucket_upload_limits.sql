-- ============================================================
-- ユーザーアップロード系バケットに file_size_limit / allowed_mime_types を設定
-- ============================================================
--
-- 背景:
--   Vercel の 4.5MB リクエスト上限を回避するため、ファイル添付を
--   「ブラウザ → Storage 直接アップロード」方式に変更した。
--   Server Action の File バリデーションを経由しなくなるため、
--   サイズ・MIME の強制をバケット定義側 (Storage API が upload 時に検証)
--   へ移す。アプリ側のバリデーションはユーザー向けエラーメッセージ用として併存。
--
-- 上限はアプリ側バリデーションと一致させる:
--   job-attachments      10MB  JPEG/PNG        (validateJobImageFile)
--   message-attachments  10MB  JPEG/PNG        (sendMessageAction)
--   avatars               5MB  JPEG/PNG        (validateAvatarFile / CLIENT_PROFILE_IMAGE_CONSTRAINTS)
--   identity-documents   10MB  JPEG/PNG/PDF    (validateDocumentFile)
--   ccus-documents       10MB  JPEG/PNG/PDF    (validateDocumentFile)
--   application-documents 10MB JPEG/PNG/PDF    (発注可否の書類添付)
--   support-attachments   5MB  JPEG/PNG/PDF    (SUPPORT_ATTACHMENT_RULES)
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id IN ('job-attachments', 'message-attachments');

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id = 'avatars';

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id IN ('identity-documents', 'ccus-documents', 'application-documents');

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'support-attachments';
