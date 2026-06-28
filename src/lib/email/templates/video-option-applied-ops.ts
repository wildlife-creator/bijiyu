import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VideoOptionAppliedOpsEmailProps {
  /** 申込者の姓名 (スペースなし結合、`users.last_name + first_name`)。 */
  applicantName: string;
  /** `client_profiles.display_name` → `users.company_name` → null (行ごと省略)。 */
  companyName: string | null;
  /** YYYY/MM/DD HH:MM (分単位、ops workflow tracking 用)。 */
  appliedAt: string;
  /** OPTION_LABELS[optionType] で解決した動画種別。 */
  optionLabel: string;
  /** 申込ユーザーの UUID (deep link 用)。 */
  userId: string;
  /** deep link 用 site URL (host header 由来、末尾スラッシュなし)。 */
  siteUrl: string;
}

/**
 * §6.6.B-Ops 動画オプション新規申込 (運営向け、新規)。M-07 準拠。
 *
 * 配信先: `process.env.OPS_NOTIFICATION_EMAIL`。
 *
 * - 件名「【ビジ友 運営】」プレフィックス
 * - 【会社名】行は `companyName` が null なら省略 (`client_profiles.display_name`
 *   → `users.company_name` で解決済み)
 * - 【申込日時】は分単位 (ops workflow tracking 用)
 * - 運営は申込通知を受けて動画制作・撮影手配を開始する
 * - URL の直前に「ログインした状態でクリックしてください。」警告文
 */
export function videoOptionAppliedOpsEmail({
  applicantName,
  companyName,
  appliedAt,
  optionLabel,
  userId,
  siteUrl,
}: VideoOptionAppliedOpsEmailProps): { subject: string; html: string } {
  const deepLink = `${siteUrl}/admin/users/${userId}`;
  const bodyParts: string[] = [
    paragraph("動画オプションのお申し込みが新規にありました。"),
    paragraph("動画制作・撮影手配を進めてください。"),
    listItem("申込者", applicantName),
  ];
  if (companyName !== null && companyName.trim() !== "") {
    bodyParts.push(listItem("会社名", companyName));
  }
  bodyParts.push(
    listItem("申込日時", appliedAt),
    listItem("動画種別", optionLabel, { blockEnd: true }),
    paragraph(
      "申込者の詳細は下記からご確認いただけます。ログインした状態でクリックしてください。",
    ),
    paragraph(deepLink, { last: true }),
  );

  return {
    subject: `【ビジ友 運営】動画オプションの新規お申し込みがありました`,
    html: renderLayout({
      title: "動画オプションの新規お申し込みがありました",
      bodyContent: bodyParts.join(""),
    }),
  };
}
