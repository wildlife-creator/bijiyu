import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface PlanActivatedEmailProps {
  recipientName: string;
  /** PLAN_LABELS[planType] で解決した日本語表記。 */
  planName: string;
  /** YYYY/MM/DD */
  activatedAt: string;
}

/**
 * §6.7 基本プラン契約完了 (新規、1 件)。
 *
 * 発火: `checkout.session.completed` (type='plan') → `handlePlanCheckout` 末尾。
 * 初回契約 / 解約後の再契約両方をカバー (Stripe 上はどちらも checkout.session.completed)。
 *
 * - 件名にプラン名を含めない (subject 統一 + プラン名が冗長になるため、本文行で明示)
 * - closing なし (§6.6.C-User と同じ事実通知のみシンプルパターン)
 * - M-03 broadcast 適用外 (基本プラン契約は Owner 単独業務、§6.1〜§6.4 と同方針)
 */
export function planActivatedEmail({
  recipientName,
  planName,
  activatedAt,
}: PlanActivatedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】プランのお申し込みを承りました`,
    html: renderLayout({
      title: "プランのお申し込みを承りました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容でプランのお申し込みを承りました。"),
        listItem("お申し込みプラン", planName),
        listItem("ご利用開始日", activatedAt, { last: true }),
      ].join(""),
    }),
  };
}
