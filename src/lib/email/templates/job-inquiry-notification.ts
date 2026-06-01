// ---------------------------------------------------------------------------
// 求人へのお問い合わせ通知メール（job-inquiry / COM-013）
// ---------------------------------------------------------------------------
// 宛先発注者（対象 client = Owner）に「新しい問い合わせが届いた」ことを伝える
// 橋渡しの肝となるメール。レイアウトは scout-notification.ts のテーブル構造を踏襲
// （ヘッダー色 #920783、CTA ピル、フッター）。外部 I/O を持たないピュア関数。

interface JobInquiryNotificationEmailProps {
  recipientName: string; // 宛先発注者の表示名
  senderName: string; // フォーム入力の氏名
  senderEmail: string; // フォーム入力のメール
  topics: string[]; // 選択された項目ラベル
  content: string; // 任意の本文（未入力可）
  inboxUrl: string; // 受信箱（一覧/詳細）URL
  serviceUrl: string; // ビジ友トップ URL
}

// 送信者が入力した自由記述値を HTML に埋め込むため、最低限のエスケープを行う
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function jobInquiryNotificationEmail({
  recipientName,
  senderName,
  senderEmail,
  topics,
  content,
  inboxUrl,
  serviceUrl,
}: JobInquiryNotificationEmailProps): { subject: string; html: string } {
  const topicsText = topics.length > 0 ? topics.join("、") : "（未選択）";
  const contentText = content.trim() ? content : "（未入力）";

  return {
    subject: `【ビジ友】求人へのお問い合わせを受信しました - ${senderName}`,
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
        <p style="margin:0 0 16px;font-size:14px;color:#1e1e1e;">${escapeHtml(recipientName)} 様</p>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          ${escapeHtml(senderName)} 様より、求人へのお問い合わせが届きました。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">送信者</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${escapeHtml(senderName)}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">メールアドレス</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${escapeHtml(senderEmail)}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">お問い合わせ項目</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${escapeHtml(topicsText)}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">お問い合わせ内容</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;white-space:pre-wrap;">${escapeHtml(contentText)}</td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          以降のやり取りは、上記メールアドレスへの返信など当事者間で直接お願いいたします。
        </p>
        <p style="text-align:center;">
          <a href="${inboxUrl}" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">受信箱で確認する</a>
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
