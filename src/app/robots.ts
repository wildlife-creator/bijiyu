import type { MetadataRoute } from "next";

// Next.js の Metadata Route。`/robots.txt` のレスポンスを環境変数に応じて出し分ける。
// APP_ENV が "production" のときだけ検索エンジンに全ページを公開する。
// それ以外（staging / preview / 未設定 / タイポ）はすべて拒否側に倒す安全側デフォルト。
// APP_ENV の運用は .env.local.example の「アプリ環境識別」セクションを参照。
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.APP_ENV === "production";

  if (isProduction) {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
