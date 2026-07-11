import { describe, it, expect } from "vitest";

import {
  birthDateSchema,
  formatBirthDateInput,
} from "@/lib/validations/birth-date";

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

describe("formatBirthDateInput", () => {
  it("数字8桁を YYYY/MM/DD に整形する", () => {
    expect(formatBirthDateInput("19900115")).toBe("1990/01/15");
  });

  it("途中入力でも段階的に区切りを挿入する", () => {
    expect(formatBirthDateInput("1")).toBe("1");
    expect(formatBirthDateInput("1990")).toBe("1990");
    expect(formatBirthDateInput("19900")).toBe("1990/0");
    expect(formatBirthDateInput("199001")).toBe("1990/01");
    expect(formatBirthDateInput("1990011")).toBe("1990/01/1");
  });

  it("スラッシュ入りのペーストを再整形する", () => {
    expect(formatBirthDateInput("1990/01/15")).toBe("1990/01/15");
  });

  it("ハイフン入りのペーストを再整形する", () => {
    expect(formatBirthDateInput("1990-01-15")).toBe("1990/01/15");
  });

  it("区切り付き1桁月日のペーストをゼロ詰めして整形する", () => {
    // 数字だけ抜き出す旧実装では "1990/15" に化けていたケース
    expect(formatBirthDateInput("1990/1/5")).toBe("1990/01/05");
    expect(formatBirthDateInput("1990/1/15")).toBe("1990/01/15");
    expect(formatBirthDateInput("1990/12/5")).toBe("1990/12/05");
    expect(formatBirthDateInput("1990-1-5")).toBe("1990/01/05");
  });

  it("区切り付きでも成分が欠ける途中入力はゼロ詰めせず数字連結にフォールバックする", () => {
    // "1990/01" に化けさせない（ユーザーが月を打ち切る前に確定させない）
    expect(formatBirthDateInput("1990/1")).toBe("1990/1");
    expect(formatBirthDateInput("1990/")).toBe("1990");
  });

  it("全角数字を半角に正規化して整形する", () => {
    expect(formatBirthDateInput("１９９００１１５")).toBe("1990/01/15");
  });

  it("数字以外（空白・記号）を除去して整形する", () => {
    expect(formatBirthDateInput(" 1990 01 15 ")).toBe("1990/01/15");
    expect(formatBirthDateInput("1990年01月15日")).toBe("1990/01/15");
  });

  it("9桁以上は先頭8桁で切り捨てる", () => {
    expect(formatBirthDateInput("199001159")).toBe("1990/01/15");
  });

  it("空文字はそのまま空を返す", () => {
    expect(formatBirthDateInput("")).toBe("");
  });

  it("数字を含まない入力は空を返す", () => {
    expect(formatBirthDateInput("abc//")).toBe("");
  });

  it("整形結果は birthDateSchema でそのまま検証を通せる", () => {
    const formatted = formatBirthDateInput("19900401");
    const r = birthDateSchema.safeParse(formatted);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1990-04-01");
  });
});
