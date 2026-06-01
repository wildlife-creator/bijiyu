import { describe, it, expect } from "vitest";
import { judgeHighRating } from "@/lib/rating/judge-high-rating";
import {
  HIGH_RATING_BADGE_MIN_AVG,
  HIGH_RATING_BADGE_MIN_COUNT,
} from "@/lib/constants/rating";

describe("judgeHighRating（境界値）", () => {
  it("閾値定数は 3件 / ★4.0", () => {
    expect(HIGH_RATING_BADGE_MIN_COUNT).toBe(3);
    expect(HIGH_RATING_BADGE_MIN_AVG).toBe(4.0);
  });

  // count 2/3/4 × avg 3.9/4.0/4.1 の全列挙
  const cases: Array<{ avg: number; count: number; expected: boolean }> = [
    { avg: 3.9, count: 2, expected: false },
    { avg: 4.0, count: 2, expected: false },
    { avg: 4.1, count: 2, expected: false },
    { avg: 3.9, count: 3, expected: false },
    { avg: 4.0, count: 3, expected: true },
    { avg: 4.1, count: 3, expected: true },
    { avg: 3.9, count: 4, expected: false },
    { avg: 4.0, count: 4, expected: true },
    { avg: 4.1, count: 4, expected: true },
  ];

  for (const { avg, count, expected } of cases) {
    it(`avg=${avg}, count=${count} → ${expected}`, () => {
      expect(judgeHighRating({ avg, count })).toBe(expected);
    });
  }

  it("avg が null（評価0件）なら false", () => {
    expect(judgeHighRating({ avg: null, count: 0 })).toBe(false);
  });

  it("満点・多件数は true", () => {
    expect(judgeHighRating({ avg: 5.0, count: 12 })).toBe(true);
  });
});
