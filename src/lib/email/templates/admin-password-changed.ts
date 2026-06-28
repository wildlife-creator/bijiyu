import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface AdminPasswordChangedEmailProps {
  /** 受信者の表示名 (admin 本人の姓 + 名 スペースなし、空なら「ビジ友 管理者」フォールバック) */
  recipientName: string;
  /** 変更日時 (YYYY/MM/DD HH:MM) */
  changedAt: string;
}

/**
 * §8.6 admin PW 変更完了通知 (新規)。
 *
 * 発火: `changeAdminPasswordAction` の `auth.updateUser({ password })` 成功直後、
 * `writeAuditLog` の next 行で fire-and-forget 送信。
 *
 * 目的: admin session hijack の早期検知 (Google / AWS / GitHub 等のベストプラクティス)。
 *
 * 件名「【ビジ友 運営】」プレフィックス (M-07 適用、受信者はビジ友運営社員)。
 *
 * 設計:
 * - closing なし (事実通知のみ、§1.6.C 発注確定控えと同パターン)。
 *   admin は audit_log で能動確認可能
 * - 外部お問い合わせ窓口リンクなし (受信者はビジ友運営社員、`/contact` は
 *   外部ユーザー向けで構造的に不適切。社内のセキュリティ連絡経路で対応)
 * - 新パスワード / 旧パスワードの内容は載せない (セキュリティ)
 * - admin 名前 fallback: admin user は `complete_registration` を経由しないため
 *   `last_name + first_name` が空のケースあり。空なら「ビジ友 管理者 様」表記
 *
 * §5.8.A (一般ユーザー向け PW リセット完了通知) との並行運用:
 *   - `/reset-password` 経由 (申請型) → §5.8 + §5.8.A (全ユーザー共通、admin も同じ文面)
 *   - `/admin/password` (ADM-015、即変更型) → §8.6 (admin 専用)
 */
export function adminPasswordChangedEmail({
  recipientName,
  changedAt,
}: AdminPasswordChangedEmailProps): { subject: string; html: string } {
  return {
    subject: "【ビジ友 運営】管理者アカウントのパスワードを変更しました",
    html: renderLayout({
      title: "管理者アカウントのパスワードを変更しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("管理者アカウントのパスワードを変更しました。"),
        listItem("変更日時", changedAt, { last: true }),
      ].join(""),
    }),
  };
}
