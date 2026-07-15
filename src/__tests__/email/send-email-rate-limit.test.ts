import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendEmail のレート制限対策（直列化 + 429 リトライ）の回帰テスト。
 *
 * 2026-07-15 staging 実例: 組織メンバー 3 名への broadcast（Promise.all 並列送信）で
 * Resend の既定レート 2 req/秒を超え、3 通目（代理スタッフ宛）だけが
 * rate_limit_exceeded で黙って落ちた。
 */

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

const RATE_LIMIT_ERROR = {
  name: "rate_limit_exceeded",
  message: "Too many requests. You can only make 2 requests per second.",
};

async function importSendEmail() {
  const mod = await import("@/lib/email/send-email");
  return mod.sendEmail;
}

describe("sendEmail レート制限対策", () => {
  beforeEach(() => {
    vi.resetModules(); // 送信キューをテストごとに初期化する
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rate_limit_exceeded は待って再試行し、最終的に成功を返す", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: RATE_LIMIT_ERROR })
      .mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    const sendEmail = await importSendEmail();
    const promise = sendEmail({
      to: "proxy@example.com",
      subject: "件名",
      html: "<p>本文</p>",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("並列に 3 通投げても直列化されて全件送信される（broadcast の取りこぼし防止）", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_x" }, error: null });

    const sendEmail = await importSendEmail();
    const promise = Promise.all(
      ["owner", "staff", "proxy"].map((name) =>
        sendEmail({
          to: `${name}@example.com`,
          subject: "件名",
          html: "<p>本文</p>",
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const results = await promise;

    expect(results.every((r) => r.success)).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend.mock.calls.map(([p]) => p.to)).toEqual([
      "owner@example.com",
      "staff@example.com",
      "proxy@example.com",
    ]);
  });

  it("リトライ上限まで 429 が続いた場合は success: false を返す", async () => {
    mockSend.mockResolvedValue({ data: null, error: RATE_LIMIT_ERROR });

    const sendEmail = await importSendEmail();
    const promise = sendEmail({
      to: "proxy@example.com",
      subject: "件名",
      html: "<p>本文</p>",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("レート制限以外のエラーは再試行せずそのまま失敗を返す", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });

    const sendEmail = await importSendEmail();
    const promise = sendEmail({
      to: "broken@example.com",
      subject: "件名",
      html: "<p>本文</p>",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
