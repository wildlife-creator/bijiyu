import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface TroubleReportOpsNotificationEmailProps {
  /** フォーム入力 reporter_name */
  reporterName: string;
  /** `resolveParticipantName()` 解決値（法人プランは社名、個人プランは姓名） */
  memberDisplayName: string;
  /** `users.email`（admin client で取得、ログインアカウント実値） */
  accountEmail: string;
  /**
   * `resolveReporterOrganizationName()` の結果。
   * 法人所属がある場合のみ string（複数所属は「、」join）/ なければ null（行ごと省略）。
   */
  organizationName: string | null;
  /** フォーム入力 trouble_reports.email（連絡用メアド、accountEmail と異なる可能性あり） */
  formEmail: string;
  /** フォーム入力 counterparty_name（free text） */
  counterpartyName: string;
  /** TROUBLE_CATEGORIES のラベル値。空時は本文から行ごと省略 */
  category: string | null;
  /** YYYY/MM/DD HH:MM */
  receivedAt: string;
  /** deep link 用の site URL（host header 由来） */
  siteUrl: string;
  /** trouble_reports.id（URL のみ使用、本文には列挙しない） */
  reportId: string;
}

/**
 * §7.2.B トラブル報告運営通知（COM-012）。M-07 準拠。
 *
 * 配信先: `OPS_NOTIFICATION_EMAIL`。
 *
 * - ブロック化: 報告者情報ブロック（最大 4 行）+ 空行 + トラブル詳細ブロック（最大 3 行）+ 空行 + deep link
 * - ログイン必須なので「ログイン状態」行は不要、【ビジ友アカウント】行でアカウント実値を直接記載
 * - 2 種類のメアド（accountEmail / formEmail）を併記
 * - `${content}`（トラブル内容本文）は含めない（M-07 minimal、admin 画面で確認）
 * - 添付ファイル情報も本文不要
 */
export function troubleReportOpsNotificationEmail({
  reporterName,
  memberDisplayName,
  accountEmail,
  organizationName,
  formEmail,
  counterpartyName,
  category,
  receivedAt,
  siteUrl,
  reportId,
}: TroubleReportOpsNotificationEmailProps): { subject: string; html: string } {
  const deepLink = `${siteUrl}/admin/trouble-reports/${reportId}`;

  // 報告者情報ブロック（最大 4 行: 報告者 / ビジ友アカウント / 所属会社? / 連絡用メアド）
  const reporterBlock: string[] = [
    listItem("報告者", reporterName),
    listItem(
      "ビジ友アカウント",
      `${memberDisplayName} 様（${accountEmail}）`,
    ),
  ];
  if (organizationName && organizationName.trim()) {
    reporterBlock.push(listItem("所属会社", organizationName));
  }
  reporterBlock.push(
    listItem("連絡用メールアドレス", formEmail, { blockEnd: true }),
  );

  // トラブル詳細ブロック（最大 3 行: 相手 / 種類? / 受信日時）
  const troubleBlock: string[] = [listItem("トラブル相手", counterpartyName)];
  if (category && category.trim()) {
    troubleBlock.push(listItem("トラブル種類", category));
  }
  troubleBlock.push(listItem("受信日時", receivedAt, { blockEnd: true }));

  return {
    subject: `【ビジ友 運営】トラブル報告を受信しました`,
    html: renderLayout({
      title: "トラブル報告を受信しました",
      bodyContent: [
        paragraph("トラブル報告を受信しました。"),
        ...reporterBlock,
        ...troubleBlock,
        paragraph("ログインした状態で以下の URL を開いて詳細をご確認ください:"),
        paragraph(deepLink, { last: true }),
      ].join(""),
    }),
  };
}
