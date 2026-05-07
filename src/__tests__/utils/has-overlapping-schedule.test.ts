import { describe, expect, it } from "vitest";

import {
  hasOverlappingSchedule,
  type ScheduleRow,
} from "@/lib/utils/has-overlapping-schedule";

const row = (
  id: string,
  start_date: string,
  end_date: string,
): ScheduleRow => ({ id, start_date, end_date });

describe("hasOverlappingSchedule", () => {
  it("returns false when there are no existing schedules", () => {
    expect(
      hasOverlappingSchedule([], { start_date: "2030-01-01", end_date: "2030-01-05" }),
    ).toBe(false);
  });

  it("detects exact same period as overlap", () => {
    const existing = [row("a", "2030-01-01", "2030-01-05")];
    expect(
      hasOverlappingSchedule(existing, {
        start_date: "2030-01-01",
        end_date: "2030-01-05",
      }),
    ).toBe(true);
  });

  it("detects 1-day partial overlap", () => {
    const existing = [row("a", "2030-01-01", "2030-01-05")];
    expect(
      hasOverlappingSchedule(existing, {
        start_date: "2030-01-05",
        end_date: "2030-01-10",
      }),
    ).toBe(true);
  });

  it("returns false when periods are adjacent with 1-day gap", () => {
    const existing = [row("a", "2030-01-01", "2030-01-05")];
    expect(
      hasOverlappingSchedule(existing, {
        start_date: "2030-01-07",
        end_date: "2030-01-10",
      }),
    ).toBe(false);
  });

  it("returns false when candidate ends before existing starts", () => {
    const existing = [row("a", "2030-02-01", "2030-02-05")];
    expect(
      hasOverlappingSchedule(existing, {
        start_date: "2030-01-01",
        end_date: "2030-01-31",
      }),
    ).toBe(false);
  });

  it("excludes the row matching excludeId from overlap evaluation", () => {
    const existing = [
      row("self", "2030-01-01", "2030-01-05"),
      row("other", "2030-02-01", "2030-02-05"),
    ];
    expect(
      hasOverlappingSchedule(
        existing,
        { start_date: "2030-01-01", end_date: "2030-01-05" },
        { excludeId: "self" },
      ),
    ).toBe(false);
  });

  it("still detects overlap from non-excluded rows", () => {
    const existing = [
      row("self", "2030-01-01", "2030-01-05"),
      row("other", "2030-01-04", "2030-01-10"),
    ];
    expect(
      hasOverlappingSchedule(
        existing,
        { start_date: "2030-01-01", end_date: "2030-01-05" },
        { excludeId: "self" },
      ),
    ).toBe(true);
  });
});
