import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface PlanAppliedOpsEmailProps {
  /** 申込者の姓名（スペースなし結合）。 */
  applicantName: string;
  /** `client_profiles.display_name` → `users.company_name` → null（行ごと省略）。 */
  companyName: string | null;
  /** `planDisplayName(planType, billingCycle)`。例:「プレミアムプラン（年払い）」 */
  planName: string;
  /** `PAYMENT_METHOD_LABELS[paymentMethod]`。例:「カード決済」「銀行振込」 */
  paymentMethodLabel: string;
  /** YYYY/MM/DD */
  activatedAt: string;
  /** 契約主体ユーザーの UUID（ADM-004 発注者アカウント詳細への deep link 用）。 */
  userId: string;
  /** deep link 用 site URL。 */
  siteUrl: string;
}

/**
 * §6.7-Ops 基本プラン新規契約の運営通知（運営宛、P11 で新設・2026-09-10）。M-07 準拠。
 *
 * 配信先: `process.env.OPS_NOTIFICATION_EMAIL`。発火は §6.7（会員宛「プランのお申し込みを承りました」）
 * と同時 = 新規契約のみ（Stripe checkout.session.completed / 銀行振込の ADM-026 有効化）。
 * プラン変更・解約・支払い失敗では送らない（通知過多を避ける）。
 *
 * 目的: 運営が有料会員の増加（特にプレミアム・ハイエンド = プロフィール動画付属 / サポート担当の
 * 運用開始）に気づけるようにする。**付属動画の判定はメールでは行わない**（プラン名と支払サイクルを
 * 見て運営が判断する。料金画面と同じ「アプリで判定しない」方針）。
 */
export function planAppliedOpsEmail({
  applicantName,
  companyName,
  planName,
  paymentMethodLabel,
  activatedAt,
  userId,
  siteUrl,
}: PlanAppliedOpsEmailProps): { subject: string; html: string } {
  const deepLink = `${siteUrl}/admin/clients/${userId}`;
  const bodyParts: string[] = [
    paragraph("基本プランの新規お申し込みがありました。"),
    listItem("申込者", applicantName),
  ];
  if (companyName !== null && companyName.trim() !== "") {
    bodyParts.push(listItem("会社名", companyName));
  }
  bodyParts.push(
    listItem("お申し込みプラン", planName),
    listItem("お支払い方法", paymentMethodLabel),
    listItem("ご利用開始日", activatedAt, { blockEnd: true }),
    paragraph(
      "申込者の詳細は下記からご確認いただけます。ログインした状態でクリックしてください。",
    ),
    paragraph(deepLink, { last: true }),
  );

  return {
    subject: `【ビジ友 運営】プランの新規お申し込みがありました`,
    html: renderLayout({
      title: "プランの新規お申し込みがありました",
      bodyContent: bodyParts.join(""),
    }),
  };
}
