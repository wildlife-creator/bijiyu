import { listItem, paragraph, renderLayout } from "@/lib/email/components";

/**
 * §6.5.C reason 引数。
 *   - manual          : ユーザーが /billing で解約ボタンを押した
 *   - stripe-dunning  : Stripe 側リトライ枯渇による自動解約
 *
 * 判定軸は Stripe webhook payload の `subscription.cancellation_details.reason`
 *   - `cancellation_requested` → manual
 *   - `payment_failed`        → stripe-dunning
 *   - null / unknown          → manual（フォールバック）
 */
export type OptionCancellationReason = "manual" | "stripe-dunning";

interface OptionSubscriptionCancelledEmailProps {
  recipientName: string;
  /** OPTION_LABELS[optionType] で解決した日本語表記。 */
  optionLabel: string;
  /** YYYY/MM/DD */
  cancelledAt: string;
  reason: OptionCancellationReason;
}

/**
 * §6.5.C 補償オプション解約完了（新規、1 テンプレ 2 パターン）。
 *
 * 発火: `customer.subscription.deleted` webhook（option_subscriptions hit）。
 * closing は negative forward fact「補償の対象外となります」: 基本プラン解約と
 * 違い「無料プラン継続」のような positive 受け皿が補償解約には存在しないため、
 * 事実を直球で伝える。
 * 件名は両パス共通（§6.4 と同じ判断、cause は本文 1 行目で）。
 */
export function optionSubscriptionCancelledEmail({
  recipientName,
  optionLabel,
  cancelledAt,
  reason,
}: OptionSubscriptionCancelledEmailProps): { subject: string; html: string } {
  const openingLine =
    reason === "stripe-dunning"
      ? "お支払い方法での決済が確認できないまま日数が経過したため、以下の内容で補償オプションの解約が完了しました。"
      : "以下の内容で補償オプションの解約が完了しました。";

  return {
    subject: `【ビジ友】補償オプションのご解約が完了しました`,
    html: renderLayout({
      title: "補償オプションのご解約が完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(openingLine),
        listItem("解約したオプション", optionLabel),
        listItem("解約日", cancelledAt, { blockEnd: true }),
        paragraph(
          "今後発生する給与未払いトラブルは、補償の対象外となります。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
