interface SubscriptionCancelledEmailProps {
  recipientName: string;
  planName: string;
  cancelledAt: string;
  serviceUrl: string;
}

/**
 * Sent when:
 *  - the user (or auto-cancel-past-due batch) cancels their basic plan
 *  - past_due grace period expires and the subscription is auto-cancelled
 *
 * Used for both manual and automated cancellation flows.
 */
export function subscriptionCancelledEmail({
  recipientName,
  planName,
  cancelledAt,
  serviceUrl,
}: SubscriptionCancelledEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】解約が完了しました`,
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
          いつもビジ友をご利用いただきありがとうございます。<br>
          以下の内容で解約手続きが完了しました。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">解約したプラン</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${planName}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">解約日</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${cancelledAt}</td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          長らくのご利用、誠にありがとうございました。<br>
          再度ご登録いただける際は、いつでも以下のページからお手続きいただけます。
        </p>
        <p style="text-align:center;">
          <a href="${serviceUrl}/billing" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">プラン案内へ</a>
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
