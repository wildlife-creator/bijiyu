import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface EmailRecycleFailureAlertEmailProps {
  /** 発生日時 (YYYY/MM/DD HH:MM) */
  occurredAt: string;
  /** 日本語に変換済の発生のきっかけ (退会 / 担当者の削除 / 管理者による強制削除 / その他) */
  triggerLabel: string;
  /** 印付け前の `auth.users.email` (取得失敗時は「(取得不可)」) */
  targetEmail: string;
  /** 対象ユーザーの表示名 (姓 + 名 スペースなし結合、両方 NULL なら「(氏名未設定)」) */
  targetDisplayName: string;
  /** 法人組織コンテキストがあれば組織名、なければ null で行ごと省略 */
  organizationName: string | null;
}

/**
 * §9.2 使用済みメールアドレスの片付けが失敗した時のアラート (新規)。
 *
 * 発火: `applyDeletedSuffix` の `failed: api_error` / `failed: unique_violation_max_retries` /
 * `skipped: user_not_found` / `skipped: invalid_format` の各通知対象 return パスから
 * fire-and-forget 送信 (`already_suffixed` no-op は通知しない)。
 *
 * 失敗を放置すると元メアドが占有されたままになり、同人物の再登録 / 同メアドでの再招待が
 * 詰まる。検知遅延が長期化しがち (ユーザーからの問い合わせ経由で初めて気付く構造)。
 *
 * 配信先: `OPS_NOTIFICATION_EMAIL` (§9.1 と共通)。
 *
 * §9 全体方針:
 * - 件名「【ビジ友 運営】」プレフィックス
 * - §9.1 と並列構造 (opening 2 行 + 影響情報ブロック + closing 1 行)
 * - 技術用語ゼロ (`auth.user.id` / 失敗理由コード等は本文に出さない、開発担当者は
 *   `audit_logs.auth_email_recycle_failed.metadata` の `path` / `reason` / `date` を直接引ける)
 * - 【対象組織】は法人組織紐付きコンテキストのみ表示、個人プラン退会等では行ごと省略
 *
 * triggerLabel は `applyDeletedSuffix` の `options.path` から
 * `ops-alerts.ts` のヘルパー内で日本語ラベルへ変換する。
 */
export function emailRecycleFailureAlertEmail({
  occurredAt,
  triggerLabel,
  targetEmail,
  targetDisplayName,
  organizationName,
}: EmailRecycleFailureAlertEmailProps): { subject: string; html: string } {
  const userValue = `${targetEmail}(${targetDisplayName} 様)`;
  const items: string[] = [
    listItem("発生日時", occurredAt),
    listItem("発生のきっかけ", triggerLabel),
  ];
  if (organizationName) {
    items.push(listItem("対象ユーザー", userValue));
    items.push(listItem("対象組織", organizationName, { blockEnd: true }));
  } else {
    items.push(listItem("対象ユーザー", userValue, { blockEnd: true }));
  }

  return {
    subject: "【ビジ友 運営】使用済みメールアドレスの片付けが失敗しました",
    html: renderLayout({
      title: "使用済みメールアドレスの片付けが失敗しました",
      bodyContent: [
        paragraph("ユーザーが使っていたメールアドレスの片付け処理が失敗しました。", { tight: true }),
        paragraph("同じメールアドレスでの再登録や再招待ができなくなる可能性があります。"),
        ...items,
        paragraph("お手数ですが、開発担当者にご連絡ください。", { last: true }),
      ].join(""),
    }),
  };
}
