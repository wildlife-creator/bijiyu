/**
 * 管理運営アカウント（users.is_hidden、P5）を運営が見分けるためのバッジ。
 * 管理画面（ADM-003 / ADM-004 / ADM-008 / ADM-009）でのみ使う。
 */
export function OpsAccountBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full bg-secondary/10 px-2 py-0.5 text-body-xs font-bold text-secondary ${className}`}
    >
      管理運営
    </span>
  );
}
