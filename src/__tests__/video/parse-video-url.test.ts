import { describe, expect, it } from "vitest";

import { parseVideoUrl } from "@/lib/video-embed";

describe("parseVideoUrl — TikTok 標準閲覧 URL", () => {
  it("www あり標準 URL から id を抽出し player embedUrl を構築する", () => {
    const result = parseVideoUrl(
      "https://www.tiktok.com/@bijiyu_official/video/7234567890123456789",
    );
    expect(result).toEqual({
      platform: "tiktok",
      id: "7234567890123456789",
      aspect: "9/16",
      embedUrl: "https://www.tiktok.com/player/v1/7234567890123456789",
    });
  });

  it("www なし標準 URL も通過する", () => {
    const result = parseVideoUrl(
      "https://tiktok.com/@user/video/1234567890",
    );
    expect(result?.platform).toBe("tiktok");
    expect(result?.id).toBe("1234567890");
  });

  it("末尾クエリ付き URL でも id だけを抽出する", () => {
    const result = parseVideoUrl(
      "https://www.tiktok.com/@user/video/7234567890123456789?is_from_webapp=1&sender_device=pc",
    );
    expect(result?.id).toBe("7234567890123456789");
    expect(result?.embedUrl).toBe(
      "https://www.tiktok.com/player/v1/7234567890123456789",
    );
  });
});

describe("parseVideoUrl — 非対応・不正入力は null", () => {
  it("空文字は null", () => {
    expect(parseVideoUrl("")).toBeNull();
  });

  it("空白のみは null", () => {
    expect(parseVideoUrl("   ")).toBeNull();
  });

  it("URL として解析不能な文字列は null", () => {
    expect(parseVideoUrl("not a url")).toBeNull();
  });

  it("短縮 URL (vt.tiktok.com) は非対応で null", () => {
    expect(parseVideoUrl("https://vt.tiktok.com/ZSabc123/")).toBeNull();
  });

  it("共有 URL (tiktok.com/t/) は非対応で null", () => {
    expect(parseVideoUrl("https://www.tiktok.com/t/ZSabc123/")).toBeNull();
  });

  it("host 偽装 (evil.com に tiktok.com を埋め込む) は null", () => {
    expect(
      parseVideoUrl("https://evil.com/www.tiktok.com/@user/video/123"),
    ).toBeNull();
  });

  it("クエリ内に tiktok URL を仕込んでも host が別なら null", () => {
    expect(
      parseVideoUrl(
        "https://evil.com/?u=https://www.tiktok.com/@user/video/123",
      ),
    ).toBeNull();
  });

  it("tiktok の動画以外のパス (プロフィール) は null", () => {
    expect(parseVideoUrl("https://www.tiktok.com/@user")).toBeNull();
  });

  it("YouTube 等の未対応プラットフォームは null", () => {
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
  });
});
