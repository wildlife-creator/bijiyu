import { describe, expect, it } from "vitest";

import {
  ExternalVideoUrlSchema,
  VideoAdminLabelSchema,
  VideoPlacementSchema,
} from "@/lib/validations/video";

/**
 * ADM-027 動画管理の Zod スキーマ（P4）。クライアント・サーバーで共有する二重防御。
 * 旧 VideoUrlSchema（空文字 = 掲載停止）は廃止し、URL 追加は非空 + parseVideoUrl 通過を必須にした。
 */

describe("ExternalVideoUrlSchema", () => {
  it("正しい TikTok 標準 URL は通過する（trim される）", () => {
    const result = ExternalVideoUrlSchema.safeParse(
      "  https://www.tiktok.com/@user/video/7234567890123456789  ",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(
        "https://www.tiktok.com/@user/video/7234567890123456789",
      );
    }
  });

  it("Cloudflare Stream の埋込 URL も通過する", () => {
    expect(
      ExternalVideoUrlSchema.safeParse(
        "https://iframe.videodelivery.net/a1b2c3d4e5f60718293a4b5c6d7e8f90",
      ).success,
    ).toBe(true);
  });

  it("空文字はエラー（掲載をやめる = 削除で行う）", () => {
    const result = ExternalVideoUrlSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "対応プラットフォームの URL を入力してください",
      );
    }
  });

  it("parseVideoUrl が null を返す URL はエラーメッセージを返す", () => {
    const result = ExternalVideoUrlSchema.safeParse("https://vt.tiktok.com/ZSabc/");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "対応プラットフォームの URL を入力してください",
      );
    }
  });

  it("URL でない文字列もエラー", () => {
    expect(ExternalVideoUrlSchema.safeParse("not a url").success).toBe(false);
  });
});

describe("VideoAdminLabelSchema", () => {
  it("空文字は null に変換する", () => {
    const result = VideoAdminLabelSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("通常のラベルは trim して返す", () => {
    const result = VideoAdminLabelSchema.safeParse(" 現場紹介 ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("現場紹介");
  });

  it("100 文字を超えるとエラー", () => {
    const result = VideoAdminLabelSchema.safeParse("あ".repeat(101));
    expect(result.success).toBe(false);
  });
});

describe("VideoPlacementSchema", () => {
  it("contractor_page / client_page は通過する", () => {
    expect(VideoPlacementSchema.safeParse("contractor_page").success).toBe(true);
    expect(VideoPlacementSchema.safeParse("client_page").success).toBe(true);
  });

  it("未知の掲載場所はエラー", () => {
    expect(VideoPlacementSchema.safeParse("top_page").success).toBe(false);
  });
});
