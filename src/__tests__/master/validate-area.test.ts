import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MunicipalityRow } from "@/lib/master/fetch";

const { mockGetAllMunicipalityRows } = vi.hoisted(() => ({
  mockGetAllMunicipalityRows: vi.fn<() => Promise<MunicipalityRow[]>>(),
}));

vi.mock("@/lib/master/fetch", () => ({
  getAllMunicipalityRows: () => mockGetAllMunicipalityRows(),
}));

import {
  validateAreaChanges,
  isKnownPrefecture,
  areaValidationErrorMessage,
} from "@/lib/master/validate-area";

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
      if (result.valid === false && result.transient === false) {
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
      if (result.valid === false && result.transient === false) {
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
      if (result.valid === false && result.transient === false) {
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
      if (result.valid === false && result.transient === false) {
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

  describe("マスタ取得の一時失敗", () => {
    it("市区町村マスタ取得が throw したら transient=true（存在しない断定をしない）", async () => {
      // 2026-07-11 回帰防止: getAllMunicipalityRows の reject を「存在しないエリア」と
      // 誤判定しない。reject する = unstable_cache に空がキャッシュされない前提。
      mockGetAllMunicipalityRows.mockRejectedValueOnce(new Error("boom"));
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: "港区" }],
        [],
      );
      expect(result).toEqual({ valid: false, transient: true });
    });

    it("県のみ追加はマスタ参照しないので取得失敗の影響を受けない", async () => {
      mockGetAllMunicipalityRows.mockRejectedValueOnce(new Error("boom"));
      const result = await validateAreaChanges(
        [{ prefecture: "東京都", municipality: null }],
        [],
      );
      expect(result).toEqual({ valid: true });
      expect(mockGetAllMunicipalityRows).not.toHaveBeenCalled();
    });
  });
});

describe("areaValidationErrorMessage", () => {
  it("transient は「時間をおいて」の一時エラー文言（存在しない断定をしない）", () => {
    const msg = areaValidationErrorMessage({ valid: false, transient: true });
    // label 側と同一のユーザー向け汎用文言（「マスタ」等の開発用語を含まない）。
    expect(msg).toBe(
      "データの取得に一時的に失敗しました。時間をおいて再度お試しください。",
    );
    expect(msg).not.toContain("存在しない");
    expect(msg).not.toContain("マスタ");
  });

  it("unknown は県+市を結合して「存在しないエリアが含まれています」", () => {
    const msg = areaValidationErrorMessage({
      valid: false,
      transient: false,
      unknownPairs: [{ prefecture: "東京都", municipality: "存在しない区" }],
      deprecatedPairs: [],
    });
    expect(msg).toBe("存在しないエリアが含まれています: 東京都存在しない区");
  });

  it("県のみ (municipality=null) は県名だけを出す", () => {
    const msg = areaValidationErrorMessage({
      valid: false,
      transient: false,
      unknownPairs: [{ prefecture: "架空県", municipality: null }],
      deprecatedPairs: [],
    });
    expect(msg).toBe("存在しないエリアが含まれています: 架空県");
  });

  it("deprecated の動詞は既定「登録」/ 引数で「新規追加」に切替できる", () => {
    const failure = {
      valid: false as const,
      transient: false as const,
      unknownPairs: [] as { prefecture: string; municipality: string | null }[],
      deprecatedPairs: [{ prefecture: "東京都", municipality: "廃止区" }],
    };
    expect(areaValidationErrorMessage(failure)).toBe(
      "廃止されたエリアは登録できません: 東京都廃止区",
    );
    expect(areaValidationErrorMessage(failure, "新規追加")).toBe(
      "廃止されたエリアは新規追加できません: 東京都廃止区",
    );
  });
});
