import { describe, expect, it } from "vitest";

import {
  loginSchema,
  signupEmailSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  registerProfileSchema,
} from "@/lib/validations/auth";

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("shows Japanese error message for invalid email", () => {
    const result = loginSchema.safeParse({ email: "bad", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find(
        (i) => i.path[0] === "email",
      );
      expect(emailError?.message).toContain("メールアドレス");
    }
  });
});

// ---------------------------------------------------------------------------
// signupEmailSchema
// ---------------------------------------------------------------------------
describe("signupEmailSchema", () => {
  it("accepts valid email", () => {
    const result = signupEmailSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupEmailSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetPasswordSchema
// ---------------------------------------------------------------------------
describe("resetPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = resetPasswordSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = resetPasswordSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePasswordSchema
// ---------------------------------------------------------------------------
describe("updatePasswordSchema", () => {
  it("accepts matching passwords of 8+ characters", () => {
    const result = updatePasswordSchema.safeParse({
      password: "securepass",
      confirmPassword: "securepass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = updatePasswordSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwError = result.error.issues.find(
        (i) => i.path[0] === "password",
      );
      expect(pwError?.message).toContain("8文字以上");
    }
  });

  it("rejects mismatched passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "securepass",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find(
        (i) => i.path.includes("confirmPassword"),
      );
      expect(confirmError?.message).toContain("一致しません");
    }
  });
});

// ---------------------------------------------------------------------------
// registerProfileSchema
// ---------------------------------------------------------------------------
describe("registerProfileSchema", () => {
  const validInput = {
    lastName: "山田",
    firstName: "太郎",
    gender: "男性",
    birthDate: "1990-01-15",
    prefecture: "東京都",
    companyName: "テスト建設",
    skills: [{ tradeType: "大工", experienceYears: 5 }],
    availableAreas: ["東京都"],
    password: "password123",
  };

  it("accepts valid profile data", () => {
    const result = registerProfileSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts up to 3 skills", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      skills: [
        { tradeType: "大工", experienceYears: 5 },
        { tradeType: "電気工事士", experienceYears: 3 },
        { tradeType: "鳶職", experienceYears: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 skills", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      skills: [
        { tradeType: "大工", experienceYears: 5 },
        { tradeType: "電気工事士", experienceYears: 3 },
        { tradeType: "鳶職", experienceYears: 1 },
        { tradeType: "左官", experienceYears: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty skills array", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      skills: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty availableAreas", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      availableAreas: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows optional companyName", () => {
    const { companyName: _, ...withoutCompany } = validInput;
    const result = registerProfileSchema.safeParse(withoutCompany);
    expect(result.success).toBe(true);
  });

  it("rejects empty lastName", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple available areas", () => {
    const result = registerProfileSchema.safeParse({
      ...validInput,
      availableAreas: ["東京都", "神奈川県", "千葉県"],
    });
    expect(result.success).toBe(true);
  });
});
