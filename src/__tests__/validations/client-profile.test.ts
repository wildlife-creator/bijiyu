import { describe, expect, it } from "vitest";

import {
  clientProfilePersonalSchema,
  clientProfilePersonalSetupSchema,
  clientProfileSchema,
  clientProfileSetupSchema,
  selectClientProfileSchema,
} from "@/lib/validations/client-profile";

/**
 * billing Task 17（2026-06-10 仕様変更⑤・2026-06-11 改訂）:
 * - setup（課金直後の初回設定）= 募集職種・募集エリア未入力可
 *   （招待法人が社名だけで即スタートできるように）
 * - edit（通常編集）= 募集職種・募集エリア必須（従来どおり）
 * - 社名（displayName）は法人のみ必須（setup / edit 共通）
 */

const baseInput = {
  displayName: "鈴木工務店株式会社",
  address: null,
  imageUrl: null,
  recruitJobTypes: ["内装工"],
  recruitArea: [{ prefecture: "東京都", whole: true, municipalities: [] }],
  employeeScale: null,
  workingWay: [],
  language: [],
  message: null,
  snsX: false,
  snsInstagram: false,
  snsTiktok: false,
  snsYoutube: false,
  snsFacebook: false,
};

const emptyRecruit = { recruitJobTypes: [], recruitArea: [] };

describe("setup スキーマ（課金直後の初回設定）", () => {
  it("法人: 社名のみ入力（募集職種・募集エリア空）で成功する", () => {
    const r = clientProfileSetupSchema.safeParse({
      ...baseInput,
      ...emptyRecruit,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.recruitJobTypes).toEqual([]);
      expect(r.data.recruitArea).toEqual([]);
    }
  });

  it("法人: 社名空はエラー（setup でも必須維持）", () => {
    const r = clientProfileSetupSchema.safeParse({
      ...baseInput,
      ...emptyRecruit,
      displayName: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("社名を入力してください");
    }
  });

  it("非法人: 社名・募集職種・募集エリアすべて空でも成功する", () => {
    const r = clientProfilePersonalSetupSchema.safeParse({
      ...baseInput,
      ...emptyRecruit,
      displayName: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBeNull();
  });
});

describe("edit スキーマ（通常編集）", () => {
  it("法人: 募集職種空はエラー（必須）", () => {
    const r = clientProfileSchema.safeParse({
      ...baseInput,
      recruitJobTypes: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("募集職種を選択してください");
    }
  });

  it("法人: 募集エリア空はエラー（必須）", () => {
    const r = clientProfileSchema.safeParse({ ...baseInput, recruitArea: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("募集エリアを選択してください");
    }
  });

  it("非法人: 募集職種・募集エリアは edit では必須（社名は任意のまま）", () => {
    const r = clientProfilePersonalSchema.safeParse({
      ...baseInput,
      ...emptyRecruit,
      displayName: "",
    });
    expect(r.success).toBe(false);
  });

  it("法人: 社名空はエラー", () => {
    const r = clientProfileSchema.safeParse({ ...baseInput, displayName: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("社名を入力してください");
    }
  });

  it("全項目入力済みは成功する", () => {
    expect(clientProfileSchema.safeParse(baseInput).success).toBe(true);
    expect(clientProfilePersonalSchema.safeParse(baseInput).success).toBe(true);
  });

  it("募集エリアの排他違反（全域 + 市区町村）はエラー", () => {
    const r = clientProfileSchema.safeParse({
      ...baseInput,
      recruitArea: [
        { prefecture: "東京都", whole: true, municipalities: ["港区"] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("募集職種の重複は dedup される", () => {
    const r = clientProfileSchema.safeParse({
      ...baseInput,
      recruitJobTypes: ["内装工", "内装工"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recruitJobTypes).toEqual(["内装工"]);
  });
});

describe("selectClientProfileSchema", () => {
  it("プラン × mode で 4 スキーマを選択する", () => {
    expect(selectClientProfileSchema("corporate", "edit")).toBe(
      clientProfileSchema,
    );
    expect(selectClientProfileSchema("corporate_premium", "setup")).toBe(
      clientProfileSetupSchema,
    );
    expect(selectClientProfileSchema("individual", "edit")).toBe(
      clientProfilePersonalSchema,
    );
    expect(selectClientProfileSchema("small", "setup")).toBe(
      clientProfilePersonalSetupSchema,
    );
    // mode 省略時は edit（必須側）
    expect(selectClientProfileSchema(null)).toBe(clientProfilePersonalSchema);
  });
});
