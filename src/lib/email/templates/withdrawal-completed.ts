import { APP_URL, paragraph, renderLayout } from "@/lib/email/components";

/**
 * §8.3 退会完了通知（既存 E-8 改修）。退会した本人 1 名宛。
 *
 * `withdrawAction` で executeWithdrawal + signOut 成功後に発火。
 * M-04 / §6 マーケ調 opening 削除原則の遡及適用 + closing 整理 + 重複ヘッダ削除。
 * お問い合わせ窓口 URL は不正退会の受け皿として closing に残す。
 */

interface WithdrawalCompletedParams {
  recipientName: string;
}

export function withdrawalCompletedEmail({
  recipientName,
}: WithdrawalCompletedParams): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: "【ビジ友】退会手続きが完了しました",
    html: renderLayout({
      title: "退会手続きが完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("退会手続きが完了しました。", { tight: true }),
        paragraph("ご利用中の有料プラン・オプションがあった場合は、合わせて解約処理が完了しています。"),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
