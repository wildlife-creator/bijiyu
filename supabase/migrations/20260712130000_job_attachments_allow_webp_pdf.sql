-- ============================================================
-- job-attachments バケットに image/webp と application/pdf を許可する
-- ============================================================
--
-- スマホ写真対応の第四弾 (案件画像)。
-- 案件画像は従来 JPEG/PNG のみだったが、以下を許可する:
--   - image/webp : 表示互換があるためそのまま保存 (変換不要)
--   - application/pdf : 資料 PDF の添付を許可
-- iPhone の HEIC 写真はブラウザ側で JPEG に変換してからアップロードするため
-- HEIC の追加は不要 (常に image/jpeg で保存される)。
--
-- 表示側は詳細ギャラリー / アップロードプレビューで PDF をアイコン + リンク表示に
-- フォールバックする。一覧カードのサムネイル (1 枚目) が PDF の場合は割れるが、
-- 「写真を 1 枚目にしてください」の注意書きで運用回避する (仕様上許容)。
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]
WHERE id = 'job-attachments';
