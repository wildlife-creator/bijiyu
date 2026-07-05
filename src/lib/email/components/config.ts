export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
export const BRAND_COLOR = "#920783";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

/**
 * メール用ロゴは Supabase Storage の公開バケット `email-assets` に配置。
 * Vercel Preview URL / 埋め込み Base64 はいずれも Gmail 側で表示不可（前者は
 * 画像プロキシが fetch を諦める、後者は data URI レンダリング拒否）だったため、
 * Gmail が信頼する安定した公開 URL（Supabase Storage）に統一する。
 */
export const LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/email-assets/logo-horizontal.png`;
