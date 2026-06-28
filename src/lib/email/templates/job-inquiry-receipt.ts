import {
  escapeHtml,
  listItem,
  paragraph,
  renderLayout,
} from "@/lib/email/components";

interface JobInquiryReceiptEmailProps {
  /** フォーム入力 sender name */
  senderName: string;
  /** 宛先発注者の `resolveParticipantName()` 解決値（§7.3.A と同 helper） */
  targetDisplayName: string;
  /** `job_inquiries.topics`（「、」join 済） */
  topics: string;
  /** `job_inquiries.content`（空時は「（未入力）」、白文字 pre-wrap で改行保持） */
  content: string;
  /** YYYY/MM/DD HH:MM */
  sentAt: string;
}

/**
 * §7.3.B 求人問合せ送信者控え（COM-013、新規）。
 *
 * `/clients/[id]/inquiry` フォーム送信成功直後、送信者本人にも受領通知を送る。
 * ログイン必須フォームだが、§7.1.A / §7.2.A との一貫性で宛名はフォーム入力 senderName を採用。
 *
 * - closing なし（§7 全体方針）
 * - 添付なし（求人問合せは元々添付機能なし）
 * - フィッシング配慮文なし
 */
export function jobInquiryReceiptEmail({
  senderName,
  targetDisplayName,
  topics,
  content,
  sentAt,
}: JobInquiryReceiptEmailProps): { subject: string; html: string } {
  const trimmedContent = content.trim();
  const contentValue = trimmedContent ? trimmedContent : "（未入力）";
  const contentHtml = `【お問い合わせ内容】 ${escapeHtml(contentValue).replace(/\n/g, "<br>")}`;

  return {
    subject: `【ビジ友】求人へのお問い合わせを受け付けました`,
    html: renderLayout({
      title: "求人へのお問い合わせを受け付けました",
      bodyContent: [
        paragraph(`${senderName} 様`),
        paragraph(`${targetDisplayName} へのお問い合わせを送信しました。`),
        listItem("お問い合わせ項目", topics),
        paragraph(contentHtml, { raw: true, tight: true }),
        listItem("送信日時", sentAt, { last: true }),
      ].join(""),
    }),
  };
}
