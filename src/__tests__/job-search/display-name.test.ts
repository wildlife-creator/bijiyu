import { describe, expect, it } from "vitest";
import { getUserDisplayName } from "@/lib/utils/display-name";

describe("getUserDisplayName", () => {
  it("退会済みユーザーは '退会済みユーザー' を返す", () => {
    const result = getUserDisplayName({
      lastName: "田中",
      firstName: "太郎",
      deletedAt: "2026-01-01",
    });
    expect(result).toBe("退会済みユーザー");
  });

  it("退会済みユーザー（company mode）でも '退会済みユーザー' を返す", () => {
    const result = getUserDisplayName(
      { companyName: "テスト株式会社", deletedAt: "2026-01-01" },
      "company",
    );
    expect(result).toBe("退会済みユーザー");
  });

  it("通常ユーザーはフルネームを返す", () => {
    const result = getUserDisplayName({
      lastName: "田中",
      firstName: "太郎",
      deletedAt: null,
    });
    expect(result).toBe("田中 太郎");
  });

  it("company モードは会社名を返す", () => {
    const result = getUserDisplayName(
      { companyName: "テスト株式会社", deletedAt: null },
      "company",
    );
    expect(result).toBe("テスト株式会社");
  });

  it("名前が未設定なら '未設定' を返す", () => {
    const result = getUserDisplayName({ deletedAt: null });
    expect(result).toBe("未設定");
  });

  it("会社名が未設定なら '未設定' を返す", () => {
    const result = getUserDisplayName({ deletedAt: null }, "company");
    expect(result).toBe("未設定");
  });
});
