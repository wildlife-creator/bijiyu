import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  validateSupportAttachmentMeta,
  isValidSupportAttachmentPath,
} from "@/lib/support/attachment-rules";

/**
 * サポート添付の検証ロジック（attachment-rules）と
 * 署名付きアップロード URL 発行（prepare-upload-action）のテスト。
 * 旧 uploadSupportAttachments（サーバー経由アップロード）は Vercel の
 * 4.5MB リクエスト上限対応で direct-upload 方式に置き換えられた。
 */

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

function meta(
  overrides: Partial<{ name: string; size: number; type: string }> = {},
) {
  return {
    name: "photo.png",
    size: 1024,
    type: "image/png",
    ...overrides,
  };
}

describe("validateSupportAttachmentMeta", () => {
  it("有効な画像（JPEG/PNG/WebP）と PDF は許可する", () => {
    expect(validateSupportAttachmentMeta(meta())).toBeNull();
    expect(
      validateSupportAttachmentMeta(meta({ name: "a.jpg", type: "image/jpeg" })),
    ).toBeNull();
    expect(
      validateSupportAttachmentMeta(
        meta({ name: "a.webp", type: "image/webp" }),
      ),
    ).toBeNull();
    expect(
      validateSupportAttachmentMeta(
        meta({ name: "a.pdf", type: "application/pdf" }),
      ),
    ).toBeNull();
  });

  it("5MB 超過は拒否する", () => {
    const error = validateSupportAttachmentMeta(
      meta({ size: 5 * 1024 * 1024 + 1 }),
    );
    expect(error).toContain("5MB");
  });

  it("許可外 MIME は拒否する", () => {
    const error = validateSupportAttachmentMeta(
      meta({ name: "a.gif", type: "image/gif" }),
    );
    expect(error).toContain("JPEG");
  });

  it("MIME は許可でも拡張子が許可外なら拒否する", () => {
    const error = validateSupportAttachmentMeta(
      meta({ name: "a.exe", type: "image/png" }),
    );
    expect(error).toContain("JPEG");
  });
});

describe("isValidSupportAttachmentPath", () => {
  it("contact: サーバー採番形式 (contact/{uuid}.{ext}) を許可する", () => {
    expect(
      isValidSupportAttachmentPath(`contact/${VALID_UUID}.png`, "contact"),
    ).toBe(true);
    expect(
      isValidSupportAttachmentPath(`contact/${VALID_UUID}.pdf`, "contact"),
    ).toBe(true);
    expect(
      isValidSupportAttachmentPath(`contact/${VALID_UUID}.webp`, "contact"),
    ).toBe(true);
  });

  it("contact: 形式外・トラバーサル・拡張子外を拒否する", () => {
    expect(isValidSupportAttachmentPath("contact/evil.png", "contact")).toBe(
      false,
    );
    expect(isValidSupportAttachmentPath("contact/../evil.png", "contact")).toBe(
      false,
    );
    expect(
      isValidSupportAttachmentPath(`contact/${VALID_UUID}.exe`, "contact"),
    ).toBe(false);
    expect(
      isValidSupportAttachmentPath(
        `trouble/user-1/${VALID_UUID}.png`,
        "contact",
      ),
    ).toBe(false);
  });

  it("trouble: 本人フォルダ (trouble/{userId}/{uuid}.{ext}) のみ許可する", () => {
    expect(
      isValidSupportAttachmentPath(
        `trouble/user-1/${VALID_UUID}.png`,
        "trouble",
        "user-1",
      ),
    ).toBe(true);
    expect(
      isValidSupportAttachmentPath(
        `trouble/user-2/${VALID_UUID}.png`,
        "trouble",
        "user-1",
      ),
    ).toBe(false);
    expect(
      isValidSupportAttachmentPath(
        `contact/${VALID_UUID}.png`,
        "trouble",
        "user-1",
      ),
    ).toBe(false);
    // userId 未指定は常に拒否
    expect(
      isValidSupportAttachmentPath(
        `trouble/user-1/${VALID_UUID}.png`,
        "trouble",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prepareSupportAttachmentUploadAction（署名付き URL 発行）
// ---------------------------------------------------------------------------

const authState = { user: null as null | { id: string } };
const signState = {
  requests: [] as string[],
  error: null as null | { message: string },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          signState.requests.push(path);
          if (signState.error) {
            return { data: null, error: signState.error };
          }
          return { data: { path, token: `token-for-${path}` }, error: null };
        },
      }),
    },
  }),
}));

const { prepareSupportAttachmentUploadAction } = await import(
  "@/lib/support/prepare-upload-action"
);

beforeEach(() => {
  authState.user = null;
  signState.requests = [];
  signState.error = null;
});

describe("prepareSupportAttachmentUploadAction", () => {
  it("contact: 匿名でも contact/ プレフィックスで発行できる", async () => {
    const result = await prepareSupportAttachmentUploadAction("contact", [
      meta(),
    ]);
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.targets).toHaveLength(1);
      expect(result.data.targets[0].path).toMatch(/^contact\/[0-9a-f-]+\.png$/);
      expect(result.data.targets[0].token).toContain("token-for-");
    }
  });

  it("trouble: 未ログインは拒否する", async () => {
    const result = await prepareSupportAttachmentUploadAction("trouble", [
      meta(),
    ]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("ログイン");
    expect(signState.requests).toHaveLength(0);
  });

  it("trouble: ログイン中は trouble/{userId}/ プレフィックスで発行する", async () => {
    authState.user = { id: "user-1" };
    const result = await prepareSupportAttachmentUploadAction("trouble", [
      meta(),
    ]);
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.targets[0].path).toMatch(
        /^trouble\/user-1\/[0-9a-f-]+\.png$/,
      );
    }
  });

  it("6件以上は枚数超過で拒否する", async () => {
    const result = await prepareSupportAttachmentUploadAction(
      "contact",
      Array.from({ length: 6 }, () => meta()),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("最大5件");
    expect(signState.requests).toHaveLength(0);
  });

  it("サイズ・種別が不正なら発行前に拒否する", async () => {
    const tooBig = await prepareSupportAttachmentUploadAction("contact", [
      meta({ size: 5 * 1024 * 1024 + 1 }),
    ]);
    expect(tooBig.success).toBe(false);

    const badType = await prepareSupportAttachmentUploadAction("contact", [
      meta({ name: "a.gif", type: "image/gif" }),
    ]);
    expect(badType.success).toBe(false);
    expect(signState.requests).toHaveLength(0);
  });

  it("署名付き URL 発行失敗はエラーを返す", async () => {
    signState.error = { message: "storage down" };
    const result = await prepareSupportAttachmentUploadAction("contact", [
      meta(),
    ]);
    expect(result.success).toBe(false);
  });

  it("0件なら空 targets で成功する", async () => {
    const result = await prepareSupportAttachmentUploadAction("contact", []);
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.targets).toHaveLength(0);
    }
  });
});
