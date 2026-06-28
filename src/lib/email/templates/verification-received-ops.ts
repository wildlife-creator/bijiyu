import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VerificationReceivedOpsEmailProps {
  /** 申請者の姓名（スペースなし結合、`users.last_name + users.first_name`） */
  applicantName: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
  /** YYYY/MM/DD HH:MM */
  appliedAt: string;
  /** deep link 用の site URL（host header 由来、末尾スラッシュなし） */
  siteUrl: string;
  /** identity_verifications.id（URL に埋め込み、本文には列挙しない） */
  verificationId: string;
}

const TYPE_LABELS: Record<"identity" | "ccus", string> = {
  identity: "本人確認",
  ccus: "CCUS登録",
};

/**
 * §4.4 本人確認・CCUS 申請受理運営通知（運営宛、新規）。M-07 準拠。
 *
 * 配信先: `OPS_NOTIFICATION_EMAIL`（既存 env var を流用、§4.4 / §5.2.B / §7.1.B / §7.2.B と一貫）。
 *
 * - 件名「【ビジ友 運営】」プレフィックス
 * - 画面名称「本人確認承認申請一覧」は固定（identity / ccus 共用画面のため）
 * - 申請者・申請日時・申請種別を本文に echo、ユーザーID / 申請ID（生 UUID）は載せない
 * - 提出ファイルプレビューは載せない（admin 画面で確認）
 * - URL の直前に「ログインした状態でクリックしてください。」警告文を必ず置く
 */
export function verificationReceivedOpsEmail({
  applicantName,
  documentType,
  appliedAt,
  siteUrl,
  verificationId,
}: VerificationReceivedOpsEmailProps): { subject: string; html: string } {
  const label = TYPE_LABELS[documentType];
  const deepLink = `${siteUrl}/admin/verifications/${verificationId}`;

  return {
    subject: `【ビジ友 運営】${label}の申請がありました`,
    html: renderLayout({
      title: `${label}の申請がありました`,
      bodyContent: [
        paragraph(`${label}の申請が新規に作成されました。`),
        paragraph("「本人確認承認申請一覧」画面からご対応をお願いします。"),
        listItem("申請者", applicantName),
        listItem("申請日時", appliedAt),
        listItem("申請種別", label, { blockEnd: true }),
        paragraph(
          "申請詳細への直接リンクは下記です。ログインした状態でクリックしてください。",
        ),
        paragraph(deepLink, { last: true }),
      ].join(""),
    }),
  };
}
