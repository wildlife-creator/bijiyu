import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatMessageTime,
  formatBubbleTime,
} from "@/lib/utils/format-message-time";

describe("formatMessageTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("null/undefined は空文字", () => {
    expect(formatMessageTime(null)).toBe("");
    expect(formatMessageTime(undefined)).toBe("");
  });

  it("当日は HH:mm", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:30:00+09:00"));

    const today = new Date("2026-04-07T10:05:00+09:00").toISOString();
    expect(formatMessageTime(today)).toBe("10:05");

    vi.useRealTimers();
  });

  it("同年・別日は MM/DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:30:00+09:00"));

    const sameYear = new Date("2026-03-15T10:00:00+09:00").toISOString();
    expect(formatMessageTime(sameYear)).toBe("03/15");

    vi.useRealTimers();
  });

  it("異年は YYYY/MM/DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:30:00+09:00"));

    const diffYear = new Date("2025-12-25T10:00:00+09:00").toISOString();
    expect(formatMessageTime(diffYear)).toBe("2025/12/25");

    vi.useRealTimers();
  });
});

describe("formatBubbleTime", () => {
  it("null/undefined は空文字", () => {
    expect(formatBubbleTime(null)).toBe("");
    expect(formatBubbleTime(undefined)).toBe("");
  });

  it("MM/DD HH:mm 形式", () => {
    const date = new Date("2026-04-07T13:45:00+09:00").toISOString();
    expect(formatBubbleTime(date)).toBe("04/07 13:45");
  });
});
