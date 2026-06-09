import { describe, it, expect } from "vitest";

import { formatResidence } from "@/lib/utils/format-residence";

describe("formatResidence", () => {
  it("都道府県 + 市区町村をスペース無しで結合する", () => {
    expect(formatResidence("埼玉県", "さいたま市浦和区")).toBe(
      "埼玉県さいたま市浦和区",
    );
  });

  it("市区町村が null なら都道府県のみ", () => {
    expect(formatResidence("埼玉県", null)).toBe("埼玉県");
  });

  it("市区町村が空文字なら都道府県のみ", () => {
    expect(formatResidence("東京都", "")).toBe("東京都");
  });

  it("市区町村が undefined なら都道府県のみ", () => {
    expect(formatResidence("東京都", undefined)).toBe("東京都");
  });

  it("都道府県が無ければ null を返す", () => {
    expect(formatResidence(null, null)).toBeNull();
    expect(formatResidence("", "港区")).toBeNull();
    expect(formatResidence(undefined, undefined)).toBeNull();
  });

  it("前後空白はトリムされる", () => {
    expect(formatResidence(" 東京都 ", " 港区 ")).toBe("東京都港区");
  });
});
