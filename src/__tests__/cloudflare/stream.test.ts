import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CloudflareStreamError,
  buildStreamWebhookSignature,
  createDirectUpload,
  deleteStreamVideo,
  getCloudflareStreamConfig,
  getStreamVideo,
  isCloudflareStreamConfigured,
  verifyStreamWebhookSignature,
} from "@/lib/cloudflare/stream";

/**
 * Cloudflare Stream 連携（P4）。実通信はせず fetch をモックする。
 */

const CONFIG = { accountId: "acc_123", apiToken: "tok_secret" };
const ORIGINAL_ENV = { ...process.env };

describe("getCloudflareStreamConfig", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("両方の環境変数が揃っていれば設定を返す", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = " acc ";
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "tok";
    expect(getCloudflareStreamConfig()).toEqual({
      accountId: "acc",
      apiToken: "tok",
    });
    expect(isCloudflareStreamConfigured()).toBe(true);
  });

  it("片方でも欠けていれば null（URL 登録のみで動作する graceful degradation）", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    delete process.env.CLOUDFLARE_STREAM_API_TOKEN;
    expect(getCloudflareStreamConfig()).toBeNull();
    expect(isCloudflareStreamConfigured()).toBe(false);
  });
});

describe("verifyStreamWebhookSignature", () => {
  const secret = "whsec_test";
  const body = '{"uid":"abc","readyToStream":true}';
  const now = 1_700_000_000;

  it("正しい署名は true", () => {
    const header = buildStreamWebhookSignature({
      rawBody: body,
      secret,
      timeSeconds: now,
    });
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        secret,
        nowSeconds: now + 10,
      }),
    ).toBe(true);
  });

  it("本文が改ざんされていれば false", () => {
    const header = buildStreamWebhookSignature({
      rawBody: body,
      secret,
      timeSeconds: now,
    });
    expect(
      verifyStreamWebhookSignature({
        rawBody: '{"uid":"abc","readyToStream":false}',
        signatureHeader: header,
        secret,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("別の secret で作った署名は false", () => {
    const header = buildStreamWebhookSignature({
      rawBody: body,
      secret: "other",
      timeSeconds: now,
    });
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        secret,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("time が許容範囲（5 分）を超えていれば false（リプレイ対策）", () => {
    const header = buildStreamWebhookSignature({
      rawBody: body,
      secret,
      timeSeconds: now,
    });
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        secret,
        nowSeconds: now + 301,
      }),
    ).toBe(false);
  });

  it("ヘッダ欠落・形式不正は false", () => {
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: null,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: "sig1=deadbeef",
        secret,
      }),
    ).toBe(false);
    expect(
      verifyStreamWebhookSignature({
        rawBody: body,
        signatureHeader: "time=abc,sig1=deadbeef",
        secret,
      }),
    ).toBe(false);
  });
});

describe("REST 呼び出し（fetch モック）", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("createDirectUpload: direct_upload に POST し uploadURL / uid を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: { uploadURL: "https://upload.example/abc", uid: "uid_1" },
      }),
    );
    const result = await createDirectUpload(CONFIG, {
      maxDurationSeconds: 300,
      meta: { userId: "u1" },
    });
    expect(result).toEqual({ uploadURL: "https://upload.example/abc", uid: "uid_1" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc_123/stream/direct_upload",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_secret",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      maxDurationSeconds: 300,
      meta: { userId: "u1" },
    });
  });

  it("createDirectUpload: API がエラーを返したら CloudflareStreamError", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
        403,
      ),
    );
    await expect(
      createDirectUpload(CONFIG, { maxDurationSeconds: 300 }),
    ).rejects.toBeInstanceOf(CloudflareStreamError);
  });

  it("createDirectUpload: ネットワーク失敗も CloudflareStreamError に包む", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      createDirectUpload(CONFIG, { maxDurationSeconds: 300 }),
    ).rejects.toMatchObject({ name: "CloudflareStreamError", status: null });
  });

  it("getStreamVideo: readyToStream と state を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: {
          uid: "uid_1",
          readyToStream: false,
          status: { state: "inprogress" },
        },
      }),
    );
    const details = await getStreamVideo(CONFIG, "uid_1");
    expect(details).toEqual({
      uid: "uid_1",
      readyToStream: false,
      state: "inprogress",
      errorReasonText: null,
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc_123/stream/uid_1",
    );
    expect(init.method).toBe("GET");
  });

  it("deleteStreamVideo: 200 は成功、404 は削除済みとみなして成功", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(deleteStreamVideo(CONFIG, "uid_1")).resolves.toBeUndefined();
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteStreamVideo(CONFIG, "uid_1")).resolves.toBeUndefined();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });

  it("deleteStreamVideo: 500 は CloudflareStreamError", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(deleteStreamVideo(CONFIG, "uid_1")).rejects.toMatchObject({
      status: 500,
    });
  });
});
