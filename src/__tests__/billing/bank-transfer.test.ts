import { describe, expect, it } from "vitest";

import {
  BANK_TRANSFER_CONTACT_MESSAGE,
  BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE,
  dateStringToJstIso,
  isoToJstDateString,
  todayJstDateString,
} from "@/lib/billing/bank-transfer";

/**
 * 銀行振込の共通ヘルパー（P12 で縮小。申込・金額・期限の純粋ロジックは廃止）。
 * 残っているのは案内文の定数と、管理運営アカウントの契約付与で使う暦日ヘルパー。
 */

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

  it("todayJstDateString は与えた時刻の JST 暦日を返す", () => {
    expect(todayJstDateString(new Date("2026-12-31T15:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("案内文", () => {
  it("銀行振込中の変更・解約は運営へ、申込はお問い合わせへ誘導する", () => {
    expect(BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE).toContain("運営までご連絡ください");
    expect(BANK_TRANSFER_CONTACT_MESSAGE).toContain("お問い合わせください");
  });
});
