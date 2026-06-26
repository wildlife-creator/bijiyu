import { LOGO_URL } from "./config";

interface LayoutProps {
  /** <title> タグ(クライアントの一覧表示で稀に使われる)。件名と同じで OK。 */
  title: string;
  /** 本文セルに差し込む HTML 文字列。parts.ts のヘルパーで組み立てる。 */
  bodyContent: string;
}

/**
 * 全メール共通レイアウト(Header C + Body B + Footer B + 外周 C)。
 *
 * - 外周: 薄紫 #f5f3f7
 * - カード: 白 + border-radius 14px + 軽い影
 * - ヘッダー: ロゴ画像 + 紫太線 3px
 * - 本文: 15px / line-height 1.8 / padding 40px 36px(SP: 28px 20px)
 * - フッター: 白 + 上に細い灰線 + 「自動送信」テキスト
 *
 * 詳細仕様は `.kiro/specs/notifications/email-decisions-wip.md` の M-09 を参照。
 */
export function renderLayout({ title, bodyContent }: LayoutProps): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
@media only screen and (max-width: 600px) {
  .outer-cell { padding: 16px 8px !important; }
  .container { width: 100% !important; }
  .header-cell { padding: 24px 16px 18px !important; }
  .body-cell { padding: 28px 20px !important; }
  .url-cell { padding: 10px 12px !important; }
  .footer-cell { padding: 18px 16px !important; }
  .body-text { font-size: 14px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#f5f3f7;font-family:'Zen Kaku Gothic New','ヒラギノ角ゴ ProN','Hiragino Kaku Gothic ProN',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="outer-cell" align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="container" style="max-width:600px;background:#ffffff;border-radius:14px;box-shadow:0 6px 16px rgba(85,30,99,0.08);overflow:hidden;">
<tr><td align="center" class="header-cell" style="padding:32px 24px 24px;background:#ffffff;border-bottom:3px solid #920783;">
<img src="${LOGO_URL}" alt="ビジ友" width="150" style="display:block;height:auto;border:0;">
</td></tr>
<tr><td class="body-cell" style="padding:40px 36px;">
${bodyContent}
</td></tr>
<tr><td align="center" class="footer-cell" style="padding:24px;background:#ffffff;border-top:1px solid #ececec;">
<p style="margin:0;font-size:12px;color:#999;line-height:1.6;">このメールは ビジ友 から自動送信されています</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
