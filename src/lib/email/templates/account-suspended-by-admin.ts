import { APP_URL, paragraph, renderLayout } from "@/lib/email/components";

interface AccountSuspendedByAdminEmailProps {
  /** 強制削除された本人の表示名 (姓 + 名 スペースなし、空なら「ご利用者」フォールバック) */
  recipientName: string;
}

/**
 * §8.4 admin 強制削除時の本人通知 (新規)。
 *
 * 発火: `deleteClientAccountAction` / `deleteUserAccountAction` 末尾、
 * `executeWithdrawal` 成功後に削除対象の本人宛 1 通。
 *
 * §8.3 退会完了通知と分離理由:
 *   - 件名: §8.3「退会手続きが完了しました」vs §8.4「アカウントを停止しました」
 *     → 本人が即座に「自分の意思ではない」と判別可能
 *   - opening: §8.4 は「ビジ友運営により」を冒頭に配置
 *   - closing: §8.3「身に覚えがない場合は」vs §8.4「ご不明な点がある場合は」
 *     → admin 強制削除は規約違反 / 不正検知由来である可能性が高く、
 *        「身に覚えがない」表現だと「不当だ」とクレームを誘発しうるため
 *        「ご不明な点」を採用
 *
 * 削除理由は本文に書かない (運営側がメールで機械的に列挙すると
 * 規約違反の証拠不足や名誉毀損リスク、お問い合わせ窓口経由でケースバイケース対応)。
 */
export function accountSuspendedByAdminEmail({
  recipientName,
}: AccountSuspendedByAdminEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: "【ビジ友】アカウントを停止しました",
    html: renderLayout({
      title: "アカウントを停止しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("ビジ友運営により、お客様のアカウントを停止しました。", { tight: true }),
        paragraph("これに伴い、ビジ友のご利用は終了いたしました。"),
        paragraph("ご利用中の有料プラン・オプションがあった場合は、合わせて解約処理が完了しています。"),
        paragraph("ご不明な点がある場合は、下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
