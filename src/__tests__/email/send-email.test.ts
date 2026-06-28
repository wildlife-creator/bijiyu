import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendEmail の dev fallback (RESEND_API_KEY 未設定パス) で
 * `{ts}-{to}.html` と `{ts}-{to}.json` の 2 ファイルが書き出されることを検証する。
 *
 * json sidecar は今後の通知メール runtime 監査で件名 prefix
 * (例「【ビジ友 運営】」) が壊れた時に検知するための土台
 * (`.kiro/specs/notifications/email-decisions-wip.md` §5.7 / 2026-06-28 監査 wrap-up)。
 *
 * 実 IO を避けるため `node:fs/promises` を vi.mock で差し替え、
 * 動的 import (`await import("node:fs/promises")`) でも intercept されることを利用。
 */

const { mkdirMock, writeFileMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(async () => undefined),
  writeFileMock: vi.fn(async () => undefined),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

import { sendEmail } from "@/lib/email/send-email";

beforeEach(() => {
  mkdirMock.mockClear();
  writeFileMock.mockClear();
  // dev fallback パスを確実に通すため API キーを除去
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
});

describe("sendEmail dev fallback: sidecar JSON 整備", () => {
  it("html + json の 2 ファイルが書き出される (同 prefix)", async () => {
    const result = await sendEmail({
      to: "alice@test.local",
      subject: "【ビジ友】テスト件名",
      html: "<p>hello</p>",
    });

    expect(result.success).toBe(true);

    // mkdir 1 回 + writeFile 2 回 (html → json の順)
    expect(mkdirMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(2);

    const calls = writeFileMock.mock.calls;
    const htmlCall = calls[0] as unknown as [string, string, string];
    const jsonCall = calls[1] as unknown as [string, string, string];

    // 1 つ目は .html、2 つ目は .json
    expect(htmlCall[0]).toMatch(
      /\/tmp\/bijiyu-dev-mail\/.+-alice@test\.local\.html$/,
    );
    expect(jsonCall[0]).toMatch(
      /\/tmp\/bijiyu-dev-mail\/.+-alice@test\.local\.json$/,
    );

    // 同 prefix (timestamp 部分が一致): ファイル名から拡張子を剥がした文字列が等しい
    const htmlBase = htmlCall[0].replace(/\.html$/, "");
    const jsonBase = jsonCall[0].replace(/\.json$/, "");
    expect(htmlBase).toBe(jsonBase);

    // html 本文がそのまま書かれている
    expect(htmlCall[1]).toBe("<p>hello</p>");
  });

  it("sidecar JSON は { to, subject, sentAt } の schema を満たす", async () => {
    await sendEmail({
      to: "bob+tag@test.local",
      subject: "【ビジ友 運営】重要通知",
      html: "<p>body</p>",
    });

    const jsonCall = writeFileMock.mock.calls[1] as unknown as [
      string,
      string,
      string,
    ];
    const parsed = JSON.parse(jsonCall[1]) as Record<string, unknown>;

    expect(parsed.to).toBe("bob+tag@test.local");
    expect(parsed.subject).toBe("【ビジ友 運営】重要通知");
    // sentAt は ISO 8601 UTC 文字列
    expect(typeof parsed.sentAt).toBe("string");
    expect(parsed.sentAt as string).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    // 余計なキーが混ざっていないこと (schema lock)
    expect(Object.keys(parsed).sort()).toEqual(["sentAt", "subject", "to"]);
  });

  it("ファイル名の safeTo 変換: `+` / 記号は `_` に置換される", async () => {
    await sendEmail({
      to: "user+spaces and!chars@test.local",
      subject: "x",
      html: "x",
    });

    const htmlCall = writeFileMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    // `+`, ` `, `!` が `_` に置換される (英数 . @ _ - 以外)
    expect(htmlCall[0]).toContain("user_spaces_and_chars@test.local.html");
  });

  it("writeFile が throw しても sendEmail 自体は success: true で返る", async () => {
    writeFileMock.mockRejectedValueOnce(new Error("disk full"));

    const result = await sendEmail({
      to: "alice@test.local",
      subject: "x",
      html: "x",
    });

    expect(result.success).toBe(true);
  });
});
