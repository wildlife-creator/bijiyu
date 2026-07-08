import { describe, expect, it } from "vitest";

import { buildSortLinkHref } from "@/lib/utils/build-sort-link";

/**
 * A9 回帰テスト (R5.3):
 * ソート切替リンクで配列 searchParams (municipality 等) が落ちないこと。
 */
describe("buildSortLinkHref (A9)", () => {
  it("配列 searchParams (?municipality=A&municipality=B) が append で維持される", () => {
    const sp = {
      prefecture: "東京都",
      municipality: ["港区", "渋谷区"],
      sort: "newest",
    };
    const href = buildSortLinkHref("/jobs/search", sp, "reward_high");
    // 配列は同名キーの繰り返しで保持される (順序保証)
    expect(href).toContain("municipality=%E6%B8%AF%E5%8C%BA"); // 港区
    expect(href).toContain("municipality=%E6%B8%8B%E8%B0%B7%E5%8C%BA"); // 渋谷区
    // prefecture 単値も保持
    expect(href).toContain("prefecture=%E6%9D%B1%E4%BA%AC%E9%83%BD");
    // sort だけが指定値に置き換わる (旧 sort=newest は捨てられる)
    expect(href).toContain("sort=reward_high");
    expect(href).not.toContain("sort=newest");
  });

  it("空 searchParams でも sort だけの href を生成する", () => {
    const href = buildSortLinkHref("/jobs/search", {}, "reward_low");
    expect(href).toBe("/jobs/search?sort=reward_low");
  });

  it("undefined 値は URL に含めない", () => {
    const sp = {
      prefecture: undefined,
      trade_type: "大工",
    };
    const href = buildSortLinkHref("/jobs/search", sp, "newest");
    expect(href).not.toContain("prefecture=");
    expect(href).toContain("trade_type=%E5%A4%A7%E5%B7%A5");
  });

  it("配列内の undefined / 非 string 要素は skip する", () => {
    const sp = {
      // Next.js RSC 上は string | string[] | undefined の型だが、
      // ランタイム防御として非 string 要素は捨てる
      tags: ["a", "b"] as string[],
    };
    const href = buildSortLinkHref("/jobs/search", sp, "newest");
    expect(href).toContain("tags=a");
    expect(href).toContain("tags=b");
  });

  it("basePath は先頭にそのまま連結される", () => {
    const href = buildSortLinkHref("/some/other/path", { q: "x" }, "asc");
    expect(href).toMatch(/^\/some\/other\/path\?/);
  });
});
