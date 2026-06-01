import { describe, expect, it } from "vitest";
import {
  contractorReportSchema,
  clientReportSchema,
  acceptApplicationSchema,
  mapOperatingStatusToApplicationStatus,
} from "@/lib/validations/matching";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("contractorReportSchema", () => {
  const validData = {
    applicationId: VALID_UUID,
    operatingStatus: "問題なく稼働完了",
    ratingAgain: "good",
  };

  it("正常なデータはバリデーションを通過する", () => {
    const result = contractorReportSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("statusSupplement と comment は省略可能", () => {
    const result = contractorReportSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("statusSupplement と comment を含めても通過する", () => {
    const result = contractorReportSchema.safeParse({
      ...validData,
      statusSupplement: "問題なく完了",
      comment: "丁寧な対応でした",
    });
    expect(result.success).toBe(true);
  });

  it("applicationId が UUID でなければエラー", () => {
    const result = contractorReportSchema.safeParse({
      ...validData,
      applicationId: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("operatingStatus が6選択肢以外はエラー", () => {
    const result = contractorReportSchema.safeParse({
      ...validData,
      operatingStatus: "applied",
    });
    expect(result.success).toBe(false);
  });

  it("ratingAgain が good/bad 以外はエラー", () => {
    const result = contractorReportSchema.safeParse({
      ...validData,
      ratingAgain: "neutral",
    });
    expect(result.success).toBe(false);
  });

  it("全6選択肢が通過する", () => {
    const options = [
      "問題なく稼働完了",
      "一部欠席したものの概ね問題なく稼働完了",
      "欠席（連絡あり）",
      "欠席（連絡なし）",
      "発注者側からお断り",
      "その他",
    ];
    for (const opt of options) {
      const result = contractorReportSchema.safeParse({
        ...validData,
        operatingStatus: opt,
      });
      expect(result.success).toBe(true);
    }
  });

  it("ratingAgain が bad でも通過する", () => {
    const result = contractorReportSchema.safeParse({
      ...validData,
      ratingAgain: "bad",
    });
    expect(result.success).toBe(true);
  });
});

describe("mapOperatingStatusToApplicationStatus", () => {
  it("「問題なく稼働完了」は completed にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("問題なく稼働完了")).toBe("completed");
  });

  it("「一部欠席したものの概ね問題なく稼働完了」は completed にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("一部欠席したものの概ね問題なく稼働完了")).toBe("completed");
  });

  it("「欠席（連絡あり）」は lost にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("欠席（連絡あり）")).toBe("lost");
  });

  it("「欠席（連絡なし）」は lost にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("欠席（連絡なし）")).toBe("lost");
  });

  it("「発注者側からお断り」は lost にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("発注者側からお断り")).toBe("lost");
  });

  it("「その他」は lost にマッピングされる", () => {
    expect(mapOperatingStatusToApplicationStatus("その他")).toBe("lost");
  });
});

describe("clientReportSchema（7項目★×5）", () => {
  const validData = {
    applicationId: VALID_UUID,
    operatingStatus: "問題なく稼働完了",
    ratingOverall: 5,
    ratingPunctual: 4,
    ratingFollowsInstructions: 5,
    ratingSpeed: 3,
    ratingQuality: 4,
    ratingHasTools: 5,
    ratingHasSpecialEquipment: 2,
  };

  it("総合評価のみ必須、任意6項目を埋めても通過する", () => {
    const result = clientReportSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("総合評価(ratingOverall)が未入力ならエラー", () => {
    const { ratingOverall: _omit, ...missing } = validData;
    const result = clientReportSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("任意6項目は省略しても通過し null になる", () => {
    const result = clientReportSchema.safeParse({
      applicationId: VALID_UUID,
      operatingStatus: "問題なく稼働完了",
      ratingOverall: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ratingPunctual).toBeNull();
      expect(result.data.ratingHasSpecialEquipment).toBeNull();
    }
  });

  it("任意項目の空文字は null に変換される（preprocess）", () => {
    const result = clientReportSchema.safeParse({
      applicationId: VALID_UUID,
      operatingStatus: "問題なく稼働完了",
      ratingOverall: 4,
      ratingPunctual: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ratingPunctual).toBeNull();
  });

  it("数値文字列 \"3\" は coerce で 3 になる", () => {
    const result = clientReportSchema.safeParse({
      ...validData,
      ratingOverall: "3",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ratingOverall).toBe(3);
  });

  it("1〜5 範囲外（0 / 6）はエラー", () => {
    expect(
      clientReportSchema.safeParse({ ...validData, ratingOverall: 0 }).success,
    ).toBe(false);
    expect(
      clientReportSchema.safeParse({ ...validData, ratingOverall: 6 }).success,
    ).toBe(false);
    expect(
      clientReportSchema.safeParse({ ...validData, ratingSpeed: 6 }).success,
    ).toBe(false);
  });

  it("comment を含めても通過する", () => {
    const result = clientReportSchema.safeParse({
      ...validData,
      comment: "素晴らしい作業でした",
    });
    expect(result.success).toBe(true);
  });
});

describe("acceptApplicationSchema", () => {
  const validData = {
    applicationId: VALID_UUID,
    workLocation: "東京都渋谷区1-1-1",
    firstWorkDate: "2026-04-15",
  };

  it("正常なデータはバリデーションを通過する", () => {
    const result = acceptApplicationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("applicationId が UUID でなければエラー", () => {
    const result = acceptApplicationSchema.safeParse({
      ...validData,
      applicationId: "not-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("firstWorkDate が空文字ならエラー", () => {
    const result = acceptApplicationSchema.safeParse({
      ...validData,
      firstWorkDate: "",
    });
    expect(result.success).toBe(false);
  });

  it("firstWorkDate が無効な日付ならエラー", () => {
    const result = acceptApplicationSchema.safeParse({
      ...validData,
      firstWorkDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});
