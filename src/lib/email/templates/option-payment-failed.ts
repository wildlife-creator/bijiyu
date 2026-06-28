import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OptionPaymentFailedEmailProps {
  recipientName: string;
  /** OPTION_LABELS[optionType] で解決した日本語表記。 */
  optionLabel: string;
  /** Stripe `invoice.next_payment_attempt` → YYYY/MM/DD。null 時は呼出側で「近日中」を渡す。 */
  nextRetryDate: string;
}

/**
 * §6.5.B 補償オプション支払い失敗（新規）。
 *
 * 発火: `invoice.payment_failed` webhook（option_subscriptions hit）。
 * 補償は §6.3（基本プラン）と異なり Stripe dunning に委ねる方針のため、
 * 「7 日以内に〜」は書かず「確認が取れないまま日数が経過すると〜」と柔らかい表現。
 * closing は §6.3 と同一「お支払い方法のご確認をお願いします。」。
 * 同 past_due 期間中のリトライ毎送信は許容（§6.3 と一貫）。
 */
export function optionPaymentFailedEmail({
  recipientName,
  optionLabel,
  nextRetryDate,
}: OptionPaymentFailedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】補償オプションのお支払いが確認できませんでした`,
    html: renderLayout({
      title: "補償オプションのお支払いが確認できませんでした",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          "ご登録のお支払い方法で、補償オプションの決済が確認できませんでした。",
        ),
        listItem("ご利用中のオプション", optionLabel),
        listItem("次回お支払い予定日", nextRetryDate, { blockEnd: true }),
        paragraph(
          "お支払いの確認が取れないまま日数が経過すると、補償オプションが自動的に解約されます。",
        ),
        paragraph("お支払い方法のご確認をお願いします。", { last: true }),
      ].join(""),
    }),
  };
}
