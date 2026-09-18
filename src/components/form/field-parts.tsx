import type { ReactNode } from "react";

/**
 * フォーム共通の小さな部品（プロフィール編集 COM-002 / 発注者情報編集 CLI-021 / 担当者追加 CLI-023 等で共用）。
 * 見た目は design-rule.md のフォーム規約に従う。
 */

/** ラベル横の「必須」バッジ。 */
export function RequiredBadge() {
  return (
    <span className="ml-2 text-body-xs font-bold text-destructive">必須</span>
  );
}

/** 1 項目（ラベル + 入力欄 + エラー）を縦に並べる枠。 */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

/** 項目ラベル。`htmlFor` で入力欄と対にする。 */
export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center text-body-sm font-bold text-foreground"
    >
      {children}
    </label>
  );
}

/** バリデーションエラーの表示。message が無ければ何も出さない。 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-body-sm text-destructive">{message}</p>;
}
