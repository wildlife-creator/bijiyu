import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface EmailChangedByAdminEmailProps {
  recipientName: string;
  oldEmail: string;
  newEmail: string;
  organizationName: string;
}

/**
 * §5.4.A 管理者によるメール強制変更通知（既存 E-7 改修）。
 *
 * 旧メール + 新メール 両方に同文送信（既存配信先維持、セキュリティ上必須）。
 * M-04 適合: お問い合わせ CTA ピル型ボタンを削除し、closing にテキストリンクとして再配置。
 * 「パスワードはそのまま」案内を追加（不安の先回り解消）。
 */
export function emailChangedByAdminEmail({
  recipientName,
  oldEmail,
  newEmail,
  organizationName,
}: EmailChangedByAdminEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: "【ビジ友】メールアドレスが変更されました",
    html: renderLayout({
      title: "メールアドレスが変更されました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`「${organizationName}」の管理者によって、あなたのアカウントのメールアドレスが変更されました。`),
        listItem("旧メールアドレス", oldEmail),
        listItem("新メールアドレス", newEmail, { blockEnd: true }),
        paragraph("今後のログインは新しいメールアドレスで行ってください。", { tight: true }),
        paragraph("パスワードはこれまでのものをそのままご利用いただけます。", { tight: true }),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
