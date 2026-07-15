import React from "react";

/** `**強調**` と `[ラベル](リンク先)` のいずれかにマッチする。 */
const INLINE_MARKUP = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

interface LegalTextProps {
  children: string;
}

/**
 * 法務ページの本文 1 行を描画する。
 *
 * 本文は `docs/legal/*.md` から一字も変えずに写した文字列をそのまま保持したいので、
 * 強調とリンクだけは Markdown の記法を残しておき、描画時にここで解釈する。
 * 事前に JSX へ分解してしまうと md との差分検証（legal-content.test.ts）が
 * 効かなくなるため、この形を崩さないこと。
 */
export function LegalText({ children }: LegalTextProps) {
  const nodes: React.ReactNode[] = [];
  const pattern = new RegExp(INLINE_MARKUP.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(children)) !== null) {
    if (match.index > cursor) {
      nodes.push(children.slice(cursor, match.index));
    }

    const [matched, emphasis, linkLabel, linkHref] = match;

    if (emphasis !== undefined) {
      nodes.push(
        <strong key={match.index} className="font-bold">
          {emphasis}
        </strong>,
      );
    } else if (linkLabel !== undefined && linkHref !== undefined) {
      nodes.push(
        <a
          key={match.index}
          href={linkHref}
          className="text-primary underline underline-offset-2"
        >
          {linkLabel}
        </a>,
      );
    }

    cursor = match.index + matched.length;
  }

  if (cursor < children.length) {
    nodes.push(children.slice(cursor));
  }

  return <>{nodes}</>;
}
