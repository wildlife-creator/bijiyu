/**
 * 退会完了通知メール（REQ-PF-006 step 7）
 *
 * 受信者: 退会したユーザー本人
 * 送信タイミング: withdrawAction で全 DB 更新 + ban + signOut が完了した直後
 * 失敗時: 非ロールバック（security.md「メール送信失敗時の共通方針」）
 */

interface WithdrawalCompletedParams {
  recipientName: string;
  serviceUrl: string;
}

export function withdrawalCompletedEmail({
  recipientName,
  serviceUrl,
}: WithdrawalCompletedParams): { subject: string; html: string } {
  const subject = "【ビジ友】退会手続きが完了しました";
  const html = `
<!doctype html>
<html lang="ja">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; color: #333; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #6B1F8A; font-size: 20px; margin-bottom: 16px;">退会手続きが完了しました</h1>
      <p>${escapeHtml(recipientName)} 様</p>
      <p>このたびはビジ友をご利用いただき、誠にありがとうございました。</p>
      <p>退会手続きが正常に完了しました。アカウントは無効化され、ビジ友の各機能はご利用いただけなくなりました。</p>
      <p>ご利用中だった有料プランがある場合は自動で解約処理を行いました。</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="font-size: 13px; color: #666;">
        本メールは退会処理の完了通知として自動送信されています。お心当たりがない場合や、ご質問がある場合は <a href="${serviceUrl}/contact">${serviceUrl}/contact</a> までお問い合わせください。
      </p>
      <p style="font-size: 13px; color: #666;">ビジ友 運営事務局</p>
    </div>
  </body>
</html>
  `.trim();
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
