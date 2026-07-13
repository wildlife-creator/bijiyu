import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 回帰防止（見張り）テスト。
 *
 * メール送信を「投げっぱなし（await しない fire-and-forget）」で呼ぶと、Vercel は
 * Server Action の応答（return / redirect）直後に実行コンテキストを凍結するため、
 * 送信が途中で破棄され、メールがサイレントに届かないことがある
 * （2026-07-13 ログアウト状態のお問い合わせで送信者・運営ともメール未達の実例。
 *   DB には保存されるがメールだけ落ちる。ローカルはファイル書き出しのため再現しない）。
 *
 * この形（`void sendXxxEmail(...)` / `void notifyXxxAlert(...)`）が再び混入したら
 * 検知するため、src 配下を静的走査して 0 件であることを保証する。
 * 正しい形: `await sendEmail(...).catch(...)` /
 *          `await Promise.all(recipients.map((r) => sendEmail(...).catch(...)))`。
 */

const SRC_DIR = join(process.cwd(), "src");

// void で投げっぱなしにされた「メール送信系」呼び出しを検出する。
// sendEmail / sendVerificationEmails / sendMessageNotification /
// sendVideoPublishedEmails / sendXxxAlert / notifyXxxAlert 等の wrapper を広くカバー。
const FIRE_AND_FORGET_EMAIL =
  /\bvoid\s+(send|notify)\w*(Email|Emails|Alert|Notification)\w*\s*\(/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("メール送信の fire-and-forget 禁止（回帰防止）", () => {
  it("src 配下に `void sendXxxEmail(...)` 形式の投げっぱなし送信が無い", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (FIRE_AND_FORGET_EMAIL.test(line)) {
          const rel = file.replace(`${process.cwd()}/`, "");
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `メール送信は await で完了を待つこと（下記を await 化する）:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
