import { describe, expect, it } from "vitest";

import {
  jobSchema,
  validateJobImageFile,
  validateJobImageCount,
  ALLOWED_TRANSITIONS,
} from "@/lib/validations/job";

// ---------------------------------------------------------------------------
// Helper: create a mock File
// ---------------------------------------------------------------------------
function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

// ---------------------------------------------------------------------------
// jobSchema
// ---------------------------------------------------------------------------
describe("jobSchema", () => {
  const validInput = {
    title: "新築住宅の内装工事",
    description: "都内の新築住宅の内装工事を担当していただける方を募集しています。",
    tradeType: "内装工",
    rewardLower: 18000,
    rewardUpper: 22000,
    prefecture: "東京都",
    address: "江東区豊洲1-1-1",
    workStartDate: "2026-04-01",
    workEndDate: "2026-06-30",
    recruitStartDate: "2026-03-15",
    recruitEndDate: "2026-03-31",
    headcount: 3,
    workHours: "8:00〜17:00",
    experienceYears: "3年以上",
    requiredSkills: "",
    nationalityLanguage: "",
    items: "",
    scheduleDetail: "",
    projectDetails: "",
    ownerMessage: "",
    location: "",
    etcMessage: "",
    status: "draft" as const,
  };

  it("accepts valid job input with all required fields", () => {
    const result = jobSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with optional fields empty", () => {
    const minimalInput = {
      title: "テスト案件",
      description: "テスト詳細",
      tradeType: "大工",
      rewardLower: 15000,
      rewardUpper: 20000,
      prefecture: "大阪府",
      workStartDate: "2026-04-01",
      workEndDate: "2026-04-30",
      recruitStartDate: "2026-03-01",
      recruitEndDate: "2026-03-31",
      headcount: 1,
      status: "draft" as const,
    };
    const result = jobSchema.safeParse(minimalInput);
    expect(result.success).toBe(true);
  });

  it("rejects when title is empty", () => {
    const result = jobSchema.safeParse({ ...validInput, title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleError = result.error.issues.find((i) =>
        i.path.includes("title")
      );
      expect(titleError).toBeDefined();
    }
  });

  it("rejects when title exceeds 100 characters", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      title: "あ".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects when description is empty", () => {
    const result = jobSchema.safeParse({ ...validInput, description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when rewardUpper < rewardLower", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      rewardLower: 25000,
      rewardUpper: 18000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) =>
        i.path.includes("rewardUpper")
      );
      expect(error?.message).toBe(
        "報酬上限は下限以上の値を入力してください"
      );
    }
  });

  it("rejects when workEndDate < workStartDate", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      workStartDate: "2026-06-30",
      workEndDate: "2026-04-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) =>
        i.path.includes("workEndDate")
      );
      expect(error?.message).toBe(
        "工期終了日は開始日以降を選択してください"
      );
    }
  });

  it("rejects when recruitEndDate < recruitStartDate", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      recruitStartDate: "2026-04-01",
      recruitEndDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) =>
        i.path.includes("recruitEndDate")
      );
      expect(error?.message).toBe(
        "募集終了日は開始日以降を選択してください"
      );
    }
  });

  it("rejects invalid status value", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      status: "published",
    });
    expect(result.success).toBe(false);
  });

  it("accepts when rewardUpper equals rewardLower", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      rewardLower: 20000,
      rewardUpper: 20000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative reward values", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      rewardLower: -1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer headcount", () => {
    const result = jobSchema.safeParse({
      ...validInput,
      headcount: 2.5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_TRANSITIONS
// ---------------------------------------------------------------------------
describe("ALLOWED_TRANSITIONS", () => {
  it("allows draft -> open", () => {
    expect(ALLOWED_TRANSITIONS["draft"]).toContain("open");
  });

  it("allows open -> closed", () => {
    expect(ALLOWED_TRANSITIONS["open"]).toContain("closed");
  });

  it("does not allow closed -> draft", () => {
    expect(ALLOWED_TRANSITIONS["closed"]).not.toContain("draft");
  });

  it("does not allow closed -> open", () => {
    expect(ALLOWED_TRANSITIONS["closed"]).not.toContain("open");
  });

  it("does not allow draft -> closed", () => {
    expect(ALLOWED_TRANSITIONS["draft"]).not.toContain("closed");
  });

  it("does not allow open -> draft", () => {
    expect(ALLOWED_TRANSITIONS["open"]).not.toContain("draft");
  });
});

// ---------------------------------------------------------------------------
// validateJobImageFile
// ---------------------------------------------------------------------------
describe("validateJobImageFile", () => {
  it("accepts valid JPEG file", () => {
    const file = createMockFile("photo.jpg", 1_000_000, "image/jpeg");
    expect(validateJobImageFile(file)).toBeNull();
  });

  it("accepts valid PNG file", () => {
    const file = createMockFile("photo.png", 1_000_000, "image/png");
    expect(validateJobImageFile(file)).toBeNull();
  });

  it("rejects GIF files", () => {
    const file = createMockFile("photo.gif", 1_000_000, "image/gif");
    expect(validateJobImageFile(file)).toBe(
      "JPEGまたはPNG形式の画像のみアップロードできます"
    );
  });

  it("rejects WebP files", () => {
    const file = createMockFile("photo.webp", 1_000_000, "image/webp");
    expect(validateJobImageFile(file)).toBe(
      "JPEGまたはPNG形式の画像のみアップロードできます"
    );
  });

  it("rejects file with wrong extension but correct MIME type", () => {
    const file = createMockFile("photo.gif", 1_000_000, "image/jpeg");
    expect(validateJobImageFile(file)).toBe(
      "JPEGまたはPNG形式の画像のみアップロードできます"
    );
  });

  it("rejects file exceeding 10MB", () => {
    const file = createMockFile(
      "large.jpg",
      10_000_001,
      "image/jpeg"
    );
    expect(validateJobImageFile(file)).toBe(
      "画像は1枚あたり10MB以下にしてください"
    );
  });

  it("accepts file exactly 10MB", () => {
    const file = createMockFile(
      "exact.jpg",
      10_000_000,
      "image/jpeg"
    );
    expect(validateJobImageFile(file)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateJobImageCount
// ---------------------------------------------------------------------------
describe("validateJobImageCount", () => {
  it("allows adding images within limit", () => {
    expect(validateJobImageCount(5, 3)).toBeNull();
  });

  it("allows adding up to exactly 10 total", () => {
    expect(validateJobImageCount(7, 3)).toBeNull();
  });

  it("rejects when total exceeds 10", () => {
    expect(validateJobImageCount(8, 3)).toBe(
      "画像は1案件あたり最大10枚までアップロードできます"
    );
  });

  it("rejects when existing images already at 10", () => {
    expect(validateJobImageCount(10, 1)).toBe(
      "画像は1案件あたり最大10枚までアップロードできます"
    );
  });

  it("allows zero new images", () => {
    expect(validateJobImageCount(10, 0)).toBeNull();
  });
});
