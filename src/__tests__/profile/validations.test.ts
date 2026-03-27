import { describe, expect, it } from "vitest";

import {
  profileEditSchema,
  validateAvatarFile,
  validateDocumentFile,
  withdrawalSchema,
  contactSchema,
  identityUploadSchema,
  ccusUploadSchema,
} from "@/lib/validations/profile";

// ---------------------------------------------------------------------------
// Helper: create a mock File
// ---------------------------------------------------------------------------
function createMockFile(
  name: string,
  size: number,
  type: string,
): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

// ---------------------------------------------------------------------------
// profileEditSchema
// ---------------------------------------------------------------------------
describe("profileEditSchema", () => {
  const validInput = {
    lastName: "山田",
    firstName: "太郎",
    gender: "男性",
    birthDate: "1990-05-15",
    prefecture: "東京都",
    skills: [{ tradeType: "大工", experienceYears: 5 }],
    availableAreas: ["東京都"],
  };

  it("accepts valid profile input", () => {
    const result = profileEditSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts input with optional fields", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      email: "test@example.com",
      companyName: "テスト建設",
      bio: "自己紹介文",
      qualifications: ["一級建築士"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty email string", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty lastName", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty birthDate", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      birthDate: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty gender", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      gender: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty prefecture", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      prefecture: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty skills array", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      skills: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 skills", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      skills: [
        { tradeType: "大工", experienceYears: 1 },
        { tradeType: "左官", experienceYears: 2 },
        { tradeType: "塗装工", experienceYears: 3 },
        { tradeType: "配管工", experienceYears: 4 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty availableAreas", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      availableAreas: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = profileEditSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("shows Japanese error messages", () => {
    const result = profileEditSchema.safeParse({
      lastName: "",
      firstName: "",
      gender: "",
      prefecture: "",
      skills: [],
      availableAreas: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("姓"))).toBe(true);
      expect(messages.some((m) => m.includes("名"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateAvatarFile
// ---------------------------------------------------------------------------
describe("validateAvatarFile", () => {
  it("accepts valid JPEG file under 5MB", () => {
    const file = createMockFile("photo.jpg", 1_000_000, "image/jpeg");
    expect(validateAvatarFile(file)).toBeNull();
  });

  it("accepts valid PNG file under 5MB", () => {
    const file = createMockFile("photo.png", 1_000_000, "image/png");
    expect(validateAvatarFile(file)).toBeNull();
  });

  it("rejects file over 5MB", () => {
    const file = createMockFile("photo.jpg", 6_000_000, "image/jpeg");
    expect(validateAvatarFile(file)).toContain("5MB");
  });

  it("rejects PDF file", () => {
    const file = createMockFile("doc.pdf", 1_000_000, "application/pdf");
    expect(validateAvatarFile(file)).toContain("JPEG、PNG");
  });

  it("rejects file with wrong extension", () => {
    const file = createMockFile("photo.gif", 1_000_000, "image/jpeg");
    expect(validateAvatarFile(file)).toContain("JPEG、PNG");
  });
});

// ---------------------------------------------------------------------------
// validateDocumentFile
// ---------------------------------------------------------------------------
describe("validateDocumentFile", () => {
  it("accepts valid JPEG file under 10MB", () => {
    const file = createMockFile("doc.jpg", 5_000_000, "image/jpeg");
    expect(validateDocumentFile(file)).toBeNull();
  });

  it("accepts valid PNG file under 10MB", () => {
    const file = createMockFile("doc.png", 5_000_000, "image/png");
    expect(validateDocumentFile(file)).toBeNull();
  });

  it("accepts valid PDF file under 10MB", () => {
    const file = createMockFile("doc.pdf", 5_000_000, "application/pdf");
    expect(validateDocumentFile(file)).toBeNull();
  });

  it("rejects file over 10MB", () => {
    const file = createMockFile("doc.jpg", 11_000_000, "image/jpeg");
    expect(validateDocumentFile(file)).toContain("10MB");
  });

  it("rejects GIF file", () => {
    const file = createMockFile("doc.gif", 1_000_000, "image/gif");
    expect(validateDocumentFile(file)).toContain("JPEG、PNG、PDF");
  });

  it("rejects file with mismatched extension", () => {
    const file = createMockFile("doc.bmp", 1_000_000, "image/jpeg");
    expect(validateDocumentFile(file)).toContain("JPEG、PNG、PDF");
  });
});

// ---------------------------------------------------------------------------
// identityUploadSchema
// ---------------------------------------------------------------------------
describe("identityUploadSchema", () => {
  it("accepts two File objects", () => {
    const file1 = createMockFile("doc1.jpg", 1000, "image/jpeg");
    const file2 = createMockFile("doc2.jpg", 1000, "image/jpeg");
    const result = identityUploadSchema.safeParse({
      document1: file1,
      document2: file2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when document1 is missing", () => {
    const file2 = createMockFile("doc2.jpg", 1000, "image/jpeg");
    const result = identityUploadSchema.safeParse({
      document2: file2,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ccusUploadSchema
// ---------------------------------------------------------------------------
describe("ccusUploadSchema", () => {
  it("accepts valid file and worker ID", () => {
    const file = createMockFile("card.jpg", 1000, "image/jpeg");
    const result = ccusUploadSchema.safeParse({
      document: file,
      ccusWorkerId: "12345678901234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty worker ID", () => {
    const file = createMockFile("card.jpg", 1000, "image/jpeg");
    const result = ccusUploadSchema.safeParse({
      document: file,
      ccusWorkerId: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withdrawalSchema
// ---------------------------------------------------------------------------
describe("withdrawalSchema", () => {
  it("accepts valid withdrawal input", () => {
    const result = withdrawalSchema.safeParse({
      reason: "利用する機会がなくなった",
      confirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts withdrawal with optional details", () => {
    const result = withdrawalSchema.safeParse({
      reason: "その他",
      details: "詳細な理由をここに記載",
      confirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty reason", () => {
    const result = withdrawalSchema.safeParse({
      reason: "",
      confirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when confirmed is false", () => {
    const result = withdrawalSchema.safeParse({
      reason: "その他",
      confirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when confirmed is missing", () => {
    const result = withdrawalSchema.safeParse({
      reason: "その他",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contactSchema
// ---------------------------------------------------------------------------
describe("contactSchema", () => {
  const validContact = {
    lastName: "山田",
    firstName: "太郎",
    email: "test@example.com",
    contactTypes: ["サービスについて"],
    content: "お問い合わせ内容です",
  };

  it("accepts valid contact input", () => {
    const result = contactSchema.safeParse(validContact);
    expect(result.success).toBe(true);
  });

  it("accepts multiple contact types", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      contactTypes: ["サービスについて", "不具合の報告"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty lastName", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      email: "not-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty contactTypes", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      contactTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = contactSchema.safeParse({
      ...validContact,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("shows Japanese error messages", () => {
    const result = contactSchema.safeParse({
      lastName: "",
      firstName: "",
      email: "",
      contactTypes: [],
      content: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("姓"))).toBe(true);
    }
  });
});
