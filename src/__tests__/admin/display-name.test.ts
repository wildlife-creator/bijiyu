import { describe, expect, it } from "vitest";

import {
  adminParticipantName,
  adminUserDisplayName,
} from "@/lib/admin/display-name";

describe("adminUserDisplayName", () => {
  it("未退会は姓名（スペース無し）をそのまま返す", () => {
    expect(
      adminUserDisplayName({
        lastName: "山田",
        firstName: "太郎",
        deletedAt: null,
      }),
    ).toBe("山田太郎");
  });

  it("退会済みは実名＋（退会済み）を返す（退会済みユーザーに置換しない）", () => {
    expect(
      adminUserDisplayName({
        lastName: "山田",
        firstName: "太郎",
        deletedAt: "2026-07-01T00:00:00Z",
      }),
    ).toBe("山田太郎（退会済み）");
  });

  it("退会済みで姓名が無ければ 未設定（退会済み）を返す", () => {
    expect(
      adminUserDisplayName({
        lastName: null,
        firstName: null,
        deletedAt: "2026-07-01T00:00:00Z",
      }),
    ).toBe("未設定（退会済み）");
  });
});

describe("adminParticipantName", () => {
  it("display_name を最優先する（未退会）", () => {
    expect(
      adminParticipantName({
        displayName: "株式会社アルファ",
        lastName: "山田",
        firstName: "太郎",
        deletedAt: null,
      }),
    ).toBe("株式会社アルファ");
  });

  it("退会済みでも display_name を維持し（退会済み）を付す", () => {
    expect(
      adminParticipantName({
        displayName: "株式会社アルファ",
        lastName: "山田",
        firstName: "太郎",
        deletedAt: "2026-07-01T00:00:00Z",
      }),
    ).toBe("株式会社アルファ（退会済み）");
  });

  it("退会済みで display_name が無ければ実名＋（退会済み）を返す", () => {
    expect(
      adminParticipantName({
        displayName: null,
        lastName: "山田",
        firstName: "太郎",
        deletedAt: "2026-07-01T00:00:00Z",
      }),
    ).toBe("山田太郎（退会済み）");
  });
});
