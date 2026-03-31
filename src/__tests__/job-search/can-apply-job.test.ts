import { describe, expect, it } from "vitest";
import { canApplyJob } from "@/lib/utils/can-apply-job";

describe("canApplyJob", () => {
  const baseParams = {
    userRole: "contractor" as const,
    isPaidUser: false,
    jobTradeType: "大工",
    jobPrefecture: "東京都",
    userSkills: [{ tradeType: "大工" }, { tradeType: "内装工" }],
    userAvailableAreas: [{ prefecture: "東京都" }, { prefecture: "神奈川県" }],
  };

  // --- Paid users ---

  it("有料ユーザー（active subscription）は常に応募可能", () => {
    const result = canApplyJob({ ...baseParams, isPaidUser: true });
    expect(result.canApply).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("有料ユーザーは職種・エリアが不一致でも応募可能", () => {
    const result = canApplyJob({
      ...baseParams,
      isPaidUser: true,
      jobTradeType: "電気工事士",
      jobPrefecture: "北海道",
    });
    expect(result.canApply).toBe(true);
  });

  it("staff ロールは有料扱いで応募可能", () => {
    const result = canApplyJob({
      ...baseParams,
      userRole: "staff",
      isPaidUser: true,
    });
    expect(result.canApply).toBe(true);
  });

  // --- Free users: matching ---

  it("無料ユーザー: 職種とエリアが一致すれば応募可能", () => {
    const result = canApplyJob(baseParams);
    expect(result.canApply).toBe(true);
  });

  // --- Free users: not matching ---

  it("無料ユーザー: 職種が不一致なら応募不可", () => {
    const result = canApplyJob({
      ...baseParams,
      jobTradeType: "電気工事士",
    });
    expect(result.canApply).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("無料ユーザー: エリアが不一致なら応募不可", () => {
    const result = canApplyJob({
      ...baseParams,
      jobPrefecture: "北海道",
    });
    expect(result.canApply).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("無料ユーザー: 職種もエリアも不一致なら応募不可", () => {
    const result = canApplyJob({
      ...baseParams,
      jobTradeType: "電気工事士",
      jobPrefecture: "北海道",
    });
    expect(result.canApply).toBe(false);
  });

  it("無料ユーザー: スキル未登録なら応募不可", () => {
    const result = canApplyJob({
      ...baseParams,
      userSkills: [],
    });
    expect(result.canApply).toBe(false);
  });

  it("無料ユーザー: 対応エリア未登録なら応募不可", () => {
    const result = canApplyJob({
      ...baseParams,
      userAvailableAreas: [],
    });
    expect(result.canApply).toBe(false);
  });
});
