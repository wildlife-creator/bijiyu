import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  listBigCategories,
  listMidCategories,
  parseTradeTypeCategory,
  siblingsInSameMidCategory,
} from "@/lib/master/category";

const CLEANED_TRADE_TYPES_PATH = resolve(
  __dirname,
  "../../../.kiro/specs/master-skills/raw-data/cleaned/trade-types.txt",
);

function loadMasterTradeTypeLabels(): string[] {
  return readFileSync(CLEANED_TRADE_TYPES_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe("parseTradeTypeCategory", () => {
  it("parses two-level label '<big>/<mid>｜<leaf>'", () => {
    expect(parseTradeTypeCategory("建築/躯体｜大工")).toEqual({
      big: "建築",
      mid: "躯体",
      leaf: "大工",
    });
  });

  it("parses one-level label '<single>｜<leaf>' as big === mid === single", () => {
    expect(parseTradeTypeCategory("撮影・クリエイティブ｜カメラマン")).toEqual({
      big: "撮影・クリエイティブ",
      mid: "撮影・クリエイティブ",
      leaf: "カメラマン",
    });
  });

  it("returns big='' mid='' leaf=label when no pipe is present", () => {
    expect(parseTradeTypeCategory("無分類ラベル")).toEqual({
      big: "",
      mid: "",
      leaf: "無分類ラベル",
    });
  });

  it("handles parens in leaf segment correctly", () => {
    expect(parseTradeTypeCategory("設備/施工｜電気（その他全般）")).toEqual({
      big: "設備",
      mid: "施工",
      leaf: "電気（その他全般）",
    });
  });

  it("parses all 113 master labels without throwing and yields non-empty leaf for each", () => {
    const labels = loadMasterTradeTypeLabels();
    expect(labels.length).toBe(113);
    for (const label of labels) {
      const cat = parseTradeTypeCategory(label);
      expect(cat.leaf.length, `leaf empty for ${label}`).toBeGreaterThan(0);
    }
  });

  it("every 113 master label parses to either two-level or one-level (no orphan)", () => {
    const labels = loadMasterTradeTypeLabels();
    for (const label of labels) {
      const cat = parseTradeTypeCategory(label);
      const hasCategory = cat.big.length > 0 && cat.mid.length > 0;
      expect(hasCategory, `no big/mid for ${label}`).toBe(true);
    }
  });
});

describe("listBigCategories", () => {
  it("returns unique big categories in first-seen order", () => {
    const labels = [
      "建築/躯体｜大工",
      "建築/仕上げ｜塗装工",
      "設備/施工｜配管工（塩ビ管）",
      "建築/躯体｜鉄筋工",
    ];
    expect(listBigCategories(labels)).toEqual(["建築", "設備"]);
  });

  it("excludes labels with no big category (no pipe)", () => {
    expect(listBigCategories(["無分類", "建築/躯体｜大工"])).toEqual(["建築"]);
  });
});

describe("listMidCategories", () => {
  it("returns unique (big, mid) pairs in first-seen order", () => {
    const labels = [
      "建築/躯体｜大工",
      "建築/躯体｜鉄筋工",
      "建築/仕上げ｜塗装工",
      "設備/施工｜配管工（塩ビ管）",
    ];
    expect(listMidCategories(labels)).toEqual([
      { big: "建築", mid: "躯体" },
      { big: "建築", mid: "仕上げ" },
      { big: "設備", mid: "施工" },
    ]);
  });
});

describe("siblingsInSameMidCategory", () => {
  const allLabels = [
    "建築/躯体｜大工",
    "建築/躯体｜宮大工",
    "建築/躯体｜型枠工",
    "建築/仕上げ｜塗装工",
    "設備/施工｜配管工（塩ビ管）",
  ];

  it("returns siblings under the same (big, mid) excluding the target itself", () => {
    expect(siblingsInSameMidCategory("建築/躯体｜大工", allLabels)).toEqual([
      "建築/躯体｜宮大工",
      "建築/躯体｜型枠工",
    ]);
  });

  it("does not include the target in the result", () => {
    const result = siblingsInSameMidCategory("建築/躯体｜大工", allLabels);
    expect(result).not.toContain("建築/躯体｜大工");
  });

  it("returns empty array for a target with no big/mid (no pipe)", () => {
    expect(siblingsInSameMidCategory("無分類", allLabels)).toEqual([]);
  });

  it("returns empty array when no siblings exist in the same mid category", () => {
    expect(
      siblingsInSameMidCategory("建築/仕上げ｜塗装工", allLabels),
    ).toEqual([]);
  });

  it("excludes deprecated labels when caller pre-filters them out (active-only contract)", () => {
    // The function itself is not deprecated-aware; callers (e.g. RelatedSuggestions)
    // pass allActiveTradeTypes which is already filtered by deprecated_at IS NULL.
    // This test documents the expected caller contract: when deprecated labels are
    // omitted from allLabels, they do not appear in the result.
    const activeOnly = allLabels.filter((l) => l !== "建築/躯体｜宮大工");
    expect(siblingsInSameMidCategory("建築/躯体｜大工", activeOnly)).toEqual([
      "建築/躯体｜型枠工",
    ]);
  });
});
