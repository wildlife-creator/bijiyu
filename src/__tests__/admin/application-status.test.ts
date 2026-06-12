import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_APPLICATION_CATEGORY_LABELS,
  applyCategoryFilter,
  canAdminCancel,
  classifyAdminApplication,
  type AdminApplicationCategory,
} from "@/lib/admin/application-status";

const TODAY = "2026-06-12";
const YESTERDAY = "2026-06-11";
const TOMORROW = "2026-06-13";

describe("classifyAdminApplication（8分類×境界値）", () => {
  it("applied → 応募中", () => {
    expect(
      classifyAdminApplication(
        { status: "applied", first_work_date: null, cancelled_by: null },
        TODAY,
      ),
    ).toBe("applied");
  });

  it("accepted + 初回稼働日が当日 → 発注済み・初回稼働日前", () => {
    expect(
      classifyAdminApplication(
        { status: "accepted", first_work_date: TODAY, cancelled_by: null },
        TODAY,
      ),
    ).toBe("accepted_before_start");
  });

  it("accepted + 初回稼働日が翌日 → 発注済み・初回稼働日前", () => {
    expect(
      classifyAdminApplication(
        { status: "accepted", first_work_date: TOMORROW, cancelled_by: null },
        TODAY,
      ),
    ).toBe("accepted_before_start");
  });

  it("accepted + 初回稼働日 null（未確定）→ 発注済み・初回稼働日前", () => {
    expect(
      classifyAdminApplication(
        { status: "accepted", first_work_date: null, cancelled_by: null },
        TODAY,
      ),
    ).toBe("accepted_before_start");
  });

  it("accepted + 初回稼働日が前日（経過済み）→ 評価未入力", () => {
    expect(
      classifyAdminApplication(
        { status: "accepted", first_work_date: YESTERDAY, cancelled_by: null },
        TODAY,
      ),
    ).toBe("review_pending");
  });

  it("completed → 取引完了", () => {
    expect(
      classifyAdminApplication(
        { status: "completed", first_work_date: YESTERDAY, cancelled_by: null },
        TODAY,
      ),
    ).toBe("completed");
  });

  it("lost → 取引不成立", () => {
    expect(
      classifyAdminApplication(
        { status: "lost", first_work_date: YESTERDAY, cancelled_by: null },
        TODAY,
      ),
    ).toBe("lost");
  });

  it("cancelled + cancelled_by=contractor → ユーザー側からのキャンセル", () => {
    expect(
      classifyAdminApplication(
        { status: "cancelled", first_work_date: null, cancelled_by: "contractor" },
        TODAY,
      ),
    ).toBe("cancelled_by_contractor");
  });

  it("cancelled + cancelled_by=null（旧データ）→ ユーザー側からのキャンセル", () => {
    expect(
      classifyAdminApplication(
        { status: "cancelled", first_work_date: null, cancelled_by: null },
        TODAY,
      ),
    ).toBe("cancelled_by_contractor");
  });

  it("cancelled + cancelled_by=admin → 運営によるキャンセル", () => {
    expect(
      classifyAdminApplication(
        { status: "cancelled", first_work_date: null, cancelled_by: "admin" },
        TODAY,
      ),
    ).toBe("cancelled_by_admin");
  });

  it("rejected → 発注側からのお断り", () => {
    expect(
      classifyAdminApplication(
        { status: "rejected", first_work_date: null, cancelled_by: null },
        TODAY,
      ),
    ).toBe("rejected");
  });
});

describe("ADMIN_APPLICATION_CATEGORY_LABELS", () => {
  it("8分類すべてに日本語ラベルがある", () => {
    expect(ADMIN_APPLICATION_CATEGORY_LABELS).toEqual({
      applied: "応募中",
      accepted_before_start: "発注済み・初回稼働日前",
      review_pending: "評価未入力",
      completed: "取引完了",
      lost: "取引不成立",
      cancelled_by_contractor: "ユーザー側からのキャンセル",
      cancelled_by_admin: "運営によるキャンセル",
      rejected: "発注側からのお断り",
    });
  });
});

