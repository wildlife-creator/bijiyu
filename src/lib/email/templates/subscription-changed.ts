import { listItem, paragraph, renderLayout } from "@/lib/email/components";

/**
 * §6.1 プラン変更通知の 5 サブケース。webhook 側で diff を見て判定する:
 *   - upgrade-immediate          : (a) plan_type 変化
 *   - downgrade-reserved         : (b) schedule_id null → non-null
 *   - cancel-reserved            : (c) cancel_at_period_end false → true
 *   - reservation-removed-downgrade : (d-1) schedule_id non-null → null
 *   - reservation-removed-cancel    : (d-2) cancel_at_period_end true → false
 */
export type SubscriptionChangedEventType =
  | "upgrade-immediate"
  | "downgrade-reserved"
  | "cancel-reserved"
  | "reservation-removed-downgrade"
  | "reservation-removed-cancel";

interface SubscriptionChangedEmailProps {
  recipientName: string;
  eventType: SubscriptionChangedEventType;
  /** A-1 / A-2 で使用（変更前のプラン名）。 */
  oldPlanName?: string;
  /** A-1 / A-2 で使用（変更後のプラン名）。 */
  newPlanName?: string;
  /** B / C-1 / C-2 で使用（現プラン名）。 */
  planName?: string;
  /** A-2 ダウングレード予約 — YYYY/MM/DD 形式の適用開始日。 */
  scheduledDate?: string;
  /** B 解約予約 — YYYY/MM/DD 形式の有料プラン終了日。 */
  endDate?: string;
}

/**
 * §6.1 プラン変更通知。eventType ごとに subject / body を切り替える。
 *
 * - 件名 3 種類（A-1/A-2 は同一、B / C-1+C-2 が別）
 * - 本文 5 種類（A-1/A-2 は表ブロック、B / C-1 / C-2 はプレーン文）
 * - M-04 / §6 全体方針: opening マーケ調・CTA を削除、事実通知のみ
 * - closing は基本なし（事実通知）
 */
export function subscriptionChangedEmail(
  props: SubscriptionChangedEmailProps,
): { subject: string; html: string } {
  switch (props.eventType) {
    case "upgrade-immediate":
      return renderUpgradeImmediate(props);
    case "downgrade-reserved":
      return renderDowngradeReserved(props);
    case "cancel-reserved":
      return renderCancelReserved(props);
    case "reservation-removed-downgrade":
      return renderReservationRemoved(props, "プラン変更");
    case "reservation-removed-cancel":
      return renderReservationRemoved(props, "解約");
  }
}

function renderUpgradeImmediate(
  props: SubscriptionChangedEmailProps,
): { subject: string; html: string } {
  return {
    subject: `【ビジ友】プラン変更を承りました`,
    html: renderLayout({
      title: "プラン変更を承りました",
      bodyContent: [
        paragraph(`${props.recipientName} 様`),
        paragraph("以下の内容でプラン変更を承りました。"),
        listItem("変更前のプラン", props.oldPlanName ?? ""),
        listItem("変更後のプラン", props.newPlanName ?? ""),
        listItem("適用開始日", "ただ今より適用", { last: true }),
      ].join(""),
    }),
  };
}

function renderDowngradeReserved(
  props: SubscriptionChangedEmailProps,
): { subject: string; html: string } {
  return {
    subject: `【ビジ友】プラン変更を承りました`,
    html: renderLayout({
      title: "プラン変更を承りました",
      bodyContent: [
        paragraph(`${props.recipientName} 様`),
        paragraph("以下の内容でプラン変更を承りました。"),
        listItem("変更前のプラン", props.oldPlanName ?? ""),
        listItem("変更後のプラン", props.newPlanName ?? ""),
        listItem("適用開始日", props.scheduledDate ?? "", { last: true }),
      ].join(""),
    }),
  };
}

function renderCancelReserved(
  props: SubscriptionChangedEmailProps,
): { subject: string; html: string } {
  return {
    subject: `【ビジ友】解約をご予約いただきました`,
    html: renderLayout({
      title: "解約をご予約いただきました",
      bodyContent: [
        paragraph(`${props.recipientName} 様`),
        paragraph("ビジ友の解約をご予約いただきました。"),
        paragraph(
          `${props.endDate ?? ""} をもって、有料プランでのご利用が終了します。`,
          { last: true },
        ),
      ].join(""),
    }),
  };
}

function renderReservationRemoved(
  props: SubscriptionChangedEmailProps,
  reservationLabel: "プラン変更" | "解約",
): { subject: string; html: string } {
  // C-1 ダウングレード予約取消 / C-2 解約予約取消 — 中間行と末尾行が差分
  const planLine =
    reservationLabel === "プラン変更"
      ? `現在のプラン（${props.planName ?? ""}）のご利用が継続されます。`
      : `今後も引き続き、現在のプラン（${props.planName ?? ""}）をご利用いただけます。`;
  return {
    subject: `【ビジ友】ご予約を取り消しました`,
    html: renderLayout({
      title: "ご予約を取り消しました",
      bodyContent: [
        paragraph(`${props.recipientName} 様`),
        paragraph(`先日ご予約いただいた${reservationLabel}を取り消しました。`),
        paragraph(planLine, { last: true }),
      ].join(""),
    }),
  };
}
