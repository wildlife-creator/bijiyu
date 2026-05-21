import { describe, expect, it } from "vitest";

import {
  areaRowsSchema,
  jobAreaRowsSchema,
  searchAreaRowSchema,
  areaErrorMessages,
} from "@/lib/validations/area";

/**
 * master-area-multi-select Phase A Task 1.5
 *
 * 共通 Zod スキーマの単体テスト。エラーメッセージはすべて
 * `areaErrorMessages` 定数経由で参照されることを assert する。
 */

describe("areaRowsSchema", () => {
  describe("正常系", () => {
    it("空配列を受理する", () => {
      const result = areaRowsSchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it("県全域 + 別県の muni 行を受理する", () => {
      const result = areaRowsSchema.safeParse([
        { prefecture: "東京都", whole: true, municipalities: [] },
        {
          prefecture: "神奈川県",
          whole: false,
          municipalities: ["横浜市中区"],
        },
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe("排他違反 (whole && muni.length > 0)", () => {
    it("メッセージ exclusiveViolation を返す", () => {
      const result = areaRowsSchema.safeParse([
        {
          prefecture: "東京都",
          whole: true,
          municipalities: ["港区"],
        },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain(areaErrorMessages.exclusiveViolation);
      }
    });
  });

  describe("未完成行 (!whole && muni.length === 0)", () => {
    it("メッセージ incompleteRow を返す", () => {
      const result = areaRowsSchema.safeParse([
        { prefecture: "東京都", whole: false, municipalities: [] },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain(areaErrorMessages.incompleteRow);
      }
    });
  });

  describe("同県重複", () => {
    it("メッセージ duplicatePrefecture を返す", () => {
      const result = areaRowsSchema.safeParse([
        {
          prefecture: "東京都",
          whole: false,
          municipalities: ["港区"],
        },
        {
          prefecture: "東京都",
          whole: false,
          municipalities: ["渋谷区"],
        },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain(areaErrorMessages.duplicatePrefecture);
      }
    });
  });
});

describe("jobAreaRowsSchema (案件 10 件上限)", () => {
  it("展開後 9 件は受理", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      prefecture: ["東京都", "神奈川県", "千葉県", "埼玉県", "茨城県", "栃木県", "群馬県", "山梨県", "静岡県"][i],
      whole: true,
      municipalities: [] as string[],
    }));
    const result = jobAreaRowsSchema.safeParse(rows);
    expect(result.success).toBe(true);
  });

  it("展開後 10 件は受理 (境界)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      prefecture: ["東京都", "神奈川県", "千葉県", "埼玉県", "茨城県", "栃木県", "群馬県", "山梨県", "静岡県", "長野県"][i],
      whole: true,
      municipalities: [] as string[],
    }));
    const result = jobAreaRowsSchema.safeParse(rows);
    expect(result.success).toBe(true);
  });

  it("展開後 11 件は tooManyAreasForJob で拒否 (境界)", () => {
    // 1 行で muni 11 個 → 展開後 11 件
    const rows = [
      {
        prefecture: "東京都",
        whole: false,
        municipalities: [
          "港区",
          "渋谷区",
          "新宿区",
          "中央区",
          "千代田区",
          "文京区",
          "台東区",
          "墨田区",
          "江東区",
          "品川区",
          "目黒区",
        ],
      },
    ];
    const result = jobAreaRowsSchema.safeParse(rows);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain(areaErrorMessages.tooManyAreasForJob);
    }
  });
});

describe("searchAreaRowSchema", () => {
  it("whole === false の単一 AreaRow を受理 (muni 0 個 = 県のみ指定)", () => {
    const result = searchAreaRowSchema.safeParse({
      prefecture: "東京都",
      whole: false,
      municipalities: [],
    });
    expect(result.success).toBe(true);
  });

  it("whole === false + muni 複数も受理", () => {
    const result = searchAreaRowSchema.safeParse({
      prefecture: "東京都",
      whole: false,
      municipalities: ["港区", "渋谷区"],
    });
    expect(result.success).toBe(true);
  });

  it("whole === true は拒否 (検索系では全域指定不可)", () => {
    const result = searchAreaRowSchema.safeParse({
      prefecture: "東京都",
      whole: true,
      municipalities: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("areaErrorMessages 定数経由", () => {
  it("すべてのエラーメッセージは areaErrorMessages 経由で参照される", () => {
    expect(areaErrorMessages.exclusiveViolation).toBeTypeOf("string");
    expect(areaErrorMessages.incompleteRow).toBeTypeOf("string");
    expect(areaErrorMessages.duplicatePrefecture).toBeTypeOf("string");
    expect(areaErrorMessages.tooManyAreasForJob).toBeTypeOf("string");
  });
});

/**
 * 回帰防止: バグ #6「行レベルエラーが画面に出ない」(Phase 9) は
 * multi-select Phase C の schema 統合で再発した。エラーは必ず配列ルート
 * (path: []) に集約し、親フォームの FieldError (errors.<field>.message)
 * で表示できる状態を維持すること。
 */
describe("回帰防止: エラーパスは配列ルートに集約される", () => {
  it("未完成行のエラーは path: [] で出る (行 index ではない)", () => {
    const result = areaRowsSchema.safeParse([
      { prefecture: "東京都", whole: false, municipalities: [] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message === areaErrorMessages.incompleteRow,
      );
      expect(issue).toBeDefined();
      expect(issue?.path).toEqual([]);
    }
  });

  it("排他違反のエラーは path: [] で出る", () => {
    const result = areaRowsSchema.safeParse([
      { prefecture: "東京都", whole: true, municipalities: ["港区"] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message === areaErrorMessages.exclusiveViolation,
      );
      expect(issue).toBeDefined();
      expect(issue?.path).toEqual([]);
    }
  });

  it("同県重複のエラーは path: [] で出る", () => {
    const result = areaRowsSchema.safeParse([
      { prefecture: "東京都", whole: false, municipalities: ["港区"] },
      { prefecture: "東京都", whole: false, municipalities: ["渋谷区"] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message === areaErrorMessages.duplicatePrefecture,
      );
      expect(issue).toBeDefined();
      expect(issue?.path).toEqual([]);
    }
  });

  it("複数の未完成行があっても重複エラーは出ない (1 回のみ)", () => {
    const result = areaRowsSchema.safeParse([
      { prefecture: "東京都", whole: false, municipalities: [] },
      { prefecture: "神奈川県", whole: false, municipalities: [] },
      { prefecture: "千葉県", whole: false, municipalities: [] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const incompleteIssues = result.error.issues.filter(
        (i) => i.message === areaErrorMessages.incompleteRow,
      );
      expect(incompleteIssues).toHaveLength(1);
    }
  });
});
