import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface SubscriptionCancelledEmailProps {
  recipientName: string;
  planName: string;
  cancelledAt: string;
  /**
   * 解約経路 (§6.4 案 4、1 テンプレ 2 パターン化):
   *   - 'manual' (default): 手動解約 (予約期間到達 / 即時解約)
   *   - 'auto-past-due': 7 日経過自動解約 (Edge Function `auto-cancel-past-due` 経由)
   *
   * `auto-past-due` のときのみ opening 直前に 1 行プレフィックスを差し込む。
   * 件名・closing は両パターンで共通 (§6.4 確定済)。
   */
  reason?: "manual" | "auto-past-due";
}

/**
 * §6.2 + §6.4 有料プラン解約完了（既存 E-10 改修）。1 テンプレ 2 パターン。
 *
 * 件名・本文で「有料プラン」を明記して退会通知（§8.3 = E-8）との誤読を防ぐ。
 * 退会フレーミング（「長らくのご利用」「再度ご登録」等）は削除し、
 * 「引き続き無料プランで使える」forward fact closing で締める。
 *
 * 発火パス（3 つ、すべて `handleSubscriptionDeleted` 経由）:
 *   1. 手動解約予約 → 期間到達（reason: 'manual'）
 *   2. 即時解約（reason: 'manual'）
 *   3. auto-cancel after past_due 7 日経過（reason: 'auto-past-due'）
 *
 * Edge Function `auto-cancel-past-due` は **メール送らない**（二重送信防止）。
 * すべてのメール送信は webhook 経由に統一（§6.4 案 4）。
 */
export function subscriptionCancelledEmail({
  recipientName,
  planName,
  cancelledAt,
  reason = "manual",
}: SubscriptionCancelledEmailProps): { subject: string; html: string } {
  const bodyContent: string[] = [paragraph(`${recipientName} 様`)];

  // §6.4: auto-past-due のときのみ opening を差し替え。
  // 「お支払い方法での決済が 7 日間確認できなかったため、」で
  // 自動解約された経緯を本人に伝える。
  if (reason === "auto-past-due") {
    bodyContent.push(
      paragraph("お支払い方法での決済が 7 日間確認できなかったため、有料プランの解約が完了しました。"),
    );
  } else {
    bodyContent.push(paragraph("以下の内容で有料プランの解約が完了しました。"));
  }

  bodyContent.push(
    listItem("解約したプラン", planName),
    listItem("解約日", cancelledAt, { blockEnd: true }),
    paragraph("引き続き、無料プランでビジ友をご利用いただけます。", { last: true }),
  );

  return {
    subject: `【ビジ友】有料プランのご解約が完了しました`,
    html: renderLayout({
      title: "有料プランのご解約が完了しました",
      bodyContent: bodyContent.join(""),
    }),
  };
}
