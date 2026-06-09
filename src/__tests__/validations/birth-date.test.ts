import { describe, it, expect } from "vitest";

import { birthDateSchema } from "@/lib/validations/birth-date";

describe("birthDateSchema", () => {
  it("スラッシュ区切りを受け付け、YYYY-MM-DD に正規化する", () => {
    const r = birthDateSchema.safeParse("1990/01/15");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1990-01-15");
  });

  it("ハイフン区切りも受け付ける", () => {
    const r = birthDateSchema.safeParse("1990-04-01");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1990-04-01");
  });

  it("1桁の月日はゼロ詰めされる", () => {
    const r = birthDateSchema.safeParse("1990/1/5");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1990-01-05");
  });

  it("空欄は弾く", () => {
    expect(birthDateSchema.safeParse("").success).toBe(false);
  });

  it("形式不正（区切りなし）は弾く", () => {
    expect(birthDateSchema.safeParse("19900115").success).toBe(false);
  });

  it("存在しない日付（2/30）は弾く", () => {
    expect(birthDateSchema.safeParse("2020/02/30").success).toBe(false);
  });

  it("月が範囲外（13月）は弾く", () => {
    expect(birthDateSchema.safeParse("1990/13/01").success).toBe(false);
  });

  it("1900 年より前は弾く", () => {
    expect(birthDateSchema.safeParse("1899/12/31").success).toBe(false);
  });

  it("未来の年は弾く", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(birthDateSchema.safeParse(`${nextYear}/01/01`).success).toBe(false);
  });

  it("うるう年の 2/29 は受け付ける", () => {
    const r = birthDateSchema.safeParse("2000/02/29");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("2000-02-29");
  });
});
