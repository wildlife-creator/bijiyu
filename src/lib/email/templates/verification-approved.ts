import { paragraph, renderLayout } from "@/lib/email/components";

interface VerificationApprovedEmailProps {
  recipientName: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
}

const TYPE_LABELS: Record<"identity" | "ccus", string> = {
  identity: "本人確認",
  ccus: "CCUS登録",
};

/**
 * §4.2 承認通知（既存 E-5 改修・ADM-012）。
 * M-04 準拠: CTA・UI 名指し誘導文を削除。事実通知のみ。
 */
export function verificationApprovedEmail({
  recipientName,
  documentType,
}: VerificationApprovedEmailProps): { subject: string; html: string } {
  const label = TYPE_LABELS[documentType];
  return {
    subject: `【ビジ友】${label}が承認されました`,
    html: renderLayout({
      title: `${label}が承認されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(`ご申請いただいた${label}の審査が完了し、承認されました。`, { last: true }),
      ].join(""),
    }),
  };
}
