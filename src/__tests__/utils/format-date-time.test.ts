import { describe, expect, it } from "vitest";

import { formatDateTime, getJstToday } from "@/lib/utils/format-date";

describe("formatDateTime", () => {
  it("UTC 入力を Asia/Tokyo に変換して YYYY/MM/DD HH:mm 形式で返す（9時間ズレない）", () => {
    // UTC 05:30 = JST 14:30
    expect(formatDateTime("2026-06-10T05:30:00Z")).toBe("2026/06/10 14:30");
  });

  it("日付をまたぐ UTC 入力でも JST の日付になる", () => {
    // UTC 23:30 = JST 翌日 08:30
    expect(formatDateTime("2026-06-10T23:30:00Z")).toBe("2026/06/11 08:30");
  });

  it("タイムゾーン付き ISO（+09:00）はそのままの時刻で表示される", () => {
    expect(formatDateTime("2026-06-10T14:30:00+09:00")).toBe("2026/06/10 14:30");
  });

  it("null は fallback（既定 —）を返す", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("undefined は fallback（既定 —）を返す", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("空文字は fallback を返す", () => {
    expect(formatDateTime("")).toBe("—");
  });

  it("不正な文字列は fallback を返す", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("カスタム fallback を指定できる", () => {
    expect(formatDateTime(null, "未設定")).toBe("未設定");
  });
});

describe("getJstToday", () => {
  it("UTC 深夜（JST では翌日）でも JST の日付を返す（9時間ズレない）", () => {
    // UTC 2026-06-12 20:00 = JST 2026-06-13 05:00
    expect(getJstToday(new Date("2026-06-12T20:00:00Z"))).toBe("2026-06-13");
  });

  it("JST 日付境界（UTC 15:00 = JST 0:00）で日付が切り替わる", () => {
    expect(getJstToday(new Date("2026-06-12T14:59:59Z"))).toBe("2026-06-12");
    expect(getJstToday(new Date("2026-06-12T15:00:00Z"))).toBe("2026-06-13");
  });

  it("YYYY-MM-DD 形式で返す（first_work_date と直接比較可能）", () => {
    expect(getJstToday(new Date("2026-06-12T00:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
