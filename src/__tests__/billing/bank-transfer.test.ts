import { describe, expect, it } from "vitest";

import {
  BANK_TRANSFER_STATUS_LABELS,
  OPEN_BANK_TRANSFER_STATUSES,
  addBillingCycle,
  computeBankTransferAmount,
  computePeriodEnd,
  dateStringToJstIso,
  deriveExpiryBadge,
  describeBankTransferTarget,
  diffDays,
  isValidDateString,
  isoToJstDateString,
  targetFromRequestRow,
} from "@/lib/billing/bank-transfer";
import { OPTION_PRICES_TAX_INCLUDED } from "@/lib/billing/options";
import {
  INITIAL_FEE_TAX_INCLUDED,
  PLAN_LIMITS,
  YEARLY_PRICE_TAX_INCLUDED,
} from "@/lib/constants/plans";

/**
 * 銀行振込（P2）の純粋ロジック。
 * 金額の組み立て・有効期限の暦日計算・期限バッジ・表示ラベルを検証する。
 */

describe("computeBankTransferAmount", () => {
  it("プラン月払い = 月額（PLAN_LIMITS と一致）、初回は事務手数料を加算", () => {
    const out = computeBankTransferAmount(
      { kind: "plan", planType: "individual", billingCycle: "monthly" },
      { needsInitialFee: true },
    );
    expect(out.amount).toBe(PLAN_LIMITS.individual.monthlyPriceTaxIncluded);
    expect(out.initialFee).toBe(INITIAL_FEE_TAX_INCLUDED);
    expect(out.total).toBe(3800 + 20000);
  });

  it("プラン年払い = 年額（暫定: 月額 × 12）、再契約なら事務手数料なし", () => {
    const out = computeBankTransferAmount(
      { kind: "plan", planType: "corporate", billingCycle: "yearly" },
      { needsInitialFee: false },
    );
    expect(out.amount).toBe(YEARLY_PRICE_TAX_INCLUDED.corporate);
    expect(out.amount).toBe(48000 * 12);
    expect(out.initialFee).toBe(0);
    expect(out.total).toBe(out.amount);
  });

  it("買い切りオプションは単価のみ。needsInitialFee は無視（プラン専用）", () => {
    const out = computeBankTransferAmount(
      { kind: "option", optionType: "video_workplace" },
      { needsInitialFee: true },
    );
    expect(out.amount).toBe(OPTION_PRICES_TAX_INCLUDED.video_workplace);
    expect(out.initialFee).toBe(0);
    expect(out.total).toBe(100000);
  });

  it("ユーザー撮影プラン（P7）は買い切り 20,000 円。事務手数料なし", () => {
    const out = computeBankTransferAmount(
      { kind: "option", optionType: "video_shooting" },
      { needsInitialFee: true },
    );
    expect(out.amount).toBe(OPTION_PRICES_TAX_INCLUDED.video_shooting);
    expect(out.initialFee).toBe(0);
    expect(out.total).toBe(20000);
  });

  it("補償（月額課金型）は年払いで 12 か月分", () => {
    const monthly = computeBankTransferAmount(
      { kind: "option", optionType: "compensation_5000", billingCycle: "monthly" },
      { needsInitialFee: false },
    );
    const yearly = computeBankTransferAmount(
      { kind: "option", optionType: "compensation_5000", billingCycle: "yearly" },
      { needsInitialFee: false },
    );
    expect(monthly.total).toBe(5000);
    expect(yearly.total).toBe(60000);
  });
});

