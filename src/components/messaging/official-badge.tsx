/**
 * 「ビジ友公式」バッジ。管理運営アカウント（users.is_hidden = true）のメッセージ相手に付ける。
 * 判定のルールは src/lib/messaging/official-account.ts を参照（名前・画像では判定しない）。
 * 表示場所はメッセージ一覧（ThreadListItem）とメッセージ画面の上部（MessageHeader）の 2 か所。
 */
export function OfficialBadge() {
  return (
    <span className="flex flex-shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
      <img src="/images/icons/icon-tag.png" alt="" className="size-3" />
      ビジ友公式
    </span>
  );
}
