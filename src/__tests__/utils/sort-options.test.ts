import { describe, expect, it } from "vitest";

import {
  APPLICATION_SORT_OPTIONS,
  CLIENT_LIST_SORT_OPTIONS,
  CONTRACTOR_LIST_SORT_OPTIONS,
  FAVORITE_JOB_SORT_OPTIONS,
  JOB_MANAGE_SORT_OPTIONS,
  JOB_SEARCH_SORT_OPTIONS,
  resolveSortValue,
} from "@/lib/constants/sort-options";
import { buildSortSearch } from "@/lib/utils/sort-search-params";

/**
 * P6 一覧改修: 並び替えプルダウンの定数・URL 生成の回帰テスト。
 * - 既定値は各定数の先頭
 * - 未知の値 / 未指定 / 配列は既定に倒す
 * - URL 生成は検索条件（配列パラメータ含む）を保持し、page だけ落とす
 */
describe("resolveSortValue", () => {
  it("未指定（undefined / null / 空文字）は既定（先頭）に倒す", () => {
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, undefined)).toBe("recommended");
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, null)).toBe("recommended");
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, "")).toBe("recommended");
    expect(resolveSortValue(CLIENT_LIST_SORT_OPTIONS, undefined)).toBe("recommended");
    expect(resolveSortValue(CONTRACTOR_LIST_SORT_OPTIONS, undefined)).toBe("newest");
    expect(resolveSortValue(FAVORITE_JOB_SORT_OPTIONS, undefined)).toBe("asc");
    expect(resolveSortValue(APPLICATION_SORT_OPTIONS, undefined)).toBe("desc");
    expect(resolveSortValue(JOB_MANAGE_SORT_OPTIONS, undefined)).toBe("newest");
  });

  it("選択肢にある値はそのまま返す", () => {
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, "reward_low")).toBe("reward_low");
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, "newest")).toBe("newest");
    expect(resolveSortValue(APPLICATION_SORT_OPTIONS, "asc")).toBe("asc");
    expect(resolveSortValue(FAVORITE_JOB_SORT_OPTIONS, "desc")).toBe("desc");
  });

  it("未知の値は既定に倒す（URL 改変や旧値の混入に耐える）", () => {
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, "oldest")).toBe("recommended");
    expect(resolveSortValue(APPLICATION_SORT_OPTIONS, "recommended")).toBe("desc");
    expect(resolveSortValue(JOB_MANAGE_SORT_OPTIONS, "DROP TABLE")).toBe("newest");
  });

  it("配列（?sort=a&sort=b）は先頭要素で判定する", () => {
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, ["reward_high", "newest"])).toBe(
      "reward_high",
    );
    expect(resolveSortValue(JOB_SEARCH_SORT_OPTIONS, ["bogus", "newest"])).toBe(
      "recommended",
    );
  });

  it("各画面の定数は先頭が既定で、値が重複しない", () => {
    for (const options of [
      JOB_SEARCH_SORT_OPTIONS,
      CLIENT_LIST_SORT_OPTIONS,
      CONTRACTOR_LIST_SORT_OPTIONS,
      FAVORITE_JOB_SORT_OPTIONS,
      APPLICATION_SORT_OPTIONS,
      JOB_MANAGE_SORT_OPTIONS,
    ]) {
      const values = options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(options.every((o) => o.label.length > 0)).toBe(true);
    }
  });
});

describe("buildSortSearch", () => {
  it("配列 searchParams (?municipality=A&municipality=B) を保持したまま sort だけ差し替える", () => {
    const current = new URLSearchParams();
    current.append("prefecture", "東京都");
    current.append("municipality", "港区");
    current.append("municipality", "渋谷区");
    current.set("sort", "newest");

    const next = new URLSearchParams(buildSortSearch(current.toString(), "reward_high"));
    expect(next.getAll("municipality")).toEqual(["港区", "渋谷区"]);
    expect(next.get("prefecture")).toBe("東京都");
    expect(next.get("sort")).toBe("reward_high");
    expect(next.getAll("sort")).toHaveLength(1);
  });

  it("ページ番号は 1 に戻す（page を削除）", () => {
    const next = new URLSearchParams(
      buildSortSearch("status=取引完了&page=3&sort=desc", "asc"),
    );
    expect(next.has("page")).toBe(false);
    expect(next.get("status")).toBe("取引完了");
    expect(next.get("sort")).toBe("asc");
  });

  it("空の検索文字列でも sort だけの文字列を返す", () => {
    expect(buildSortSearch("", "reward_low")).toBe("sort=reward_low");
  });

  it("CLI-007 の jobId 絞り込みは並び替えで落ちない（旧 Link 実装のバグ回帰防止）", () => {
    const next = new URLSearchParams(
      buildSortSearch("jobId=66666666-6666-6666-6666-666666666666", "asc"),
    );
    expect(next.get("jobId")).toBe("66666666-6666-6666-6666-666666666666");
    expect(next.get("sort")).toBe("asc");
  });

  it("paramName を変えると別のキーを更新する", () => {
    expect(buildSortSearch("sort=desc", "asc", "order")).toBe("sort=desc&order=asc");
  });
});