describe("applyCategoryFilter（フィルタ用 WHERE 変換）", () => {
  function makeQuery() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const query = {
      eq: vi.fn((...args: unknown[]) => {
        calls.push({ method: "eq", args });
        return query;
      }),
      lt: vi.fn((...args: unknown[]) => {
        calls.push({ method: "lt", args });
        return query;
      }),
      or: vi.fn((...args: unknown[]) => {
        calls.push({ method: "or", args });
        return query;
      }),
      _calls: calls,
    };
    return query;
  }

  it("applied: status=applied のみ", () => {
    const q = makeQuery();
    applyCategoryFilter(q, "applied", TODAY);
    expect(q._calls).toEqual([{ method: "eq", args: ["status", "applied"] }]);
  });

  it("accepted_before_start: accepted かつ（null または当日以降）", () => {
    const q = makeQuery();
    applyCategoryFilter(q, "accepted_before_start", TODAY);
    expect(q.eq).toHaveBeenCalledWith("status", "accepted");
    expect(q.or).toHaveBeenCalledWith(
      `first_work_date.is.null,first_work_date.gte.${TODAY}`,
    );
  });

  it("review_pending: accepted かつ初回稼働日が当日より前", () => {
    const q = makeQuery();
    applyCategoryFilter(q, "review_pending", TODAY);
    expect(q.eq).toHaveBeenCalledWith("status", "accepted");
    expect(q.lt).toHaveBeenCalledWith("first_work_date", TODAY);
  });

  it("completed / lost / rejected: status の単純一致", () => {
    for (const category of ["completed", "lost", "rejected"] as const) {
      const q = makeQuery();
      applyCategoryFilter(q, category, TODAY);
      expect(q._calls).toEqual([{ method: "eq", args: ["status", category] }]);
    }
  });

  it("cancelled_by_contractor: cancelled かつ（contractor または null）", () => {
    const q = makeQuery();
    applyCategoryFilter(q, "cancelled_by_contractor", TODAY);
    expect(q.eq).toHaveBeenCalledWith("status", "cancelled");
    expect(q.or).toHaveBeenCalledWith(
      "cancelled_by.eq.contractor,cancelled_by.is.null",
    );
  });

  it("cancelled_by_admin: cancelled かつ cancelled_by=admin", () => {
    const q = makeQuery();
    applyCategoryFilter(q, "cancelled_by_admin", TODAY);
    expect(q.eq).toHaveBeenCalledWith("status", "cancelled");
    expect(q.eq).toHaveBeenCalledWith("cancelled_by", "admin");
  });

  it("classifyAdminApplication と applyCategoryFilter の分類キーが一致する", () => {
    const categories: AdminApplicationCategory[] = [
      "applied",
      "accepted_before_start",
      "review_pending",
      "completed",
      "lost",
      "cancelled_by_contractor",
      "cancelled_by_admin",
      "rejected",
    ];
    for (const category of categories) {
      const q = makeQuery();
      // どの分類でも例外なく WHERE 変換できる
      expect(() => applyCategoryFilter(q, category, TODAY)).not.toThrow();
      expect(q._calls.length).toBeGreaterThan(0);
    }
  });
});

describe("canAdminCancel（発注取消可否）", () => {
  it("accepted + 初回稼働日 null → 取消可", () => {
    expect(
      canAdminCancel({ status: "accepted", first_work_date: null }, TODAY),
    ).toBe(true);
  });

  it("accepted + 初回稼働日が当日 → 取消可", () => {
    expect(
      canAdminCancel({ status: "accepted", first_work_date: TODAY }, TODAY),
    ).toBe(true);
  });

  it("accepted + 初回稼働日が翌日 → 取消可", () => {
    expect(
      canAdminCancel({ status: "accepted", first_work_date: TOMORROW }, TODAY),
    ).toBe(true);
  });

  it("accepted + 初回稼働日が前日（経過済み）→ 取消不可", () => {
    expect(
      canAdminCancel({ status: "accepted", first_work_date: YESTERDAY }, TODAY),
    ).toBe(false);
  });

  it("applied / completed / cancelled 等 accepted 以外 → 取消不可", () => {
    for (const status of [
      "applied",
      "completed",
      "lost",
      "cancelled",
      "rejected",
    ] as const) {
      expect(canAdminCancel({ status, first_work_date: null }, TODAY)).toBe(
        false,
      );
    }
  });
});
