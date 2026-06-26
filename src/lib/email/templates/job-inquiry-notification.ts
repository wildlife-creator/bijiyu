import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface JobInquiryNotificationEmailProps {
  recipientName: string; // 宛先発注者の表示名
  senderName: string; // フォーム入力の氏名
  senderEmail: string; // フォーム入力のメール
  topics: string[]; // 選択された項目ラベル
  content: string; // 任意の本文（未入力可）
}

/**
 * §7.3.A 求人問合せ通知（COM-013、既存 E-4 改修）。宛先発注者宛。
 *
 * 件名末尾の `- ${senderName}` を削除。「受信しました」→「届きました」（宛先発注者目線）。
 * CTA「受信箱で確認する」+ inboxUrl deep link を削除（M-04 適合）。
 * closing は「ご返信は送信者のメールアドレスへ直接お送りいただけます。」（offering 形）。
 *
 * NOTE: M-03 broadcast 適用（法人プランは Owner + admin + staff 全員配信）は
 *       呼出側（actions.ts）の改修事項として次フェーズで実装。
 */
export function jobInquiryNotificationEmail({
  recipientName,
  senderName,
  senderEmail,
  topics,
  content,
}: JobInquiryNotificationEmailProps): { subject: string; html: string } {
  const topicsText = topics.length > 0 ? topics.join("、") : "（未選択）";
  const contentText = content.trim() ? content : "（未入力）";

  return {
    subject: `【ビジ友】求人へのお問い合わせが届きました`,
    html: renderLayout({
      title: "求人へのお問い合わせが届きました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`${senderName} 様より、求人へのお問い合わせが届きました。`),
        listItem("送信者", senderName),
        listItem("メールアドレス", senderEmail),
        listItem("お問い合わせ項目", topicsText),
        listItem("お問い合わせ内容", contentText, { blockEnd: true }),
        paragraph("ご返信は送信者のメールアドレスへ直接お送りいただけます。", { last: true }),
      ].join(""),
    }),
  };
}
