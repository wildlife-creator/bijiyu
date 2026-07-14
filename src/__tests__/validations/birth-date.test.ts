import { describe, it, expect } from "vitest";

import {
  birthDateSchema,
  splitBirthDate,
  joinBirthDate,
  daysInBirthMonth,
  clampBirthDay,
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

  it("一部だけ入力した途中状態（区切りだけ残る）は弾く", () => {
    expect(birthDateSchema.safeParse("1990//").success).toBe(false);
    expect(birthDateSchema.safeParse("1990/1/").success).toBe(false);
    expect(birthDateSchema.safeParse("/1/15").success).toBe(false);
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

describe("splitBirthDate", () => {
  it("スラッシュ区切りを年・月・日に分解し、月日の先頭ゼロを外す", () => {
    expect(splitBirthDate("1990/01/15")).toEqual({
      year: "1990",
      month: "1",
      day: "15",
    });
  });

  it("ハイフン区切り（DB 形式）も分解できる", () => {
    expect(splitBirthDate("1990-04-01")).toEqual({
      year: "1990",
      month: "4",
      day: "1",
    });
  });

  it("空文字・null・undefined はすべて空パーツを返す", () => {
    const empty = { year: "", month: "", day: "" };
    expect(splitBirthDate("")).toEqual(empty);
    expect(splitBirthDate(null)).toEqual(empty);
    expect(splitBirthDate(undefined)).toEqual(empty);
  });

  it("年だけ・年月だけの途中状態を分解できる", () => {
    expect(splitBirthDate("1990//")).toEqual({
      year: "1990",
      month: "",
      day: "",
    });
    expect(splitBirthDate("1990/4/")).toEqual({
      year: "1990",
      month: "4",
      day: "",
    });
  });

  it("年は数字4桁までに丸める", () => {
    expect(splitBirthDate("199012/1/5").year).toBe("1990");
  });
});

describe("joinBirthDate", () => {
  it("3パーツを YYYY/MM/DD 形式に結合する", () => {
    expect(joinBirthDate("1990", "4", "1")).toBe("1990/4/1");
  });

  it("結合結果は birthDateSchema でそのまま検証を通せる", () => {
    const r = birthDateSchema.safeParse(joinBirthDate("1990", "4", "1"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1990-04-01");
  });

  it("3パーツすべて空なら空文字を返す（未入力）", () => {
    expect(joinBirthDate("", "", "")).toBe("");
  });

  it("一部だけ埋まっている途中状態は区切りを残す（形式エラーとして検出させる）", () => {
    expect(joinBirthDate("1990", "", "")).toBe("1990//");
    expect(joinBirthDate("1990", "4", "")).toBe("1990/4/");
  });
});

describe("daysInBirthMonth", () => {
  it("31日の月", () => {
    expect(daysInBirthMonth("1990", "1")).toBe(31);
    expect(daysInBirthMonth("1990", "12")).toBe(31);
  });

  it("30日の月", () => {
    expect(daysInBirthMonth("1990", "4")).toBe(30);
  });

  it("平年の2月は28日", () => {
    expect(daysInBirthMonth("1990", "2")).toBe(28);
  });

  it("閏年の2月は29日", () => {
    expect(daysInBirthMonth("2000", "2")).toBe(29);
  });

  it("月が未確定なら31を返す", () => {
    expect(daysInBirthMonth("1990", "")).toBe(31);
  });

  it("年が4桁未満なら閏年扱いで2月は29日を許容する", () => {
    expect(daysInBirthMonth("19", "2")).toBe(29);
  });
});

describe("clampBirthDay", () => {
  it("末日を超える日は末日にクランプする（4/31 → 4/30）", () => {
    expect(clampBirthDay("31", "1990", "4")).toBe("30");
  });

  it("平年2月に31日を選んでいたら28にクランプする", () => {
    expect(clampBirthDay("31", "1990", "2")).toBe("28");
  });

  it("範囲内の日はそのまま", () => {
    expect(clampBirthDay("15", "1990", "4")).toBe("15");
  });

  it("日または月が未確定ならそのまま返す", () => {
    expect(clampBirthDay("", "1990", "4")).toBe("");
    expect(clampBirthDay("31", "1990", "")).toBe("31");
  });
});
