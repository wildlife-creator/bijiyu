import { describe, expect, it } from "vitest";

import { VideoUrlSchema } from "@/lib/validations/video";

/**
 * VideoUrlSchema: 空文字（掲載停止＝NULL 更新用）を許容し、非空は parseVideoUrl
 * 通過を必須とする。クライアント・サーバーで共有する二重防御スキーマ。
 */

describe("VideoUrlSchema", () => {
  it("空文字は通過する（掲載停止＝NULL 更新）", () => {
    const result = VideoUrlSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("");
  });

  it("前後空白のみも trim 後に空文字として通過する", () => {
    const result = VideoUrlSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("");
  });

  it("正しい TikTok 標準 URL は通過する", () => {
    const result = VideoUrlSchema.safeParse(
      "https://www.tiktok.com/@user/video/7234567890123456789",
    );
    expect(result.success).toBe(true);
  });

  it("parseVideoUrl が null を返す URL はエラーメッセージを返す", () => {
    const result = VideoUrlSchema.safeParse("https://vt.tiktok.com/ZSabc/");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "対応プラットフォームの URL を入力してください",
      );
    }
  });

  it("URL でない文字列もエラー", () => {
    const result = VideoUrlSchema.safeParse("not a url");
    expect(result.success).toBe(false);
  });
});
