import { describe, expect, it } from "vitest";

import { canApplyJob } from "@/lib/matching";

/**
 * master-area: canApplyJob は `jobPrefectures` を配列で受け取り、ユーザーの登録
 * 県のいずれかと一致すれば応募可能 (OR 一致)。
 * 案件の市区町村 (job_areas.municipality) は判定に使わない (CLAUDE.md ルール、
 * Req 7.4 = マッチングは都道府県のまま)。
 */

const baseUserSkills = [{ tradeType: "建築/躯体｜大工" }];
const baseJobTradeTypes = ["建築/躯体｜大工"];

describe("canApplyJob — 有料ユーザーの bypass", () => {
  it("isPaidUser=true なら他条件不問で応募可", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: true,
      jobTradeTypes: ["建築/廃止｜旧職種"],
      jobPrefectures: ["北海道"],
      userSkills: [],
      userAvailableAreas: [],
    });
    expect(result).toEqual({ canApply: true });
  });

  it("発注者 (role=client) の有料相当も bypass", () => {
    const result = canApplyJob({
      userRole: "client",
      isPaidUser: true,
      jobTradeTypes: ["架空職種"],
      jobPrefectures: ["架空県"],
      userSkills: [],
      userAvailableAreas: [],
    });
    expect(result).toEqual({ canApply: true });
  });
});

describe("canApplyJob — jobPrefectures 配列 OR 一致 (Req 7)", () => {
  it("案件 1 県のみ・登録県と一致 → 応募可", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: ["東京都"],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "東京都" }],
    });
    expect(result).toEqual({ canApply: true });
  });

  it("案件 2 県・どちらかが登録県に含まれる → 応募可 (OR)", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: ["東京都", "神奈川県"],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "神奈川県" }],
    });
    expect(result).toEqual({ canApply: true });
  });

  it("案件 2 県・どちらも登録県に含まれない → 応募不可", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: ["東京都", "神奈川県"],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "北海道" }],
    });
    expect(result.canApply).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("案件 jobPrefectures が空配列 → 応募不可", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: [],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "東京都" }],
    });
    expect(result.canApply).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("canApplyJob — 市区町村レベルの判定は行わない (Req 7.4)", () => {
  it("案件が同県のみマッチして municipality 情報を持っていても都道府県だけで判定", () => {
    // jobPrefectures は重複した「東京都」を 3 つ持つこともあるが、結果は同じ
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: ["東京都", "東京都", "東京都"],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "東京都" }],
    });
    expect(result).toEqual({ canApply: true });
  });
});

describe("canApplyJob — エリア一致なしの拒否", () => {
  it("職種マッチするが、エリア不一致 → 拒否", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: baseJobTradeTypes,
      jobPrefectures: ["東京都"],
      userSkills: baseUserSkills,
      userAvailableAreas: [{ prefecture: "北海道" }],
    });
    expect(result.canApply).toBe(false);
  });

  it("エリアマッチするが、職種不一致 → 拒否", () => {
    const result = canApplyJob({
      userRole: "contractor",
      isPaidUser: false,
      jobTradeTypes: ["建築/仕上げ｜塗装工"],
      jobPrefectures: ["東京都"],
      userSkills: baseUserSkills, // 大工のみ
      userAvailableAreas: [{ prefecture: "東京都" }],
    });
    expect(result.canApply).toBe(false);
  });
});
