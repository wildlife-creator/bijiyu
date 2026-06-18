import { ClientInviteForm } from "./invite-form";

/**
 * ADM-006/007: 発注者 管理責任者 新規作成（入力 → 確認）。
 * デザインカンプ: design-assets/screens/ADM-006.png（ADM-007 はカンプなし・確認画面）
 */
export default function AdminClientNewPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者 管理責任者 新規作成
      </h1>
      <ClientInviteForm />
    </div>
  );
}
