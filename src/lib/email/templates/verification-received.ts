import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VerificationReceivedEmailProps {
  /** 申請者の表示名（姓 + 様）。`getUserDisplayName({lastName,firstName})` か姓のみ。 */
  recipientName: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
  /** YYYY/MM/DD HH:MM（`identity_verifications.created_at` を整形） */
  appliedAt: string;
}

const TYPE_LABELS: Record<"identity" | "ccus", string> = {
  identity: "本人確認",
  ccus: "CCUS登録",
};

/**
 * §4.1 本人確認・CCUS 申請受理控え（受注者本人宛、新規）。
 *
 * `submitIdentityAction` / `submitCcusAction` で `identity_verifications` INSERT
 * 成功後に発火。fire-and-forget で送信し、失敗してもロールバックしない。
 *
 * - 受信者は申請者本人 1 名（個人情報を扱う認証手続きなので組織 broadcast 対象外）
 * - CTA・「マイページで確認できます」等の誘導文を入れない（M-04 違反）
 * - 提出ファイル名 / 審査期間の目安は載せない
 * - closing は「審査の結果は改めてお知らせします。」（M-01 チャンネル中立）
 */
export function verificationReceivedEmail({
  recipientName,
  documentType,
  appliedAt,
}: VerificationReceivedEmailProps): { subject: string; html: string } {
  const label = TYPE_LABELS[documentType];

  return {
    subject: `【ビジ友】${label}の申請を受け付けました`,
    html: renderLayout({
      title: `${label}の申請を受け付けました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`${label}の申請を受け付けました。`),
        listItem("申請日時", appliedAt),
        listItem("申請種別", label, { blockEnd: true }),
        paragraph("審査の結果は改めてお知らせします。", { last: true }),
      ].join(""),
    }),
  };
}
