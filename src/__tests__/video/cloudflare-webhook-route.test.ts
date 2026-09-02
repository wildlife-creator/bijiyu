import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildStreamWebhookSignature } from "@/lib/cloudflare/stream";

/**
 * /api/webhooks/cloudflare-stream Route Handler の統合テスト（P4）。
 * 署名検証は本物（HMAC）を通し、DB 更新（markVideoReady）だけをモックする。
 */

const markVideoReadyMock = vi.fn();
vi.mock("@/lib/videos/mark-ready", () => ({
  markVideoReady: (...args: unknown[]) => markVideoReadyMock(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ tag: "admin" }),
}));

const { POST } = await import("@/app/api/webhooks/cloudflare-stream/route");

const SECRET = "whsec_cf_test";
const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: string, signature?: string | null): Request {
  const headers = new Headers({ host: "staging.bijiyuu.net", "x-forwarded-proto": "https" });
  if (signature) headers.set("webhook-signature", signature);
  return new Request("https://staging.bijiyuu.net/api/webhooks/cloudflare-stream", {
    method: "POST",
    headers,
    body,
  });
}

function signed(body: string): string {
  return buildStreamWebhookSignature({
    rawBody: body,
    secret: SECRET,
    timeSeconds: Math.floor(Date.now() / 1000),
  });
}

beforeEach(() => {
  process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
  markVideoReadyMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/cloudflare-stream", () => {
  it("secret 未設定なら 500", async () => {
    delete process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}", "time=1,sig1=x"));
    expect(res.status).toBe(500);
  });

  it("署名ヘッダが無ければ 400", async () => {
    const res = await POST(makeRequest('{"uid":"u"}', null));
    expect(res.status).toBe(400);
    expect(markVideoReadyMock).not.toHaveBeenCalled();
  });

  it("署名が不正なら 400", async () => {
    const body = '{"uid":"u","readyToStream":true}';
    const res = await POST(makeRequest(body, `time=${Math.floor(Date.now() / 1000)},sig1=deadbeef`));
    expect(res.status).toBe(400);
    expect(markVideoReadyMock).not.toHaveBeenCalled();
  });

  it("readyToStream=true なら markVideoReady を uid で呼び 200", async () => {
    markVideoReadyMock.mockResolvedValueOnce({
      outcome: "marked_ready",
      videoId: "v-1",
      emailSent: true,
    });
    const body = JSON.stringify({
      uid: "uid_ready",
      readyToStream: true,
      status: { state: "ready" },
    });
    const res = await POST(makeRequest(body, signed(body)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      received: true,
      outcome: "marked_ready",
    });
    expect(markVideoReadyMock).toHaveBeenCalledWith(
      { tag: "admin" },
      { cloudflareUid: "uid_ready", siteUrl: "https://staging.bijiyuu.net" },
    );
  });

  it("readyToStream=false（処理中・エラー）は 200 で skip", async () => {
    const body = JSON.stringify({
      uid: "uid_err",
      readyToStream: false,
      status: { state: "error", errorReasonCode: "ERR_X", errorReasonText: "bad" },
    });
    const res = await POST(makeRequest(body, signed(body)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, skipped: "not_ready" });
    expect(markVideoReadyMock).not.toHaveBeenCalled();
  });

  it("uid が無い / JSON 不正は 200 で skip", async () => {
    const body1 = '{"readyToStream":true}';
    const res1 = await POST(makeRequest(body1, signed(body1)));
    await expect(res1.json()).resolves.toEqual({ received: true, skipped: "missing_uid" });
    const body2 = "not json";
    const res2 = await POST(makeRequest(body2, signed(body2)));
    await expect(res2.json()).resolves.toEqual({ received: true, skipped: "invalid_json" });
  });

  it("DB 更新が失敗しても 200（運営が「状態を確認」で復旧）", async () => {
    markVideoReadyMock.mockRejectedValueOnce(new Error("db down"));
    const body = JSON.stringify({ uid: "uid_x", readyToStream: true });
    const res = await POST(makeRequest(body, signed(body)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, outcome: "failed" });
  });
});
