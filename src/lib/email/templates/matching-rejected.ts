interface MatchingRejectedEmailProps {
  applicantName: string;
  jobTitle: string;
  clientName: string;
  serviceUrl: string;
}

export function matchingRejectedEmail({
  applicantName,
  jobTitle,
  clientName,
  serviceUrl,
}: MatchingRejectedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】応募結果のお知らせ - ${jobTitle}`,
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
        <p style="margin:0 0 16px;font-size:14px;color:#1e1e1e;">${applicantName} 様</p>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          以下の案件について、発注者から見送りのご連絡がありました。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">案件名</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${jobTitle}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">発注者</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${clientName}</td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          他の案件も多数掲載されておりますので、ぜひご確認ください。
        </p>
        <p style="text-align:center;">
          <a href="${serviceUrl}/jobs" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">案件を探す</a>
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
