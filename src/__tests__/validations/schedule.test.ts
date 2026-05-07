import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleSchema } from "@/lib/validations/schedule";

describe("scheduleSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid future range", () => {
    const result = scheduleSchema.safeParse({
      startDate: "2030-07-01",
      endDate: "2030-07-05",
    });
    expect(result.success).toBe(true);
  });

  it("accepts startDate equal to endDate (single day)", () => {
    const result = scheduleSchema.safeParse({
      startDate: "2030-07-01",
      endDate: "2030-07-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects startDate before today", () => {
    const result = scheduleSchema.safeParse({
      startDate: "2030-06-14",
      endDate: "2030-06-20",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("今日以降"))).toBe(true);
    }
  });

  it("rejects endDate before startDate", () => {
    const result = scheduleSchema.safeParse({
      startDate: "2030-07-05",
      endDate: "2030-07-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("開始日以降"))).toBe(true);
    }
  });

  it("rejects malformed startDate", () => {
    const result = scheduleSchema.safeParse({
      startDate: "07/01/2030",
      endDate: "2030-07-05",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty inputs", () => {
    const result = scheduleSchema.safeParse({
      startDate: "",
      endDate: "",
    });
    expect(result.success).toBe(false);
  });
});
