interface VerificationApprovedEmailProps {
  recipientName: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
  serviceUrl: string;
}

const TYPE_LABELS: Record<"identity" | "ccus", string> = {
  identity: "本人確認",
  ccus: "CCUS登録",
};

/**
 * ADM-012: 承認通知メール（本人確認 / CCUS 共用テンプレ）。
 */
export function verificationApprovedEmail({
  recipientName,
  documentType,
  serviceUrl,
}: VerificationApprovedEmailProps): { subject: string; html: string } {
  const label = TYPE_LABELS[documentType];
  return {
    subject: `【ビジ友】${label}が承認されました`,
    html: `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Zen Kaku Gothic New',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
    <tr>
      <td style="padding:24px;text-align:center;background:#920783;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;">ビジ友</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 24px;">
        <p style="margin:0 0 16px;font-size:14px;color:#1e1e1e;">${recipientName} 様</p>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          ご申請いただいた${label}の審査が完了し、承認されました。
        </p>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          ビジ友にログインしてご確認ください。
        </p>
        <p style="text-align:center;">
          <a href="${serviceUrl}/mypage" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">マイページを確認する</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;text-align:center;background:#f4f4f4;font-size:12px;color:#9e9e9e;">
        <p style="margin:0 0 8px;">このメールはビジ友からの自動送信です。</p>
        <p style="margin:0;"><a href="${serviceUrl}" style="color:#601986;">ビジ友</a></p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  };
}
