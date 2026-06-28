import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VideoPublishedOpsEmailProps {
  /** 申込者の姓名 (スペースなし結合)。 */
  applicantName: string;
  /** `client_profiles.display_name` → `users.company_name` → null (行ごと省略)。 */
  companyName: string | null;
  /** OPTION_LABELS[optionType] で解決した動画種別。 */
  optionLabel: string;
  /** YYYY/MM/DD HH:MM (分単位、ops workflow tracking 用)。 */
  publishedAt: string;
  /** 申込ユーザーの UUID (deep link 用)。 */
  userId: string;
  /** deep link 用 site URL。 */
  siteUrl: string;
}

/**
 * §6.6.C-Ops 動画掲載完了 + 申込者通知済確認 (運営向け、新規)。M-07 準拠。
 *
 * 配信先: `process.env.OPS_NOTIFICATION_EMAIL`。
 *
 * - 件名「【ビジ友 運営】」プレフィックス
 * - 【操作者】行は含めない (admin プロフィール UI 不在のため、accountability は audit_logs で代替)
 * - 【会社名】行は §6.6.B-Ops と同じ条件で省略可
 * - 運営チーム複数人が同じ受信箱で動画申込スレッドの完結を追跡可能に
 */
export function videoPublishedOpsEmail({
  applicantName,
  companyName,
  optionLabel,
  publishedAt,
  userId,
  siteUrl,
}: VideoPublishedOpsEmailProps): { subject: string; html: string } {
  const deepLink = `${siteUrl}/admin/users/${userId}`;
  const bodyParts: string[] = [
    paragraph(
      "動画オプションの掲載が完了し、申込者へ通知メールを送信しました。",
    ),
    listItem("申込者", applicantName),
  ];
  if (companyName !== null && companyName.trim() !== "") {
    bodyParts.push(listItem("会社名", companyName));
  }
  bodyParts.push(
    listItem("動画種別", optionLabel),
    listItem("掲載完了日時", publishedAt, { blockEnd: true }),
    paragraph(
      "申込者の詳細は下記からご確認いただけます。ログインした状態でクリックしてください。",
    ),
    paragraph(deepLink, { last: true }),
  );

  return {
    subject: `【ビジ友 運営】動画オプションの掲載完了を申込者へ通知しました`,
    html: renderLayout({
      title: "動画オプションの掲載完了を申込者へ通知しました",
      bodyContent: bodyParts.join(""),
    }),
  };
}
