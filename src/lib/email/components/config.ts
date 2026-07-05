import { readFileSync } from "node:fs";
import { join } from "node:path";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
export const BRAND_COLOR = "#920783";

/**
 * ロゴを Base64 data URI として埋め込む。
 *
 * 理由: Gmail 等の外部画像プロキシが Vercel Preview URL からの画像 fetch に
 * 失敗するケース（cold start タイムアウト・Bot 検知等）を回避するため。
 * data URI 化することで受信メールクライアント側で fetch 不要となり、
 * どのメールクライアントでも確実にロゴが表示される。
 *
 * トレードオフ: メール 1 通あたり +3KB 程度サイズ増だが、
 * ロゴ画像が確実に届く価値の方が大きい。
 */
function loadLogoDataUri(): string {
  try {
    const logoPath = join(process.cwd(), "public", "images", "logo-horizontal.png");
    const buffer = readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    // ファイル読み込み失敗時は外部 URL にフォールバック
    return `${APP_URL}/images/logo-horizontal.png`;
  }
}

export const LOGO_URL = loadLogoDataUri();
