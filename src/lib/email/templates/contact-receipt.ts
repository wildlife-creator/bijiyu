import {
  escapeHtml,
  listItem,
  paragraph,
  renderLayout,
} from "@/lib/email/components";

interface ContactReceiptEmailProps {
  /** フォーム入力 name（required、未ログインでも常に存在） */
  name: string;
  /** CONTACT_INQUIRY_TYPES のラベル値 */
  inquiryType: string;
  /** textarea 入力、複数行可。改行は <br> に変換して表示 */
  detail: string;
  /** YYYY/MM/DD HH:MM（呼出側で整形） */
  receivedAt: string;
}

/**
 * §7.1.A お問い合わせ送信者控え（COM-008）。
 *
 * `/contact` フォーム送信成功直後にフォーム入力 email 宛へ送る。
 * 未ログイン状態でも送信可能なフォームのため、宛名はフォーム入力の name を使う。
 *
 * - closing なし（§7 全体方針: 事実通知のみ）
 * - フィッシング配慮文なし
 * - 添付ファイル情報は本文に含めない（本人は送信直後で把握済、M-07 minimal）
 * - echo は最小 3 項目（種類 / 内容 / 受付日時）
 */
export function contactReceiptEmail({
  name,
  inquiryType,
  detail,
  receivedAt,
}: ContactReceiptEmailProps): { subject: string; html: string } {
  const detailHtml = `【お問い合わせ内容】 ${escapeHtml(detail).replace(/\n/g, "<br>")}`;

  return {
    subject: `【ビジ友】お問い合わせを受け付けました`,
    html: renderLayout({
      title: "お問い合わせを受け付けました",
      bodyContent: [
        paragraph(`${name} 様`),
        paragraph("ビジ友へのお問い合わせを受け付けました。"),
        listItem("お問い合わせの種類", inquiryType),
        paragraph(detailHtml, { raw: true, tight: true }),
        listItem("受付日時", receivedAt, { last: true }),
      ].join(""),
    }),
  };
}
