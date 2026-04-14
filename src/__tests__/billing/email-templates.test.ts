import { describe, expect, it } from "vitest";

import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { subscriptionChangedEmail } from "@/lib/email/templates/subscription-changed";

const props = {
  recipientName: "山田太郎",
  serviceUrl: "https://example.test",
};

describe("paymentFailedEmail", () => {
  it("subject is the documented Japanese string", () => {
    const out = paymentFailedEmail({
      ...props,
      planName: "個人発注者様向けプラン",
      nextRetryDate: "2026/04/15",
    });
    expect(out.subject).toBe("【ビジ友】お支払いが確認できません");
  });

  it("html includes recipient name, plan name, retry date and update CTA", () => {
    const out = paymentFailedEmail({
      ...props,
      planName: "個人発注者様向けプラン",
      nextRetryDate: "2026/04/15",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("2026/04/15");
    expect(out.html).toContain("お支払い方法を更新する");
    expect(out.html).toContain("https://example.test/billing");
  });
});

describe("subscriptionChangedEmail", () => {
  it("subject is the documented Japanese string", () => {
    const out = subscriptionChangedEmail({
      ...props,
      oldPlanName: "個人発注者様向けプラン",
      newPlanName: "小規模事業主様向けプラン",
      effectiveDate: "ただ今",
    });
    expect(out.subject).toBe("【ビジ友】プラン変更を承りました");
  });

  it("html includes both plan names and effective date label", () => {
    const out = subscriptionChangedEmail({
      ...props,
      oldPlanName: "法人向けプラン",
      newPlanName: "個人発注者様向けプラン",
      effectiveDate: "2026/05/01",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("2026/05/01");
  });
});

describe("subscriptionCancelledEmail", () => {
  it("subject is the documented Japanese string", () => {
    const out = subscriptionCancelledEmail({
      ...props,
      planName: "法人向けプラン",
      cancelledAt: "2026/04/12",
    });
    expect(out.subject).toBe("【ビジ友】解約が完了しました");
  });

  it("html includes plan name and cancelled date", () => {
    const out = subscriptionCancelledEmail({
      ...props,
      planName: "法人向けプラン",
      cancelledAt: "2026/04/12",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("2026/04/12");
    expect(out.html).toContain("プラン案内へ");
  });
});
