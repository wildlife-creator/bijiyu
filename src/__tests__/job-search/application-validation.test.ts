import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/lib/validations/application";

describe("applicationSchema", () => {
  const validData = {
    jobId: "66666666-6666-6666-6666-666666666666",
    headcount: 2,
    workingType: "常勤",
    preferredFirstWorkDate: "2026-04-01",
    message: "よろしくお願いします",
  };

  it("正常なデータはバリデーションを通過する", () => {
    const result = applicationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("message は省略可能", () => {
    const { message: _, ...withoutMessage } = validData;
    const result = applicationSchema.safeParse(withoutMessage);
    expect(result.success).toBe(true);
  });

  it("jobId が UUID でなければエラー", () => {
    const result = applicationSchema.safeParse({
      ...validData,
      jobId: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("headcount が 0 以下ならエラー", () => {
    const result = applicationSchema.safeParse({
      ...validData,
      headcount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("headcount が文字列の数値でも coerce される", () => {
    const result = applicationSchema.safeParse({
      ...validData,
      headcount: "3",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headcount).toBe(3);
    }
  });

  it("workingType が空文字ならエラー", () => {
    const result = applicationSchema.safeParse({
      ...validData,
      workingType: "",
    });
    expect(result.success).toBe(false);
  });

  it("preferredFirstWorkDate が空文字ならエラー", () => {
    const result = applicationSchema.safeParse({
      ...validData,
      preferredFirstWorkDate: "",
    });
    expect(result.success).toBe(false);
  });
});
