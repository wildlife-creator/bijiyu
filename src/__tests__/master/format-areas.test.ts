import { describe, expect, it } from "vitest";

import {
  formatAreas,
  formatAreasShort,
  formatAreasLong,
} from "@/lib/utils/format-areas";

describe("formatAreas", () => {
  describe("件数 0", () => {
    it("空配列で空文字を返す (default emptyLabel)", () => {
      expect(formatAreas([])).toBe("");
    });

    it("空配列で emptyLabel 指定", () => {
      expect(formatAreas([], { emptyLabel: "エリア未設定" })).toBe(
        "エリア未設定",
      );
    });
  });

  describe("単一エリア (1 件)", () => {
    it("県のみ (municipality = null) は「{県}（市区町村未指定）」", () => {
      expect(
        formatAreas([{ prefecture: "東京都", municipality: null }]),
      ).toBe("東京都（市区町村未指定）");
    });

    it("県+市は連結「{県}{市}」", () => {
      expect(
        formatAreas([{ prefecture: "東京都", municipality: "港区" }]),
      ).toBe("東京都港区");
    });
  });

  describe("同一県の混在 (Req 5.5)", () => {
    it("県全域 + 市区町村 → 「{県}（{m1}・{m2}ほか）」", () => {
      const out = formatAreas([
        { prefecture: "東京都", municipality: null },
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "東京都", municipality: "新宿区" },
        { prefecture: "東京都", municipality: "渋谷区" },
      ]);
      expect(out).toBe("東京都（港区・新宿区ほか）");
    });

    it("県全域のみ 1 件 → 「{県}（市区町村未指定）」", () => {
      expect(
        formatAreas([{ prefecture: "神奈川県", municipality: null }]),
      ).toBe("神奈川県（市区町村未指定）");
    });

    it("市区町村のみ 2 件 (同一県) → それぞれ独立した単位", () => {
      expect(
        formatAreas([
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "東京都", municipality: "新宿区" },
        ]),
      ).toBe("東京都港区、東京都新宿区");
    });
  });

  describe("異県複数", () => {
    it("異なる県は順序を保持して「、」連結", () => {
      const out = formatAreas([
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "神奈川県", municipality: null },
        { prefecture: "大阪府", municipality: "大阪市北区" },
      ]);
      expect(out).toBe("東京都港区、神奈川県（市区町村未指定）、大阪府大阪市北区");
    });
  });

  describe("maxVisible 省略表示", () => {
    it("単位数 ≤ maxVisible なら全件表示", () => {
      const out = formatAreas(
        [
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "東京都", municipality: "新宿区" },
        ],
        { maxVisible: 3 },
      );
      expect(out).toBe("東京都港区、東京都新宿区");
    });

    it("単位数 > maxVisible で末尾「他Nエリア」", () => {
      const out = formatAreas(
        [
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "東京都", municipality: "新宿区" },
          { prefecture: "神奈川県", municipality: null },
          { prefecture: "千葉県", municipality: null },
          { prefecture: "埼玉県", municipality: null },
        ],
        { maxVisible: 3 },
      );
      expect(out).toBe(
        "東京都港区、東京都新宿区、神奈川県（市区町村未指定） 他2エリア",
      );
    });

    it("formatAreasShort は default maxVisible=3", () => {
      const out = formatAreasShort([
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "千葉県", municipality: null },
        { prefecture: "埼玉県", municipality: null },
        { prefecture: "茨城県", municipality: null },
      ]);
      expect(out).toContain("他1エリア");
    });
  });

  describe("dedupe", () => {
    it("同一 (prefecture, municipality) は最初の 1 件のみ", () => {
      const out = formatAreas([
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "東京都", municipality: "新宿区" },
      ]);
      expect(out).toBe("東京都港区、東京都新宿区");
    });

    it("(県, null) も他の (県, 市) と区別され dedupe される", () => {
      const out = formatAreas([
        { prefecture: "東京都", municipality: null },
        { prefecture: "東京都", municipality: null },
      ]);
      expect(out).toBe("東京都（市区町村未指定）");
    });
  });

  describe("formatAreasLong (詳細画面、全件展開)", () => {
    it("maxVisible 指定なしで全件表示", () => {
      const out = formatAreasLong([
        { prefecture: "東京都", municipality: "港区" },
        { prefecture: "東京都", municipality: "新宿区" },
        { prefecture: "東京都", municipality: "渋谷区" },
        { prefecture: "神奈川県", municipality: null },
      ]);
      expect(out).toBe(
        "東京都港区、東京都新宿区、東京都渋谷区、神奈川県（市区町村未指定）",
      );
    });
  });
});
