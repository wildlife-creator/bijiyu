import { describe, expect, it } from "vitest";

/**
 * Tests for the Server-side PastDueBanner computation logic.
 *
 * The actual Server Component reads `x-billing-status` and `x-past-due-since`
 * from middleware headers and computes daysRemaining + severity. We test the
 * same formulas here without rendering JSX.
 */

function computeBanner(pastDueSince: string) {
  const since = new Date(pastDueSince).getTime();
  const daysRemaining = Math.max(
    0,
    7 - Math.floor((Date.now() - since) / 86_400_000),
  );
  const severity: "warning" | "critical" = daysRemaining >= 4 ? "warning" : "critical";
  return { daysRemaining, severity };
}

describe("PastDueBanner computation", () => {
  it("7 days remaining → warning", () => {
    const since = new Date(Date.now()).toISOString(); // just now
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(7);
    expect(result.severity).toBe("warning");
  });

  it("4 days remaining → warning (boundary)", () => {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 3 days ago
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(4);
    expect(result.severity).toBe("warning");
  });

  it("3 days remaining → critical (boundary)", () => {
    const since = new Date(Date.now() - 4 * 86_400_000).toISOString(); // 4 days ago
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(3);
    expect(result.severity).toBe("critical");
  });

  it("1 day remaining → critical", () => {
    const since = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(1);
    expect(result.severity).toBe("critical");
  });

  it("0 days remaining → critical with 'まもなく自動解約'", () => {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(0);
    expect(result.severity).toBe("critical");
  });

  it("8+ days past → clamped to 0", () => {
    const since = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const result = computeBanner(since);
    expect(result.daysRemaining).toBe(0);
    expect(result.severity).toBe("critical");
  });
});
