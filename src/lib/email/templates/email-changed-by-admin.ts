interface EmailChangedByAdminEmailProps {
  recipientName: string;
  oldEmail: string;
  newEmail: string;
  organizationName: string;
  serviceUrl: string;
}

/**
 * 管理者強制メール変更の通知メール（旧メール・新メール両方へ送信）。
 * Task 14.3: CLI-024 管理者変更フロー（パターン B）からトリガーされる。
 */
export function emailChangedByAdminEmail({
  recipientName,
  oldEmail,
  newEmail,
  organizationName,
  serviceUrl,
}: EmailChangedByAdminEmailProps): { subject: string; html: string } {
  return {
    subject: "【ビジ友】メールアドレスが変更されました",
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
        <p style="margin:0 0 16px;">${recipientName} 様</p>
        <p style="margin:0 0 16px;">
          組織「${organizationName}」の管理者によって、あなたのアカウントの
          メールアドレスが変更されました。
        </p>
        <p style="margin:0 0 8px;">旧: ${oldEmail}</p>
        <p style="margin:0 0 16px;">新: ${newEmail}</p>
        <p style="margin:0 0 16px;">
          今後のログインは新しいメールアドレスで行ってください。
          身に覚えがない場合は、お手数ですが運営までご連絡ください。
        </p>
        <p style="margin:24px 0;text-align:center;">
          <a href="${serviceUrl}/contact"
             style="display:inline-block;padding:12px 28px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">
            お問い合わせ
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;background:#f4f4f4;color:#888;font-size:12px;">
        このメールは ビジ友 から自動送信されています。
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  };
}
