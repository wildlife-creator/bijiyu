import { describe, it, expect } from "vitest";

import {
  experienceYearsBounds,
  experienceYearsMatches,
  hasMatchingTradeExperience,
} from "@/lib/utils/experience-years-filter";

// 職人検索（CLI-005）の経験年数フィルタ。
// バグ再発防止: contractor-search-filter.tsx は experienceYears を URL に付与するのに
// page.tsx がそれを読まずクエリ条件も無かったため「10年以上でも経験3年・未記載が出る」
// 不具合があった。境界（下限含む・上限未満）と NULL 除外を固定する。
describe("experienceYearsBounds", () => {
  it("各ラベルを下限含む・上限未満の境界へ変換する（非重複）", () => {
    expect(experienceYearsBounds("1年未満")).toEqual({ lt: 1 });
    expect(experienceYearsBounds("1〜3年")).toEqual({ gte: 1, lt: 3 });
    expect(experienceYearsBounds("3〜5年")).toEqual({ gte: 3, lt: 5 });
    expect(experienceYearsBounds("5〜10年")).toEqual({ gte: 5, lt: 10 });
    expect(experienceYearsBounds("10年以上")).toEqual({ gte: 10 });
  });

  it("未知ラベル（all / 空文字 / 想定外）は null", () => {
    expect(experienceYearsBounds("all")).toBeNull();
    expect(experienceYearsBounds("")).toBeNull();
    expect(experienceYearsBounds("20年")).toBeNull();
  });
});

describe("experienceYearsMatches", () => {
  it("「10年以上」は 10 以上のみ一致し、10 未満・未記載は一致しない", () => {
    expect(experienceYearsMatches(10, "10年以上")).toBe(true);
    expect(experienceYearsMatches(15, "10年以上")).toBe(true);
    expect(experienceYearsMatches(9, "10年以上")).toBe(false);
    expect(experienceYearsMatches(3, "10年以上")).toBe(false);
    expect(experienceYearsMatches(0, "10年以上")).toBe(false);
    // 未記載（NULL / undefined）は除外
    expect(experienceYearsMatches(null, "10年以上")).toBe(false);
    expect(experienceYearsMatches(undefined, "10年以上")).toBe(false);
  });

  it("境界値は下限に含まれ、上限には含まれない（3 は 3〜5年 側）", () => {
    // 3 は "1〜3年"（gte1 lt3）に含まれず、"3〜5年"（gte3 lt5）に含まれる
    expect(experienceYearsMatches(3, "1〜3年")).toBe(false);
    expect(experienceYearsMatches(3, "3〜5年")).toBe(true);
    // 5 は "3〜5年" に含まれず "5〜10年" 側
    expect(experienceYearsMatches(5, "3〜5年")).toBe(false);
    expect(experienceYearsMatches(5, "5〜10年")).toBe(true);
    // 10 は "5〜10年" に含まれず "10年以上" 側
    expect(experienceYearsMatches(10, "5〜10年")).toBe(false);
    expect(experienceYearsMatches(10, "10年以上")).toBe(true);
  });

  it("「1年未満」は 0 のみ一致、1 以上・未記載は不一致", () => {
    expect(experienceYearsMatches(0, "1年未満")).toBe(true);
    expect(experienceYearsMatches(1, "1年未満")).toBe(false);
    expect(experienceYearsMatches(null, "1年未満")).toBe(false);
  });

  it("中間帯は下限含む・上限未満で一致する", () => {
    expect(experienceYearsMatches(1, "1〜3年")).toBe(true);
    expect(experienceYearsMatches(2, "1〜3年")).toBe(true);
    expect(experienceYearsMatches(4, "3〜5年")).toBe(true);
    expect(experienceYearsMatches(9, "5〜10年")).toBe(true);
  });

  it("未知ラベルは常に false", () => {
    expect(experienceYearsMatches(10, "all")).toBe(false);
    expect(experienceYearsMatches(10, "")).toBe(false);
  });
});

// 修正6+7: 職種×経験年数の複合指定は「選択した職種での経験年数」で判定する。
// 職種と無相関の ANY 一致だと「大工2年＋塗装12年」が「大工×10年以上」でヒットする不具合。
describe("hasMatchingTradeExperience", () => {
  const konoDaiku2Toso12 = [
    { tradeType: "建築/躯体｜大工", experienceYears: 2 },
    { tradeType: "建築/仕上げ｜塗装工", experienceYears: 12 },
  ];

  it("選択職種の経験年数で判定する（大工2年＋塗装12年 は 大工×10年以上 に不一致）", () => {
    expect(
      hasMatchingTradeExperience(
        konoDaiku2Toso12,
        ["建築/躯体｜大工"],
        "10年以上",
      ),
    ).toBe(false);
  });

  it("選択職種が範囲を満たせば一致する（塗装×10年以上 は一致）", () => {
    expect(
      hasMatchingTradeExperience(
        konoDaiku2Toso12,
        ["建築/仕上げ｜塗装工"],
        "10年以上",
      ),
    ).toBe(true);
  });

  it("職種未指定なら いずれかの職種が範囲に入れば一致（ANY 一致）", () => {
    expect(hasMatchingTradeExperience(konoDaiku2Toso12, [], "10年以上")).toBe(
      true,
    );
    expect(hasMatchingTradeExperience(konoDaiku2Toso12, [], "5〜10年")).toBe(
      false,
    );
  });

  it("複数職種を選択した場合は OR（どれかの選択職種で範囲を満たせば一致）", () => {
    expect(
      hasMatchingTradeExperience(
        konoDaiku2Toso12,
        ["建築/躯体｜大工", "建築/仕上げ｜塗装工"],
        "10年以上",
      ),
    ).toBe(true);
    expect(
      hasMatchingTradeExperience(
        konoDaiku2Toso12,
        ["建築/躯体｜大工", "建築/仕上げ｜塗装工"],
        "1〜3年",
      ),
    ).toBe(true); // 大工2年 が 1〜3年 に一致
  });

  it("経験年数が未記載（NULL）の skill は一致しない", () => {
    expect(
      hasMatchingTradeExperience(
        [{ tradeType: "建築/躯体｜大工", experienceYears: null }],
        ["建築/躯体｜大工"],
        "10年以上",
      ),
    ).toBe(false);
  });

  it("該当職種を保有しない場合は一致しない", () => {
    expect(
      hasMatchingTradeExperience(konoDaiku2Toso12, ["設備｜電気工"], "1〜3年"),
    ).toBe(false);
  });
});
