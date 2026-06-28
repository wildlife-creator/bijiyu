import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface PasswordResetCompletedEmailProps {
  recipientName: string;
  /** 変更日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  changedAt: string;
}

/**
 * §5.8.A パスワードリセット完了通知（新規追加、Resend）。
 *
 * §5.8 申請メール（Supabase Auth）の次に発火する控えメール。
 * `/reset-password/confirm` で新 PW 設定成功 → redirect 前に admin client で
 * users を引いて fire-and-forget 送信する（失敗時はリダイレクトを止めない）。
 *
 * セキュリティ強化目的: 攻撃者がリセットリンクを盗み見て新 PW 設定した場合、
 * 本人がメールで気づける（hijack 検知）。closing にお問い合わせ窓口を併記。
 */
export function passwordResetCompletedEmail({
  recipientName,
  changedAt,
}: PasswordResetCompletedEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: "【ビジ友】パスワードの変更が完了しました",
    html: renderLayout({
      title: "パスワードの変更が完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("パスワードの変更が完了しました。"),
        listItem("変更日時", changedAt, { blockEnd: true }),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
