import { describe, expect, it } from "vitest";

import { formatRewardRange } from "@/lib/utils/format-reward";

describe("formatRewardRange", () => {
  it("下限 + 上限の両方ある場合は「L円〜U円（人工）」を返す", () => {
    expect(formatRewardRange(26000, 32000)).toBe(
      "26,000円〜32,000円（人工）",
    );
  });

  it("下限のみの場合は「L円〜（人工）」を返す（公開済では稀）", () => {
    expect(formatRewardRange(26000, null)).toBe("26,000円〜（人工）");
  });

  it("上限のみの場合は「U円（人工）」を返す（上限を代表値として単体表示）", () => {
    expect(formatRewardRange(null, 32000)).toBe("32,000円（人工）");
  });

  it("両方とも null の場合は emptyLabel (デフォルト null) を返す", () => {
    expect(formatRewardRange(null, null)).toBeNull();
  });

  it("emptyLabel を指定するとそれを返す", () => {
    expect(formatRewardRange(null, null, { emptyLabel: "要相談" })).toBe(
      "要相談",
    );
  });

  it("undefined も null と同等に扱う", () => {
    expect(formatRewardRange(undefined, undefined)).toBeNull();
    expect(formatRewardRange(26000, undefined)).toBe("26,000円〜（人工）");
  });

  it("toLocaleString でカンマ区切りされる", () => {
    expect(formatRewardRange(1000000, 2000000)).toBe(
      "1,000,000円〜2,000,000円（人工）",
    );
  });
});
