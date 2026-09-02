import { describe, expect, it } from "vitest";

import {
  parsedVideoFromRow,
  staticThumbnailForRow,
  type VideoDisplayRow,
} from "@/lib/videos/display";

/**
 * videos 行 → 埋込メタ情報の純粋関数（P4）。表示 6 画面と管理画面が共有する。
 */

const UID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

function row(overrides: Partial<VideoDisplayRow>): VideoDisplayRow {
  return {
    id: "v-1",
    provider: "external",
    cloudflare_uid: null,
    embed_source_url: null,
    status: "ready",
    sort_order: 0,
    admin_label: null,
    ...overrides,
  };
}

describe("parsedVideoFromRow", () => {
  it("cloudflare 行は UID から 16:9 の ParsedVideo を組む（URL 解析なし）", () => {
    const parsed = parsedVideoFromRow(
      row({ provider: "cloudflare", cloudflare_uid: UID }),
    );
    expect(parsed).toEqual({
      platform: "cloudflare",
      id: UID,
      aspect: "video",
      embedUrl: `https://iframe.videodelivery.net/${UID}`,
    });
  });

  it("external 行は embed_source_url を parseVideoUrl で解析する", () => {
    const parsed = parsedVideoFromRow(
      row({
        provider: "external",
        embed_source_url: "https://www.tiktok.com/@u/video/7111111111111111111",
      }),
    );
    expect(parsed?.platform).toBe("tiktok");
    expect(parsed?.aspect).toBe("9/16");
  });

  it("external で URL が不正なら null（描画しない）", () => {
    expect(
      parsedVideoFromRow(
        row({ provider: "external", embed_source_url: "https://example.com/x" }),
      ),
    ).toBeNull();
  });

  it("cloudflare で UID が無い不整合行は null", () => {
    expect(
      parsedVideoFromRow(row({ provider: "cloudflare", cloudflare_uid: null })),
    ).toBeNull();
  });
});

describe("staticThumbnailForRow", () => {
  it("cloudflare 行は固定サムネ URL を返す", () => {
    expect(
      staticThumbnailForRow(row({ provider: "cloudflare", cloudflare_uid: UID })),
    ).toBe(`https://videodelivery.net/${UID}/thumbnails/thumbnail.jpg`);
  });

  it("external 行は null（oEmbed で取得する）", () => {
    expect(
      staticThumbnailForRow(
        row({ embed_source_url: "https://www.tiktok.com/@u/video/1" }),
      ),
    ).toBeNull();
  });
});
