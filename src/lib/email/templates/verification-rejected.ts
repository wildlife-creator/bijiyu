import { paragraph, renderLayout } from "@/lib/email/components";

interface VerificationRejectedEmailProps {
  recipientName: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
  rejectionReason: string;
}

const TYPE_LABELS: Record<"identity" | "ccus", string> = {
  identity: "本人確認",
  ccus: "CCUS登録",
};

/**
 * §4.3 否認通知（既存 E-6 改修・ADM-012）。
 * 否認理由は本文に維持（受注者が何を直すべきか分かる必要があるため必須）。
 * M-04 準拠: 「マイページから書類の再提出を」「書類を再提出する」CTA 等を削除。
 */
export function verificationRejectedEmail({
  recipientName,
  documentType,
  rejectionReason,
}: VerificationRejectedEmailProps): { subject: string; html: string } {
  const label = TYPE_LABELS[documentType];
  return {
    subject: `【ビジ友】${label}の書類をご確認ください（再提出のお願い）`,
    html: renderLayout({
      title: `${label}の書類をご確認ください`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`ご申請いただいた${label}について、審査の結果、今回は承認を見送らせていただきました。`),
        paragraph("【否認理由】", { tight: true }),
        paragraph(rejectionReason),
        paragraph("ご確認の上、改めてご提出をお願いします。", { last: true }),
      ].join(""),
    }),
  };
}
