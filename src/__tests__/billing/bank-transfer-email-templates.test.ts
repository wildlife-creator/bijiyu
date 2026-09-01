import { describe, expect, it } from "vitest";

import { bankTransferRequestedEmail } from "@/lib/email/templates/bank-transfer-requested";
import { bankTransferRequestedOpsEmail } from "@/lib/email/templates/bank-transfer-requested-ops";

/**
 * 銀行振込（P2）の申込メール 2 種。
 * - 申込者控え: 金額・振込先・支払期限を書かない（請求書側を正とする方針）
 * - 運営宛: 請求書作成に必要な情報（申込者・対象・金額内訳）と管理画面 deep link
 */

describe("bankTransferRequestedEmail（申込者控え）", () => {
  const out = bankTransferRequestedEmail({
    recipientName: "振込商店",
    targetLabel: "スタンダードプラン（月払い）",
    requestedAt: "2026/09/01 10:30",
  });

  it("件名は「銀行振込でのお申し込みを受け付けました」", () => {
    expect(out.subject).toBe("【ビジ友】銀行振込でのお申し込みを受け付けました");
  });

  it("宛名・対象・日時・請求書送付と入金確認後の開始を案内する", () => {
    expect(out.html).toContain("振込商店 様");
    expect(out.html).toContain("スタンダードプラン（月払い）");
    expect(out.html).toContain("2026/09/01 10:30");
    expect(out.html).toContain("担当より請求書をお送りします");
    expect(out.html).toContain("ご入金の確認後にご利用開始");
  });

  it("金額・振込先・支払期限は含まない（アプリで管理しない）", () => {
    expect(out.html).not.toMatch(/円/);
    expect(out.html).not.toContain("口座");
    expect(out.html).not.toContain("支払期限");
  });
});

describe("bankTransferRequestedOpsEmail（運営宛）", () => {
  const base = {
    applicantName: "振込一郎",
    companyName: "振込商店",
    applicantEmail: "bank@test.local",
    requestedAt: "2026/09/01 10:30",
    targetLabel: "ライトプラン（月払い）",
    amount: 3800,
    initialFee: 20000,
    requestId: "ba100000-0000-4000-8000-00000000dd03",
    siteUrl: "https://staging.bijiyuu.net",
  };

  it("件名に「【ビジ友 運営】」と請求書送付の依頼を含む", () => {
    const out = bankTransferRequestedOpsEmail(base);
    expect(out.subject).toBe(
      "【ビジ友 運営】銀行振込のお申し込みがありました（請求書の送付をお願いします）",
    );
  });

  it("申込者・会社名・メール・対象・金額内訳（本体 / 初回事務手数料 / 合計）・deep link を含む", () => {
    const out = bankTransferRequestedOpsEmail(base);
    expect(out.html).toContain("振込一郎");
    expect(out.html).toContain("振込商店");
    expect(out.html).toContain("bank@test.local");
    expect(out.html).toContain("ライトプラン（月払い）");
    expect(out.html).toContain("3,800円（税込）");
    expect(out.html).toContain("初回事務手数料");
    expect(out.html).toContain("20,000円（税込）");
    expect(out.html).toContain("23,800円（税込）");
    expect(out.html).toContain(
      "https://staging.bijiyuu.net/admin/bank-transfers/ba100000-0000-4000-8000-00000000dd03",
    );
    expect(out.html).toContain("ログインした状態でクリックしてください");
  });

  it("会社名 null・初回事務手数料 0 のときは該当行を省略する", () => {
    const out = bankTransferRequestedOpsEmail({
      ...base,
      companyName: null,
      initialFee: 0,
      targetLabel: "職場紹介動画",
      amount: 100000,
    });
    expect(out.html).not.toContain("会社名");
    expect(out.html).not.toContain("初回事務手数料");
    expect(out.html).toContain("100,000円（税込）");
  });
});
