import { describe, expect, it } from "vitest";

import {
  REVIEW_INPUT_GRACE_DAYS,
  computeReviewInputWindow,
  isWithinReviewInputWindow,
  evaluateReviewInputWindow,
  reviewInputWindowMessage,
} from "@/lib/matching";

// JST 正午の Date を生成する（getJstToday が YYYY-MM-DD を安定して返すよう UTC+9 の正午に固定）。
function jstNoon(dateStr: string): Date {
  return new Date(`${dateStr}T03:00:00.000Z`); // 03:00 UTC = 12:00 JST（同一暦日）
}

describe("computeReviewInputWindow", () => {
  it("開始=初回稼働日、終了=稼働終了日+5日 を返す", () => {
    const w = computeReviewInputWindow("2026-07-14", "2026-07-14");
    expect(w.startDate).toBe("2026-07-14");
    expect(w.endDate).toBe("2026-07-19"); // +5日
  });

  it("猶予日数は REVIEW_INPUT_GRACE_DAYS（=5）", () => {
    expect(REVIEW_INPUT_GRACE_DAYS).toBe(5);
    const w = computeReviewInputWindow("2026-07-01", "2026-07-01");
    expect(w.endDate).toBe("2026-07-06");
  });

  it("月またぎの +5日 を正しく計算する", () => {
    const w = computeReviewInputWindow("2026-07-20", "2026-07-29");
    expect(w.endDate).toBe("2026-08-03");
  });

  it("firstWorkDate が NULL なら startDate は null（開始ガードなし）", () => {
    const w = computeReviewInputWindow(null, "2026-07-14");
    expect(w.startDate).toBeNull();
    expect(w.endDate).toBe("2026-07-19");
  });

  it("workEndDate が NULL なら endDate は null（終了ガードなし）", () => {
    const w = computeReviewInputWindow("2026-07-14", null);
    expect(w.startDate).toBe("2026-07-14");
    expect(w.endDate).toBeNull();
  });
});

describe("isWithinReviewInputWindow（境界値）", () => {
  const window = { startDate: "2026-07-10", endDate: "2026-07-19" }; // 稼働終了7/14 +5日

  it("開始日の前日は before-start", () => {
    const r = isWithinReviewInputWindow("2026-07-09", window);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("before-start");
  });

  it("開始日当日は入力可（inclusive）", () => {
    const r = isWithinReviewInputWindow("2026-07-10", window);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("期間中の日は入力可", () => {
    expect(isWithinReviewInputWindow("2026-07-15", window).allowed).toBe(true);
  });

  it("終了日当日（+5日目）は入力可（inclusive）", () => {
    const r = isWithinReviewInputWindow("2026-07-19", window);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("終了日の翌日（+6日目）は after-end", () => {
    const r = isWithinReviewInputWindow("2026-07-20", window);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("after-end");
  });

  it("startDate が null なら開始ガードをスキップ（過去日でも可）", () => {
    const r = isWithinReviewInputWindow("2000-01-01", {
      startDate: null,
      endDate: "2026-07-19",
    });
    expect(r.allowed).toBe(true);
  });

  it("endDate が null なら終了ガードをスキップ（未来日でも可）", () => {
    const r = isWithinReviewInputWindow("2999-01-01", {
      startDate: "2026-07-10",
      endDate: null,
    });
    expect(r.allowed).toBe(true);
  });

  it("両方 null なら常に入力可", () => {
    const r = isWithinReviewInputWindow("2026-07-15", {
      startDate: null,
      endDate: null,
    });
    expect(r.allowed).toBe(true);
  });
});

describe("evaluateReviewInputWindow（now → JST 暦日で判定）", () => {
  const params = {
    firstWorkDate: "2026-07-10",
    workEndDate: "2026-07-14", // +5日 → 7/19 まで
  };

  it("初回稼働日当日は入力可", () => {
    const r = evaluateReviewInputWindow({ ...params, now: jstNoon("2026-07-10") });
    expect(r.allowed).toBe(true);
    expect(r.startDate).toBe("2026-07-10");
    expect(r.endDate).toBe("2026-07-19");
  });

  it("初回稼働日の前日は before-start", () => {
    const r = evaluateReviewInputWindow({ ...params, now: jstNoon("2026-07-09") });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("before-start");
  });

  it("稼働終了+5日当日は入力可、翌日は after-end", () => {
    expect(
      evaluateReviewInputWindow({ ...params, now: jstNoon("2026-07-19") }).allowed,
    ).toBe(true);
    const after = evaluateReviewInputWindow({
      ...params,
      now: jstNoon("2026-07-20"),
    });
    expect(after.allowed).toBe(false);
    expect(after.reason).toBe("after-end");
  });
});

describe("reviewInputWindowMessage", () => {
  it("入力可のときは null", () => {
    const r = evaluateReviewInputWindow({
      firstWorkDate: "2026-07-10",
      workEndDate: "2026-07-14",
      now: jstNoon("2026-07-12"),
    });
    expect(reviewInputWindowMessage(r)).toBeNull();
  });

  it("開始前は初回稼働日を含む案内文言を返す", () => {
    const r = evaluateReviewInputWindow({
      firstWorkDate: "2026-07-10",
      workEndDate: "2026-07-14",
      now: jstNoon("2026-07-01"),
    });
    const msg = reviewInputWindowMessage(r);
    expect(msg).toContain("初回稼働日");
    expect(msg).toContain("2026/07/10");
  });

  it("終了後は入力期限（YYYY/MM/DD）を含む案内文言を返す", () => {
    const r = evaluateReviewInputWindow({
      firstWorkDate: "2026-07-10",
      workEndDate: "2026-07-14",
      now: jstNoon("2026-08-01"),
    });
    const msg = reviewInputWindowMessage(r);
    expect(msg).toContain("入力期間");
    expect(msg).toContain("2026/07/19"); // 稼働終了7/14 +5日
  });
});
