import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OrphanAuthUserAlertEmailProps {
  /** 発生日時 (YYYY/MM/DD HH:MM) */
  occurredAt: string;
  /** 対象組織名 (`client_profiles.display_name`、解決失敗時は `organization_id` UUID fallback) */
  organizationName: string;
  /** 招待先メールアドレス (フォーム入力値そのまま) */
  invitedEmail: string;
}

/**
 * §9.1 担当者追加が途中で失敗した時のアラート (既存 E-13 改修)。
 *
 * 発火: `createMemberAction` の cleanup 失敗ブロック (招待メール送信 + auth ユーザー作成は
 * 成功したが、その後の RPC 処理が失敗し、巻き戻しの auth ユーザー削除も失敗、という
 * 二重失敗ケース)。中途半端な登録データが残り、同じメールアドレスでの再招待がブロックされる状態。
 *
 * 配信先: `OPS_NOTIFICATION_EMAIL` (§9.2 / §4.4 / §7.x と共通)。
 *
 * §9 全体方針:
 * - 件名「【ビジ友 運営】」プレフィックス
 * - 本文構造: opening 2 行 (事象 + 影響) + 影響情報ブロック + closing 1 行
 * - 技術用語ゼロ (`auth.user.id` / `RPC` / `cleanup` 等は本文に出さない、運営は理解不能 +
 *   開発担当者は `audit_logs.member_create_failed_cleanup_failed` から直接取得可)
 * - 生 UUID 列挙の禁止 (運営が読めず開発担当者は audit_logs から引ける)
 * - closing「お手数ですが、開発担当者にご連絡ください。」(playbook 参照行は付けない =
 *   運営が読める対応手順無し)
 */
export function orphanAuthUserAlertEmail({
  occurredAt,
  organizationName,
  invitedEmail,
}: OrphanAuthUserAlertEmailProps): { subject: string; html: string } {
  return {
    subject: "【ビジ友 運営】担当者追加が途中で失敗しました",
    html: renderLayout({
      title: "担当者追加が途中で失敗しました",
      bodyContent: [
        paragraph("担当者の追加処理が途中で失敗しました。", { tight: true }),
        paragraph("同じメールアドレスでの再招待ができなくなる可能性があります。"),
        listItem("発生日時", occurredAt),
        listItem("対象組織", organizationName),
        listItem("招待先メールアドレス", invitedEmail, { blockEnd: true }),
        paragraph("お手数ですが、開発担当者にご連絡ください。", { last: true }),
      ].join(""),
    }),
  };
}
