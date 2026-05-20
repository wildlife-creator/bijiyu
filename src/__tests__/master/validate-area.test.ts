import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MunicipalityRow } from "@/lib/master/fetch";

const { mockGetAllMunicipalityRows } = vi.hoisted(() => ({
  mockGetAllMunicipalityRows: vi.fn<() => Promise<MunicipalityRow[]>>(),
}));

vi.mock("@/lib/master/fetch", () => ({
  getAllMunicipalityRows: () => mockGetAllMunicipalityRows(),
}));

import { validateAreaChanges, isKnownPrefecture } from "@/lib/master/validate-area";

const municipalityRows: MunicipalityRow[] = [
  { prefecture: "東京都", municipality: "港区", deprecated_at: null },
  { prefecture: "東京都", municipality: "新宿区", deprecated_at: null },
  { prefecture: "神奈川県", municipality: "横浜市港北区", deprecated_at: null },
  {
    prefecture: "東京都",
    municipality: "廃止区",
    deprecated_at: "2026-04-01T00:00:00.000Z",
  },
];

describe("isKnownPrefecture", () => {
  it("47 都道府県は true", () => {
    expect(isKnownPrefecture("東京都")).toBe(true);
    expect(isKnownPrefecture("北海道")).toBe(true);
    expect(isKnownPrefecture("沖縄県")).toBe(true);
  });

  it("不正な県名は false", () => {
    expect(isKnownPrefecture("架空県")).toBe(false);
    expect(isKnownPrefecture("")).toBe(false);
  });
});

describe("validateAreaChanges", () => {
  beforeEach(() => {
    mockGetAllMunicipalityRows.mockReset();
    mockGetAllMunicipalityRows.mockResolvedValue(municipalityRows);
  });

  describe("added 無し (no changes)", () => {
    it("newAreas == previousAreas で valid=true、マスタ参照しない", async () => {
      const areas = [
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "神奈川県", municipality: null },
      ];
      const result = await validateAreaChanges(areas, areas);
      expect(result).toEqual({ valid: true });
      expect(mockGetAllMunicipalityRows).not.toHaveBeenCalled();
    });

    it("空配列 → 空配列 でも valid=true", async () => {
      const result = await validateAreaChanges([], []);
      expect(result).toEqual({ valid: true });
      expect(mockGetAllMunicipalityRows).not.toHaveBeenCalled();
    });
  });

  describe("県のみ追加 (municipality = null)", () => {
    it("既知の県は valid=true、マスタ参照しない (軽量チェック)", async () => {
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: null }],
        [],
      );
      expect(result).toEqual({ valid: true });
      expect(mockGetAllMunicipalityRows).not.toHaveBeenCalled();
    });

    it("47 都道府県外の県は unknownPairs に入る", async () => {
      const result = await validateAreaChanges(
        [{ prefecture: "架空県", municipality: null }],
        [],
      );
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.unknownPairs).toEqual([
          { prefecture: "架空県", municipality: null },
        ]);
        expect(result.deprecatedPairs).toEqual([]);
      }
    });
  });

  describe("市区町村追加 (municipality !== null)", () => {
    it("active な (県, 市) は valid=true", async () => {
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: "港区" }],
        [],
      );
      expect(result).toEqual({ valid: true });
      expect(mockGetAllMunicipalityRows).toHaveBeenCalledTimes(1);
    });

    it("マスタに無い (県, 市) は unknownPairs", async () => {
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: "存在しない区" }],
        [],
      );
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.unknownPairs).toEqual([
          { prefecture: "東京都", municipality: "存在しない区" },
        ]);
        expect(result.deprecatedPairs).toEqual([]);
      }
    });

    it("deprecated な (県, 市) を added で渡すと deprecatedPairs", async () => {
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: "廃止区" }],
        [],
      );
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.deprecatedPairs).toEqual([
          { prefecture: "東京都", municipality: "廃止区" },
        ]);
        expect(result.unknownPairs).toEqual([]);
      }
    });
  });

  describe("既存保有の deprecated は保持を許可 (Req 2.10 / 3.7 / 4.9)", () => {
    it("previousAreas に入っている deprecated 行は valid=true", async () => {
      const areas = [{ prefecture: "東京都", municipality: "廃止区" }];
      const result = await validateAreaChanges(areas, areas);
      expect(result).toEqual({ valid: true });
    });

    it("既存 deprecated + 新規 active = valid=true", async () => {
      const result = await validateAreaChanges(
        [
          { prefecture: "東京都", municipality: "廃止区" },
          { prefecture: "東京都", municipality: "港区" },
        ],
        [{ prefecture: "東京都", municipality: "廃止区" }],
      );
      expect(result).toEqual({ valid: true });
    });
  });

  describe("複合ケース", () => {
    it("unknown + deprecated 同時検出", async () => {
      const result = await validateAreaChanges(
        [
          { prefecture: "東京都", municipality: "存在しない区" },
          { prefecture: "東京都", municipality: "廃止区" },
          { prefecture: "東京都", municipality: "港区" }, // valid
        ],
        [],
      );
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.unknownPairs).toContainEqual({
          prefecture: "東京都",
          municipality: "存在しない区",
        });
        expect(result.deprecatedPairs).toContainEqual({
          prefecture: "東京都",
          municipality: "廃止区",
        });
      }
    });

    it("空 previousAreas (新規登録ケース) + active 追加 = valid=true", async () => {
      const result = await validateAreaChanges(
        [
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "神奈川県", municipality: "横浜市港北区" },
          { prefecture: "千葉県", municipality: null },
        ],
        [],
      );
      expect(result).toEqual({ valid: true });
    });

    it("newAreas 内の重複は dedupe される", async () => {
      const result = await validateAreaChanges(
        [
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "東京都", municipality: "港区" },
        ],
        [],
      );
      expect(result).toEqual({ valid: true });
      // マスタ参照は 1 回のみ (added 計算後に検証)
      expect(mockGetAllMunicipalityRows).toHaveBeenCalledTimes(1);
    });
  });
});
