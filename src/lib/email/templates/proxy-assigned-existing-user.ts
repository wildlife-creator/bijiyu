interface ProxyAssignedExistingUserEmailProps {
  /** 受信者 (= 設定された ビジ友運営スタッフ) の表示名 */
  recipientName: string;
  /** 設定先の法人組織名 (client_profiles.display_name 解決済み) */
  organizationName: string;
  /** 設定操作者の表示名 (actor の姓名スペースなし結合) */
  actorName: string;
  /** 設定日時 (yyyy/MM/dd HH:mm 形式) */
  assignedAt: string;
  /** ログイン画面の URL (パスワード設定リンクではない) */
  signInUrl: string;
}

/**
 * 既存ユーザーに代理アカウント設定が行われた際の本人宛通知メール。
 *
 * proxy-account-multi-org-support Task 6.3 / notifications spec §5.6.C 暫定実装。
 *
 * 発火条件:
 *   - createMemberAction の既存ユーザー再利用パス成功時
 *     (= 入力 email が既存代理スタッフと一致し、別組織に代理として追加された瞬間)
 *
 * 配信先: 設定された本人 1 名 (= ビジ友運営スタッフ)
 *
 * 件名: 【ビジ友 運営】「{organizationName}」の代理アカウントとして設定されました
 *
 * 設計判断:
 *   - パスワード設定リンクは含めない (既存ユーザーは既にパスワード設定済み)
 *   - サインインリンクを CTA として配置 (タスク 6.3 要件)
 *   - 文面は notifications spec §5.6.C 確定形に準拠した暫定版
 *     最終的に notifications spec §5.6 完了時に他の代理設定通知 (招待時 ON /
 *     後付け ON) と統合される可能性あり (テンプレ統一の方針)
 */
export function proxyAssignedExistingUserEmail({
  recipientName,
  organizationName,
  actorName,
  assignedAt,
  signInUrl,
}: ProxyAssignedExistingUserEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友 運営】「${organizationName}」の代理アカウントとして設定されました`,
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
          あなたが下記の法人組織の代理アカウントとして設定されました。
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          <tr><td style="padding:4px 0;">【法人名】 ${organizationName}</td></tr>
          <tr><td style="padding:4px 0;">【設定操作者】 ${actorName}</td></tr>
          <tr><td style="padding:4px 0;">【設定日時】 ${assignedAt}</td></tr>
        </table>
        <p style="margin:0 0 12px;">
          このアカウントが ${organizationName} のスタッフとしてメッセージ送信などを行えるようになりました。
        </p>
        <p style="margin:0 0 16px;">
          代理として送信したメッセージには、発注者側の画面でのみ「代理」マークが付きます。受注者側には表示されません。
        </p>
        <p style="margin:24px 0;text-align:center;">
          <a href="${signInUrl}"
             style="display:inline-block;padding:12px 28px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">
            ビジ友にログイン
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
