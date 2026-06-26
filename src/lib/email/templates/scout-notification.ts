import { listItem, paragraph, renderLayout, truncateExcerpt } from "@/lib/email/components";

interface ScoutNotificationEmailProps {
  recipientName: string;
  senderName: string;
  jobTitle: string;
  /** スカウト本文の先頭 100 文字 + 「...」。空文字なら【メッセージ】行を省略。 */
  messageExcerpt: string;
}

/**
 * §1.7.A スカウト送信通知（既存 E-3 改修）。受注者本人 1 名宛。
 *
 * `sendScoutAction` でスカウトメッセージ INSERT 成功後に発火。
 * M-04 準拠: CTA「メッセージを確認する」と「ビジ友にログインしてご確認ください」誘導文を削除。
 * メッセージ抜粋を本文に echo（§1.1.A 応募通知と対称構造）。
 * 件名は「【ビジ友】スカウトが届きました」（案件名末尾を削除し本文の【案件名】行で表示）。
 */
export function scoutNotificationEmail({
  recipientName,
  senderName,
  jobTitle,
  messageExcerpt,
}: ScoutNotificationEmailProps): { subject: string; html: string } {
  const trimmedExcerpt = messageExcerpt.trim();
  const excerpt = trimmedExcerpt ? truncateExcerpt(trimmedExcerpt, 100) : "";

  const items = [
    listItem("案件名", jobTitle),
    excerpt ? listItem("メッセージ", `「${excerpt}」`, { blockEnd: true }) : "",
  ].filter(Boolean);

  return {
    subject: `【ビジ友】スカウトが届きました`,
    html: renderLayout({
      title: "スカウトが届きました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`${senderName} 様からスカウトメッセージが届きました。`),
        ...items,
        paragraph("ご検討ください。", { last: true }),
      ].join(""),
    }),
  };
}
