import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface PaymentFailedEmailProps {
  recipientName: string;
  planName: string;
  /** Stripe `invoice.next_payment_attempt` → YYYY/MM/DD。null 時は呼出側で「近日中」を渡す。 */
  nextRetryDate: string;
}

/**
 * §6.3 支払い失敗（既存 E-11 改修）。
 * 件名・本文 1 行目で「有料プラン」を明記、補償オプション他課金との曖昧さを排除。
 * M-04 準拠で CTA / 「リトライ」用語を撤廃、退会フレーミング除去 + forward fact closing 追加。
 *
 * Stripe `invoice.payment_failed` webhook で発火、同 past_due 期間中のリトライ毎に送信。
 */
export function paymentFailedEmail({
  recipientName,
  planName,
  nextRetryDate,
}: PaymentFailedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】有料プランのお支払いが確認できませんでした`,
    html: renderLayout({
      title: "有料プランのお支払いが確認できませんでした",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("ご登録のお支払い方法で、有料プランの決済が確認できませんでした。"),
        listItem("ご利用中のプラン", planName),
        listItem("次回お支払い予定日", nextRetryDate, { blockEnd: true }),
        paragraph("7 日以内にお支払い方法を更新いただけない場合、自動的に有料プランが解約され、無料プランに切り替わります。"),
        paragraph("お支払い方法のご確認をお願いします。", { last: true }),
      ].join(""),
    }),
  };
}
