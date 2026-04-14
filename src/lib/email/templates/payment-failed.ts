interface PaymentFailedEmailProps {
  recipientName: string;
  planName: string;
  nextRetryDate: string;
  serviceUrl: string;
}

/**
 * Sent when Stripe fires invoice.payment_failed for a subscription.
 * Tells the user the next retry date and links to the billing page so
 * they can update their payment method via the Customer Portal.
 */
export function paymentFailedEmail({
  recipientName,
  planName,
  nextRetryDate,
  serviceUrl,
}: PaymentFailedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】お支払いが確認できません`,
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
          ご登録いただいているお支払い方法での決済が確認できませんでした。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">プラン</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${planName}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">次回リトライ予定日</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${nextRetryDate}</td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          7 日以内にお支払い方法を更新いただけない場合、自動的にプランが解約され、有料機能がご利用いただけなくなります。
        </p>
        <p style="text-align:center;">
          <a href="${serviceUrl}/billing" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">お支払い方法を更新する</a>
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