describe("addBillingCycle / computePeriodEnd（暦日）", () => {
  it("月払い: 開始日 + 1 か月の前日が期限（9/15 開始 → 10/14 まで）", () => {
    expect(addBillingCycle("2026-09-15", "monthly")).toBe("2026-10-15");
    expect(computePeriodEnd("2026-09-15", "monthly")).toBe("2026-10-14");
  });

  it("年払い: 開始日 + 1 年の前日が期限", () => {
    expect(addBillingCycle("2026-09-15", "yearly")).toBe("2027-09-15");
    expect(computePeriodEnd("2026-09-15", "yearly")).toBe("2027-09-14");
  });

  it("月末は月末に丸める（1/31 開始 → 2/28 が翌期間開始 → 2/27 まで）", () => {
    expect(addBillingCycle("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(computePeriodEnd("2026-01-31", "monthly")).toBe("2026-02-27");
    // 閏年
    expect(addBillingCycle("2028-01-31", "monthly")).toBe("2028-02-29");
    // 8/31 → 9/30
    expect(addBillingCycle("2026-08-31", "monthly")).toBe("2026-09-30");
  });

  it("年払いの閏日開始は翌年 2/28 に丸める", () => {
    expect(addBillingCycle("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("12 月開始の月払いは翌年 1 月へ繰り上がる", () => {
    expect(addBillingCycle("2026-12-20", "monthly")).toBe("2027-01-20");
    expect(computePeriodEnd("2026-12-20", "monthly")).toBe("2027-01-19");
  });

  it("不正な日付文字列はそのまま返す（呼出側で isValidDateString を先に通す前提）", () => {
    expect(addBillingCycle("2026-13-40", "monthly")).toBe("2026-13-40");
    expect(computePeriodEnd("abc", "yearly")).toBe("abc");
  });
});

describe("isValidDateString", () => {
  it("YYYY-MM-DD かつ実在する日付のみ true", () => {
    expect(isValidDateString("2026-09-01")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false); // 2026 は平年
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026/09/01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("dateStringToJstIso / isoToJstDateString", () => {
  it("開始日は 00:00 JST、終了日は 23:59:59 JST として ISO 化し、JST 暦日に戻せる", () => {
    const start = dateStringToJstIso("2026-09-15", "start");
    const end = dateStringToJstIso("2026-10-14", "end");
    // 2026-09-15T00:00+09:00 = 2026-09-14T15:00Z
    expect(start).toBe("2026-09-14T15:00:00.000Z");
    expect(end).toBe("2026-10-14T14:59:59.000Z");
    expect(isoToJstDateString(start)).toBe("2026-09-15");
    expect(isoToJstDateString(end)).toBe("2026-10-14");
  });

  it("UTC 日付では前日になる時刻も JST の暦日で扱う（本番 UTC サーバーのズレ対策）", () => {
    // 2026-09-30T20:00Z = 2026-10-01T05:00 JST
    expect(isoToJstDateString("2026-09-30T20:00:00.000Z")).toBe("2026-10-01");
  });
});

describe("deriveExpiryBadge（期限バッジ）", () => {
  const today = "2026-09-01";
  it("期限日が過去 → 期限切れ", () => {
    expect(deriveExpiryBadge("2026-08-31", today)).toBe("expired");
  });
  it("当日〜30 日以内 → 期限間近（境界値 0 日 / 30 日を含む）", () => {
    expect(deriveExpiryBadge("2026-09-01", today)).toBe("expiring_soon");
    expect(deriveExpiryBadge("2026-10-01", today)).toBe("expiring_soon");
  });
  it("31 日以上先 → バッジなし", () => {
    expect(deriveExpiryBadge("2026-10-02", today)).toBeNull();
  });
  it("期限未設定 → バッジなし", () => {
    expect(deriveExpiryBadge(null, today)).toBeNull();
  });
  it("diffDays は b - a の日数", () => {
    expect(diffDays("2026-09-01", "2026-09-30")).toBe(29);
    expect(diffDays("2026-09-30", "2026-09-01")).toBe(-29);
  });
});

describe("describeBankTransferTarget / targetFromRequestRow", () => {
  it("プランは「プラン名（月払い/年払い）」、買い切りオプションはオプション名のみ", () => {
    expect(
      describeBankTransferTarget({ kind: "plan", planType: "small", billingCycle: "monthly" }),
    ).toBe("スタンダードプラン（月払い）");
    expect(
      describeBankTransferTarget({ kind: "plan", planType: "corporate_premium", billingCycle: "yearly" }),
    ).toBe("ハイエンドプラン（年払い）");
    expect(describeBankTransferTarget({ kind: "option", optionType: "urgent" })).toBe("急募オプション");
  });

  it("補償（月額課金型）はサイクル付きで表示", () => {
    expect(
      describeBankTransferTarget({
        kind: "option",
        optionType: "compensation_9800",
        billingCycle: "yearly",
      }),
    ).toBe("補償（9,800円/月、最大500万円）（年払い）");
  });

  it("DB 行から対象を復元。不整合行（free / 未知のオプション）は null", () => {
    expect(
      targetFromRequestRow({ target_kind: "plan", plan_type: "individual", option_type: null, billing_cycle: "yearly" }),
    ).toEqual({ kind: "plan", planType: "individual", billingCycle: "yearly" });
    expect(
      targetFromRequestRow({ target_kind: "option", plan_type: null, option_type: "video", billing_cycle: "monthly" }),
    ).toEqual({ kind: "option", optionType: "video", billingCycle: "monthly" });
    expect(
      targetFromRequestRow({ target_kind: "plan", plan_type: "free", option_type: null, billing_cycle: "monthly" }),
    ).toBeNull();
    expect(
      targetFromRequestRow({ target_kind: "option", plan_type: null, option_type: "unknown", billing_cycle: "monthly" }),
    ).toBeNull();
  });
});

describe("状態定数", () => {
  it("処理中とみなす状態は 申込受付 / 請求書送付済 の 2 つ", () => {
    expect(OPEN_BANK_TRANSFER_STATUSES).toEqual(["requested", "invoiced"]);
    expect(BANK_TRANSFER_STATUS_LABELS.requested).toBe("申込受付");
    expect(BANK_TRANSFER_STATUS_LABELS.invoiced).toBe("請求書送付済");
    expect(BANK_TRANSFER_STATUS_LABELS.paid).toBe("入金確認済");
    expect(BANK_TRANSFER_STATUS_LABELS.cancelled).toBe("取消");
  });
});
