import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface SubscriptionCancelledEmailProps {
  recipientName: string;
  planName: string;
  cancelledAt: string;
}

/**
 * §6.2 有料プラン解約完了（既存 E-10 改修）。
 * 件名・本文で「有料プラン」を明記して退会通知（§8.3 = E-8）との誤読を防ぐ。
 * 退会フレーミング（「長らくのご利用」「再度ご登録」等）は削除し、
 * 「引き続き無料プランで使える」forward fact closing で締める。
 *
 * 3 つの発火パスで共通使用:
 *   1. 手動解約予約 → 期間到達（manual）
 *   2. 即時解約（manual）
 *   3. auto-cancel after past_due 7 日経過（auto-past-due）
 *
 * NOTE: §6.4 で auto-past-due パス用の冒頭一行プレフィックスを追加予定（後続 task）。
 */
export function subscriptionCancelledEmail({
  recipientName,
  planName,
  cancelledAt,
}: SubscriptionCancelledEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】有料プランのご解約が完了しました`,
    html: renderLayout({
      title: "有料プランのご解約が完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容で有料プランの解約が完了しました。"),
        listItem("解約したプラン", planName),
        listItem("解約日", cancelledAt, { blockEnd: true }),
        paragraph("引き続き、無料プランでビジ友をご利用いただけます。", { last: true }),
      ].join(""),
    }),
  };
}
