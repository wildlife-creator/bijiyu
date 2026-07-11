import { describe, expect, it } from "vitest";

import {
  CONTRACTOR_CANCEL_CUTOFF_DAYS,
  canContractorCancel,
} from "@/lib/matching";

describe("canContractorCancel（発注確定後キャンセルの可否・5日前ルール）", () => {
  it("猶予日数は 5", () => {
    expect(CONTRACTOR_CANCEL_CUTOFF_DAYS).toBe(5);
  });

  // ユーザー指定の具体例: 初回稼働 11/22 → 11/17 まで可、11/18 以降不可
  const fwd = "2026-11-22";

  it("初回稼働日の5日前の当日（11/17）は終日キャンセル可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: fwd }, "2026-11-17")).toBe(true);
  });

  it("5日前より前（11/16, 11/10）は可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: fwd }, "2026-11-16")).toBe(true);
    expect(canContractorCancel({ status: "accepted", first_work_date: fwd }, "2026-11-10")).toBe(true);
  });

  it("5日前の翌日（11/18）はキャンセル不可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: fwd }, "2026-11-18")).toBe(false);
  });

  it("初回稼働日当日（11/22）はキャンセル不可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: fwd }, "2026-11-22")).toBe(false);
  });

  it("月またぎ: 初回稼働 12/03 → 11/28 まで可、11/29 不可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: "2026-12-03" }, "2026-11-28")).toBe(true);
    expect(canContractorCancel({ status: "accepted", first_work_date: "2026-12-03" }, "2026-11-29")).toBe(false);
  });

  it("初回稼働日が未設定（null）なら日付制限なしで可", () => {
    expect(canContractorCancel({ status: "accepted", first_work_date: null }, "2026-11-22")).toBe(true);
  });

  it("accepted 以外のステータスは不可", () => {
    for (const status of ["applied", "completed", "lost", "cancelled", "rejected"]) {
      expect(canContractorCancel({ status, first_work_date: fwd }, "2026-11-01")).toBe(false);
    }
  });
});
