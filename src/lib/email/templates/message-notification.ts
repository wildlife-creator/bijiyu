import { paragraph, renderLayout, truncateExcerpt } from "@/lib/email/components";

interface MessageNotificationEmailProps {
  recipientName: string;
  senderName: string;
  messagePreview: string;
}

/**
 * §2.1 通常メッセージ受信通知。
 * M-04 準拠: CTA / deep link / 「ログインしてご確認ください」等の UI 名指しを含まない。
 */
export function messageNotificationEmail({
  recipientName,
  senderName,
  messagePreview,
}: MessageNotificationEmailProps): { subject: string; html: string } {
  const excerpt = truncateExcerpt(messagePreview, 100);

  return {
    subject: `【ビジ友】${senderName}さんから新しいメッセージが届きました`,
    html: renderLayout({
      title: "新しいメッセージ",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`${senderName}さんから新しいメッセージが届きました。`),
        paragraph("【メッセージ】", { tight: true }),
        paragraph(excerpt, { last: true }),
      ].join(""),
    }),
  };
}
