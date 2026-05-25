import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * uploadSupportAttachments / removeSupportAttachments の単体テスト（support Task 6.1）。
 * createAdminClient の storage をモックし、検証・ランダム命名・クリーンアップを確認する。
 */

interface UploadCall {
  path: string;
  contentType?: string;
}

const storageState = {
  uploads: [] as UploadCall[],
  removed: [] as string[][],
  failOnCall: -1, // この回数目（0始まり）の upload を失敗させる。-1 で全成功
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (
          path: string,
          _file: File,
          opts?: { contentType?: string },
        ) => {
          const callIndex = storageState.uploads.length;
          storageState.uploads.push({ path, contentType: opts?.contentType });
          if (callIndex === storageState.failOnCall) {
            return { data: null, error: { message: "upload failed" } };
          }
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          storageState.removed.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

const { uploadSupportAttachments, removeSupportAttachments } = await import(
  "@/lib/support/attachments"
);

function makeFile(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  storageState.uploads = [];
  storageState.removed = [];
  storageState.failOnCall = -1;
});

describe("uploadSupportAttachments", () => {
  it("空ファイル（size=0）は除外し、アップロードせず success/paths=[] を返す", async () => {
    const empty = makeFile("empty.png", 0, "image/png");
    const result = await uploadSupportAttachments([empty], "contact");
    expect(result).toEqual({ success: true, paths: [] });
    expect(storageState.uploads).toHaveLength(0);
  });

  it("6件以上は枚数超過で拒否する", async () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      makeFile(`f${i}.png`, 10, "image/png"),
    );
    const result = await uploadSupportAttachments(files, "contact");
    expect(result.success).toBe(false);
    expect(storageState.uploads).toHaveLength(0);
  });

  it("5MB 超過は拒否する", async () => {
    const big = makeFile("big.pdf", 5 * 1024 * 1024 + 1, "application/pdf");
    const result = await uploadSupportAttachments([big], "contact");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("5MB");
    expect(storageState.uploads).toHaveLength(0);
  });

  it("許可外 MIME は拒否する", async () => {
    const bad = makeFile("a.gif", 10, "image/gif");
    const result = await uploadSupportAttachments([bad], "contact");
    expect(result.success).toBe(false);
    expect(storageState.uploads).toHaveLength(0);
  });

  it("MIME は許可でも拡張子が許可外なら拒否する", async () => {
    const bad = makeFile("a.svg", 10, "image/png");
    const result = await uploadSupportAttachments([bad], "contact");
    expect(result.success).toBe(false);
    expect(storageState.uploads).toHaveLength(0);
  });

  it("有効ファイルを保存し、ファイル名をランダム化（元名を使わない）する", async () => {
    const files = [
      makeFile("design.png", 100, "image/png"),
      makeFile("estimate.pdf", 200, "application/pdf"),
    ];
    const result = await uploadSupportAttachments(files, "contact");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.paths).toHaveLength(2);
      // prefix と拡張子は保持、元のファイル名は含まない
      expect(result.paths[0]).toMatch(/^contact\/[0-9a-f-]+\.png$/);
      expect(result.paths[1]).toMatch(/^contact\/[0-9a-f-]+\.pdf$/);
      expect(result.paths.join()).not.toContain("design");
      expect(result.paths.join()).not.toContain("estimate");
    }
    expect(storageState.uploads[0].contentType).toBe("image/png");
  });

  it("途中のアップロード失敗時は、それまでに保存したファイルを削除して中断する", async () => {
    storageState.failOnCall = 1; // 2件目で失敗
    const files = [
      makeFile("a.png", 100, "image/png"),
      makeFile("b.png", 100, "image/png"),
    ];
    const result = await uploadSupportAttachments(files, "contact");
    expect(result.success).toBe(false);
    // 1件目のパスがクリーンアップされている
    expect(storageState.removed).toHaveLength(1);
    expect(storageState.removed[0]).toHaveLength(1);
  });
});

describe("removeSupportAttachments", () => {
  it("空配列なら storage を呼ばない", async () => {
    await removeSupportAttachments([]);
    expect(storageState.removed).toHaveLength(0);
  });

  it("パスを渡すと remove を呼ぶ", async () => {
    await removeSupportAttachments(["contact/x.png"]);
    expect(storageState.removed).toEqual([["contact/x.png"]]);
  });
});
