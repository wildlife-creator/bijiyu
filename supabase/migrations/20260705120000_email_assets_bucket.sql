-- ============================================================
-- 2026-07-05: メール添付用ロゴ等の公開バケット email-assets
--
-- 経緯:
--   Resend 経由で送るメールに埋め込むロゴ画像を、Vercel Preview URL から
--   配信していたが、Gmail が Preview URL からの画像 fetch を拒否し、
--   ロゴが壊れアイコンで表示される問題が発生。
--   Base64 埋め込みも試したが Gmail の data URI 拒否仕様で不可。
--
--   Gmail が信頼する安定した公開 URL としてこの Supabase Storage
--   公開バケットを用意し、`src/lib/email/components/config.ts` の
--   LOGO_URL がここを参照する形に統一する。
--
-- バケット設計:
--   - public: true（公開 read、Gmail が直接 fetch できる）
--   - upload/update/delete: RLS ポリシー無し = 一般クライアントは書き込み不可
--   - 書き込みはサービス層（service_role）から scripts/upload-email-assets.mjs 経由で行う
--     （service_role は RLS を bypass するためポリシー不要）
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE POLICY "email_assets_public_read" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'email-assets');
