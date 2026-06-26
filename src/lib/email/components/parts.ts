import { BRAND_COLOR } from "./config";
import { escapeHtml } from "./escape";

interface ParagraphOpts {
  /** margin-bottom を 8px に詰める(連続項目で使用)。 */
  tight?: boolean;
  /** 末尾段落(margin-bottom: 0)。 */
  last?: boolean;
  /** ブロック区切りの 20px gap を出す(リスト塊の最後など)。 */
  blockEnd?: boolean;
  /** 値が既に HTML としてエスケープ済み or 制御 HTML を含む場合に true。 */
  raw?: boolean;
}

const BODY_FONT = "font-size:15px;color:#2a2a2a;line-height:1.8;";

function resolveMargin(opts: ParagraphOpts): string {
  if (opts.last) return "margin:0;";
  if (opts.blockEnd) return "margin:0 0 20px;";
  if (opts.tight) return "margin:0 0 8px;";
  return "margin:0 0 20px;";
}

export function paragraph(text: string, opts: ParagraphOpts = {}): string {
  const safe = opts.raw ? text : escapeHtml(text);
  return `<p class="body-text" style="${resolveMargin(opts)}${BODY_FONT}">${safe}</p>`;
}

/** 【ラベル】 値 形式の 1 行。連続して並べると spec の項目リスト形式になる(デフォルト 8px gap)。 */
export function listItem(label: string, value: string, opts: ParagraphOpts = {}): string {
  const margin = resolveMargin({ tight: true, ...opts });
  return `<p class="body-text" style="${margin}${BODY_FONT}">【${escapeHtml(label)}】 ${escapeHtml(value)}</p>`;
}

export function ctaButton(text: string, url: string): string {
  return `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 26px;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;font-size:14px;">${escapeHtml(text)}</a></p>`;
}

/** CTA ボタンの直下に置く URL 直貼り(薄紫ボックス)。M-08 準拠。 */
export function urlBlock(url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7fb;border-radius:8px;margin:0 0 28px;"><tr><td class="url-cell" style="padding:12px 16px;"><p style="margin:0 0 6px;font-size:11px;color:#999;line-height:1.6;">ボタンが押せない場合は、下記の URL をブラウザに貼り付けてください</p><p style="margin:0;font-size:12px;color:#666;word-break:break-all;line-height:1.6;">${escapeHtml(url)}</p></td></tr></table>`;
}

/** メッセージ抜粋等を 100 文字 + 「...」に整形(改行を半角スペースに置換)。 */
export function truncateExcerpt(text: string, max = 100): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max) + "..." : normalized;
}
