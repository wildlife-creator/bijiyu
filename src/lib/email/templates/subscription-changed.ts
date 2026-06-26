import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface SubscriptionChangedEmailProps {
  recipientName: string;
  oldPlanName: string;
  newPlanName: string;
  /** 適用開始日のラベル（即時アップグレードなら「ただ今より適用」、予約なら「YYYY/MM/DD」）。 */
  effectiveDate: string;
}

/**
 * §6.1-A-1 即時アップグレード / §6.1-A-2 ダウングレード予約 共通テンプレ。
 *
 * effectiveDate で 2 サブケースを切り分け。
 * 件名は両ケース共通「【ビジ友】プラン変更を承りました」。
 * M-04 / §6 全体方針: opening マーケ調・CTA を削除、事実通知のみ。
 *
 * NOTE: 6.1-B 解約予約 / 6.1-C-1 ダウングレード予約取消 / 6.1-C-2 解約予約取消 は
 *       件名・本文が異なるため別テンプレ実装が必要（次フェーズ）。
 */
export function subscriptionChangedEmail({
  recipientName,
  oldPlanName,
  newPlanName,
  effectiveDate,
}: SubscriptionChangedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】プラン変更を承りました`,
    html: renderLayout({
      title: "プラン変更を承りました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容でプラン変更を承りました。"),
        listItem("変更前のプラン", oldPlanName),
        listItem("変更後のプラン", newPlanName),
        listItem("適用開始日", effectiveDate, { last: true }),
      ].join(""),
    }),
  };
}
