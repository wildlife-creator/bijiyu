import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getSignedDocumentUrls（src/lib/admin/signed-urls.ts）のテスト。
 * - 非公開バケットのパス群から署名付きURL（1時間）を一括生成する
 * - audit オプション指定時は identity_access を記録する
 *   （書類アクセスの記録漏れを構造的に防止する設計）
 */

const storageState = {
  calls: [] as Array<{ bucket: string; paths: string[]; expiresIn: number }>,
  result: { data: null as unknown, error: null as unknown },
  /** 呼び出し順に消費する戻り値。空になったら result を返す（再試行テスト用） */
  queue: [] as Array<{ data: unknown; error: unknown }>,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], expiresIn: number) => {
          storageState.calls.push({ bucket, paths, expiresIn });
          const queued = storageState.queue.shift();
          return Promise.resolve(queued ?? storageState.result);
        },
      }),
    },
  }),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

import { getSignedDocumentUrls } from "@/lib/admin/signed-urls";

beforeEach(() => {
  storageState.calls = [];
  storageState.result = { data: null, error: null };
  storageState.queue = [];
  mockWriteAuditLog.mockClear();
});

describe("getSignedDocumentUrls", () => {
  it("パス群から署名付きURL（有効期限1時間）を生成して返す", async () => {
    storageState.result = {
      data: [
        { path: "a/1.jpg", signedUrl: "https://signed/a1", error: null },
        { path: "a/2.jpg", signedUrl: "https://signed/a2", error: null },
      ],
      error: null,
    };

    const result = await getSignedDocumentUrls({
      bucket: "identity-documents",
      paths: ["a/1.jpg", "a/2.jpg"],
    });

    expect(storageState.calls).toHaveLength(1);
    expect(storageState.calls[0]).toMatchObject({
      bucket: "identity-documents",
      paths: ["a/1.jpg", "a/2.jpg"],
      expiresIn: 3600,
    });
    expect(result).toEqual([
      { path: "a/1.jpg", url: "https://signed/a1" },
      { path: "a/2.jpg", url: "https://signed/a2" },
    ]);
  });

  it("一部のパスが失敗した場合は該当パスのみ url: null になる", async () => {
    storageState.result = {
      data: [
        { path: "a/1.jpg", signedUrl: "https://signed/a1", error: null },
        { path: "a/missing.jpg", signedUrl: null, error: "Not found" },
      ],
      error: null,
    };

    const result = await getSignedDocumentUrls({
      bucket: "support-attachments",
      paths: ["a/1.jpg", "a/missing.jpg"],
    });

    expect(result).toEqual([
      { path: "a/1.jpg", url: "https://signed/a1" },
      { path: "a/missing.jpg", url: null },
    ]);
  });

  it("storage API がエラーを返した場合は 1 回再試行し、それでも失敗なら全パス url: null で返す（throw しない）", async () => {
    storageState.result = { data: null, error: { message: "bucket error" } };

    const result = await getSignedDocumentUrls({
      bucket: "message-attachments",
      paths: ["x/1.png"],
    });

    expect(result).toEqual([{ path: "x/1.png", url: null }]);
    // 初回 + 再試行 1 回 = 2 回だけ呼ぶ（無限に再試行しない）
    expect(storageState.calls).toHaveLength(2);
  });

  it("1 回目が失敗しても 2 回目で成功すれば URL を返す（一時的な失敗の自動回復）", async () => {
    storageState.queue = [
      { data: null, error: { message: "temporary failure" } },
      {
        data: [{ path: "x/1.png", signedUrl: "https://signed/x1", error: null }],
        error: null,
      },
    ];

    const result = await getSignedDocumentUrls({
      bucket: "identity-documents",
      paths: ["x/1.png"],
      audit: {
        actorId: "admin-1",
        targetType: "identity_verifications",
        targetId: "verif-1",
        documentType: "identity",
      },
    });

    expect(result).toEqual([{ path: "x/1.png", url: "https://signed/x1" }]);
    expect(storageState.calls).toHaveLength(2);
    // 再試行しても監査ログは 1 回だけ
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
  });

  it("1 回目で成功したら再試行しない", async () => {
    storageState.result = {
      data: [{ path: "x/1.png", signedUrl: "https://signed/x1", error: null }],
      error: null,
    };

    await getSignedDocumentUrls({
      bucket: "ccus-documents",
      paths: ["x/1.png"],
    });

    expect(storageState.calls).toHaveLength(1);
  });

  it("paths が空なら storage を呼ばず空配列を返す", async () => {
    const result = await getSignedDocumentUrls({
      bucket: "ccus-documents",
      paths: [],
    });

    expect(result).toEqual([]);
    expect(storageState.calls).toHaveLength(0);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("audit オプション指定時は identity_access を記録する（metadata に document_type）", async () => {
    storageState.result = {
      data: [{ path: "u1/id.jpg", signedUrl: "https://signed/id", error: null }],
      error: null,
    };

    await getSignedDocumentUrls({
      bucket: "identity-documents",
      paths: ["u1/id.jpg"],
      audit: {
        actorId: "admin-1",
        targetType: "identity_verifications",
        targetId: "verif-1",
        documentType: "identity",
      },
    });

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "identity_access",
        targetType: "identity_verifications",
        targetId: "verif-1",
        metadata: expect.objectContaining({
          bucket: "identity-documents",
          document_type: "identity",
        }),
      }),
    );
  });

  it("audit オプションなしでは audit log を記録しない", async () => {
    storageState.result = {
      data: [{ path: "a/1.jpg", signedUrl: "https://signed/a1", error: null }],
      error: null,
    };

    await getSignedDocumentUrls({
      bucket: "identity-documents",
      paths: ["a/1.jpg"],
    });

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});
