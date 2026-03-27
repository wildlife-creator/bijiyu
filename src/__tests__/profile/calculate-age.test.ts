import { describe, expect, it, vi, afterEach } from "vitest";

import { calculateAge } from "@/lib/utils/calculate-age";

describe("calculateAge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates age correctly for a past birthday this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15"));

    expect(calculateAge("1996-03-10")).toBe(30);
  });

  it("calculates age correctly before birthday this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01"));

    expect(calculateAge("1996-03-10")).toBe(29);
  });

  it("calculates age correctly on birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10"));

    expect(calculateAge("1996-03-10")).toBe(30);
  });

  it("calculates age correctly the day before birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09"));

    expect(calculateAge("1996-03-10")).toBe(29);
  });

  it("calculates age correctly the day after birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11"));

    expect(calculateAge("1996-03-10")).toBe(30);
  });

  it("handles leap year birthday (Feb 29) on non-leap year", () => {
    vi.useFakeTimers();
    // 2026 is not a leap year, March 1 should be after Feb 29 birthday
    vi.setSystemTime(new Date("2026-03-01"));

    expect(calculateAge("2000-02-29")).toBe(26);
  });

  it("handles leap year birthday (Feb 29) on Feb 28 non-leap year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28"));

    expect(calculateAge("2000-02-29")).toBe(25);
  });

  it("calculates age for newborn (same year)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31"));

    expect(calculateAge("2026-01-01")).toBe(0);
  });

  it("handles January 1 birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));

    expect(calculateAge("1990-01-01")).toBe(36);
  });

  it("handles December 31 birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31"));

    expect(calculateAge("1990-12-31")).toBe(36);
  });
});
