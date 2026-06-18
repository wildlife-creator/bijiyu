import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache は本テストでは透過させる（pure pass-through）。
// 本物の Next.js キャッシュ層を巻き込まないことで、各ケースが独立した fetch 呼び出しを検証できる。
vi.mock("next/cache", () => ({
  unstable_cache: <Args extends unknown[], R>(fn: (...args: Args) => R) => fn,
}));

import { getVideoThumbnail } from "@/lib/video-embed/fetch-thumbnail";

const VALID_TIKTOK_URL =
  "https://www.tiktok.com/@bijiyu/video/7234567890123456789";
const VALID_THUMB_URL =
  "https://p16-sign-va.tiktokcdn.com/obj/example?x-expires=1234567890";

describe("getVideoThumbnail — TikTok oEmbed 経由", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("正常系: thumbnail_url を抽出して返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          thumbnail_url: VALID_THUMB_URL,
          author_name: "bijiyu",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBe(VALID_THUMB_URL);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[0]).toContain(
      "https://www.tiktok.com/oembed?url=",
    );
    expect(fetchSpy.mock.calls[0]?.[0]).toContain(
      encodeURIComponent(VALID_TIKTOK_URL),
    );
  });

  it("404 等の非 200 応答は null", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });

  it("ネットワーク例外（fetch reject）は null", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("network down"));
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });

  it("JSON 不正（パース不能）は null", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("not json at all", { status: 200 }),
    );
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });

  it("thumbnail_url キー欠落は null", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ author_name: "bijiyu" }), { status: 200 }),
    );
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });

  it("thumbnail_url が空文字は null", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ thumbnail_url: "   " }), { status: 200 }),
    );
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });

  it("thumbnail_url が string 以外は null", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ thumbnail_url: 42 }), { status: 200 }),
    );
    const result = await getVideoThumbnail(VALID_TIKTOK_URL);
    expect(result).toBeNull();
  });
});

describe("getVideoThumbnail — 未対応入力は fetch を呼ばずに null", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("null 入力は null", async () => {
    const result = await getVideoThumbnail(null);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("undefined 入力は null", async () => {
    const result = await getVideoThumbnail(undefined);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("空文字は null", async () => {
    const result = await getVideoThumbnail("");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("空白のみは null", async () => {
    const result = await getVideoThumbnail("   ");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("URL として解析不能な文字列は null", async () => {
    const result = await getVideoThumbnail("not a url");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("対応プラットフォーム外（YouTube 等）は null", async () => {
    const result = await getVideoThumbnail(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("host 偽装（evil.com/www.tiktok.com/...）は null", async () => {
    const result = await getVideoThumbnail(
      "https://evil.com/www.tiktok.com/@x/video/123",
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
