import { describe, it, expect } from "vitest";
import type Stripe from "stripe";

import {
  extractPeriodEnd,
  extractPeriodStart,
} from "@/lib/billing/subscription-periods";

const toUnix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("subscription-periods", () => {
  it("item 階層の current_period_end を読む（新 API version）", () => {
    const sub = {
      items: { data: [{ current_period_end: toUnix("2026-10-01T00:00:00Z") }] },
    } as unknown as Stripe.Subscription;
    expect(extractPeriodEnd(sub)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("item 階層が無ければ本体階層へフォールバックする（旧 API version の Webhook payload 対策）", () => {
    const sub = {
      current_period_end: toUnix("2026-10-01T00:00:00Z"),
      items: { data: [] },
    } as unknown as Stripe.Subscription;
    expect(extractPeriodEnd(sub)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("start も item 優先 + 本体フォールバック", () => {
    const itemSub = {
      items: {
        data: [{ current_period_start: toUnix("2026-09-01T00:00:00Z") }],
      },
    } as unknown as Stripe.Subscription;
    expect(extractPeriodStart(itemSub)).toBe("2026-09-01T00:00:00.000Z");

    const topSub = {
      current_period_start: toUnix("2026-09-01T00:00:00Z"),
      items: { data: [] },
    } as unknown as Stripe.Subscription;
    expect(extractPeriodStart(topSub)).toBe("2026-09-01T00:00:00.000Z");
  });

  it("どちらにも無ければ null", () => {
    const sub = { items: { data: [] } } as unknown as Stripe.Subscription;
    expect(extractPeriodEnd(sub)).toBeNull();
    expect(extractPeriodStart(sub)).toBeNull();
  });
});
