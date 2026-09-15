import type { ReactNode } from "react";

/**
 * URL 候補の抽出パターン。
 *
 * - スキームは http / https のみ（javascript: 等はそもそも一致しない）
 * - 直前が英数字のとき（例: `xhttps://`）は一致させない
 * - URL 本体は空白と `<>"` を除く ASCII 可視文字のみ。日本語の句読点・全角括弧
 *   （「。」「、」「）」等）は ASCII 外なので、そこで URL が自然に終わる
 */
const URL_CANDIDATE_PATTERN = /(?<![A-Za-z0-9])https?:\/\/[!#-;=?-~]+/gi;

/** URL の末尾に付いていても URL の一部とみなさない ASCII 記号 */
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "'", "*"]);

const CLOSING_BRACKETS: Record<string, string> = { ")": "(", "]": "[" };

function countChar(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * 文末の句読点や、対応する開き括弧が URL 内にない閉じ括弧を取り除く。
 * 例: `(https://example.com/a).` → `https://example.com/a`
 */
function trimTrailing(candidate: string): string {
  let url = candidate;
  for (;;) {
    const last = url.at(-1);
    if (last === undefined) return url;
    if (TRAILING_PUNCTUATION.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opening = CLOSING_BRACKETS[last];
    if (opening && countChar(url, opening) < countChar(url, last)) {
      url = url.slice(0, -1);
      continue;
    }
    return url;
  }
}

/** http / https で、ホスト名を持つ URL として解釈できるか */
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname !== ""
    );
  } catch {
    return false;
  }
}

/**
 * テキスト中の http / https URL だけをリンクにして、React 要素の配列で返す。
 *
 * - URL 以外の部分は文字列のまま返す（React がエスケープするため HTML は解釈されない）
 * - リンクは新しいタブで開く（`rel="noopener noreferrer"`）
 * - 長い URL で吹き出しが崩れないよう `break-all` で折り返す
 * - URL を含まないテキストは `[text]` の 1 要素で返す
 *
 * 使用箇所: メッセージスレッドの本文吹き出し（`MessageBubble`）のみ。
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
    const start = match.index;
    const url = trimTrailing(match[0]);
    if (!isSafeHttpUrl(url)) continue;

    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <a
        key={`link-${start}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary underline underline-offset-2"
      >
        {url}
      </a>,
    );
    cursor = start + url.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : [text];
}
