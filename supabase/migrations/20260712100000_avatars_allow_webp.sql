-- ============================================================
-- avatars バケットに image/webp を許可する
-- ============================================================
--
-- 背景:
--   スマホ写真対応の第一弾 (プロフィール画像 / 発注者プロフィール画像)。
--   iPhone の HEIC 写真はブラウザ側で JPEG に変換してからアップロードするため
--   バケットに HEIC を許可する必要はない (常に image/jpeg で保存される)。
--   一方 WebP は変換せずそのまま保存・表示するため、バケットの
--   allowed_mime_types に image/webp を追加する。
--
--   他バケット (job-attachments / message-attachments / identity-documents 等)
--   への WebP/PDF 追加は後続の画面対応と合わせて別マイグレーションで行う。
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';
