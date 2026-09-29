import { describe, it, expect } from "vitest";

import { GENDERS } from "@/lib/constants/options";
import { formatGender } from "@/lib/utils/format-gender";

describe("formatGender", () => {
  // 2026-09-29 回帰: プロフィール画面（COM-001）が英語値（male 等）前提で、
  // 日本語で保存された性別が常に空表示になっていた
  it.each(GENDERS)("保存値「%s」をそのまま表示する", (gender) => {
    expect(formatGender(gender)).toBe(gender);
  });

  it("未設定は空文字", () => {
    expect(formatGender(null)).toBe("");
    expect(formatGender(undefined)).toBe("");
    expect(formatGender("")).toBe("");
  });

  it("選択肢に無い値は空文字", () => {
    expect(formatGender("male")).toBe("");
  });
});
