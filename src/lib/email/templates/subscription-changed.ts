interface SubscriptionChangedEmailProps {
  recipientName: string;
  oldPlanName: string;
  newPlanName: string;
  /** 適用開始日のラベル（即時アップグレードなら「ただ今」、予約なら「YYYY/MM/DD」など） */
  effectiveDate: string;
  serviceUrl: string;
}

/**
 * Sent when:
 *  - upgrade is committed immediately (Webhook customer.subscription.updated, plan_type changed)
 *  - downgrade reservation is created (schedule_id null → non-null)
 *  - cancel reservation is created (cancel_at_period_end false → true)
 *  - reservation is cancelled
 *
 * The single template covers all of these by parameterising the effectiveDate.
 */
export function subscriptionChangedEmail({
  recipientName,
  oldPlanName,
  newPlanName,
  effectiveDate,
  serviceUrl,
}: SubscriptionChangedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】プラン変更を承りました`,
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
          以下の内容でプラン変更を承りました。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">変更前のプラン</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${oldPlanName}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">変更後のプラン</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${newPlanName}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">適用開始日</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${effectiveDate}</td></tr>
        </table>
        <p style="text-align:center;">
          <a href="${serviceUrl}/billing" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">プラン状況を確認する</a>
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
