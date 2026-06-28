import {
  escapeHtml,
  listItem,
  paragraph,
  renderLayout,
} from "@/lib/email/components";

interface TroubleReportReceiptEmailProps {
  /** フォーム入力 reporter_name（required、user プロフィール default が編集可） */
  reporterName: string;
  /** フォーム入力 counterparty_name（required、free text） */
  counterpartyName: string;
  /** TROUBLE_CATEGORIES のラベル値。空時は本文から行ごと省略 */
  category: string | null;
  /** textarea 入力、複数行可。改行は <br> に変換 */
  content: string;
  /** YYYY/MM/DD HH:MM */
  receivedAt: string;
}

/**
 * §7.2.A トラブル報告送信者控え（COM-012）。
 *
 * `/trouble-report` フォーム送信成功直後、フォーム入力 email 宛へ送る。
 * ログイン必須フォーム（middleware で auth ガード、`user_id` は常に存在）。
 *
 * - closing なし（§7 全体方針）
 * - 任意の `category` が空時は本文から行ごと省略
 * - 添付ファイル情報は本文不要（本人は把握済）
 */
export function troubleReportReceiptEmail({
  reporterName,
  counterpartyName,
  category,
  content,
  receivedAt,
}: TroubleReportReceiptEmailProps): { subject: string; html: string } {
  const contentHtml = `【内容】 ${escapeHtml(content).replace(/\n/g, "<br>")}`;

  const items = [
    listItem("トラブル相手", counterpartyName),
    category && category.trim() ? listItem("トラブル種類", category) : "",
    paragraph(contentHtml, { raw: true, tight: true }),
    listItem("受付日時", receivedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】トラブル報告を受け付けました`,
    html: renderLayout({
      title: "トラブル報告を受け付けました",
      bodyContent: [
        paragraph(`${reporterName} 様`),
        paragraph("トラブル報告を受け付けました。"),
        ...items,
      ].join(""),
    }),
  };
}
