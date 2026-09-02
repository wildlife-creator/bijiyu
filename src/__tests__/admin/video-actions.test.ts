import { beforeEach, describe, expect, it, vi } from "vitest";

import { CloudflareStreamError } from "@/lib/cloudflare/stream";
import { CLOUDFLARE_NOT_CONFIGURED_MESSAGE } from "@/lib/videos/constants";

import {
  createInMemoryAdminClient,
  createInMemoryDb,
  type InMemoryDb,
  type Row,
} from "../video/in-memory-admin-client";

/**
 * ADM-027 動画管理 Server Action の統合テスト（P4、書き込み + 権限系のためフルテスト）。
 *
 * Server Action 自体はモックせず内部ロジック（Zod / 1 本目メール判定 / 表示順 /
 * 監査ログ / Cloudflare 失敗時の扱い）を実行する。Supabase admin client はインメモリ実装、
 * Cloudflare 通信とメール送信はモックする。
 */

const USER_ID = "11111111-1111-1111-1111-111111111111"; // seed 形式（RFC 非準拠）も通る
const ADMIN_ID = "44444444-4444-4444-4444-444444444444";
const TIKTOK_URL = "https://www.tiktok.com/@u/video/7234567890123456789";

const auth = { ok: true as boolean, error: "この操作を行う権限がありません" };
vi.mock("@/lib/admin/require-admin", () => ({
  requireAdmin: async () =>
    auth.ok ? { ok: true, adminId: ADMIN_ID } : { ok: false, error: auth.error },
}));

let db: InMemoryDb;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createInMemoryAdminClient(db),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing/activation-emails", () => ({
  resolveSiteUrl: async () => "http://127.0.0.1:3000",
}));

const sendVideoPublishedEmailsMock = vi.fn<
  (...args: unknown[]) => Promise<void>
>(async () => undefined);
vi.mock("@/lib/videos/published-emails", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/videos/published-emails")>();
  return {
    ...original,
    sendVideoPublishedEmails: (...args: unknown[]) =>
      sendVideoPublishedEmailsMock(...args),
  };
});

const cloudflare = {
  configured: true,
  createDirectUpload: vi.fn(),
  deleteStreamVideo: vi.fn(),
  getStreamVideo: vi.fn(),
};
vi.mock("@/lib/cloudflare/stream", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/cloudflare/stream")>();
  return {
    ...original,
    getCloudflareStreamConfig: () =>
      cloudflare.configured ? { accountId: "acc", apiToken: "tok" } : null,
    createDirectUpload: (...args: unknown[]) =>
      cloudflare.createDirectUpload(...args),
    deleteStreamVideo: (...args: unknown[]) =>
      cloudflare.deleteStreamVideo(...args),
    getStreamVideo: (...args: unknown[]) => cloudflare.getStreamVideo(...args),
  };
});

const {
  addExternalVideoAction,
  createVideoUploadAction,
  deleteVideoAction,
  moveVideoAction,
  refreshVideoStatusAction,
  updateVideoLabelAction,
} = await import("@/app/admin/(protected)/users/[id]/videos/actions");

function video(overrides: Partial<Row>): Row {
  return {
    id: "d1d10000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    placement: "contractor_page",
    sort_order: 0,
    provider: "external",
    cloudflare_uid: null,
    embed_source_url: TIKTOK_URL,
    admin_label: null,
    status: "ready",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function videos(): Row[] {
  return db.tables.videos ?? [];
}
function audits(): Row[] {
  return db.tables.audit_logs ?? [];
}

beforeEach(() => {
  auth.ok = true;
  db = createInMemoryDb({
    users: [{ id: USER_ID, deleted_at: null }],
    videos: [],
    audit_logs: [],
  });
  sendVideoPublishedEmailsMock.mockClear();
  cloudflare.configured = true;
  cloudflare.createDirectUpload.mockReset();
  cloudflare.deleteStreamVideo.mockReset();
  cloudflare.getStreamVideo.mockReset();
  cloudflare.deleteStreamVideo.mockResolvedValue(undefined);
});

describe("addExternalVideoAction（URL で追加）", () => {
  it("有効な URL で ready 行を追加し、1 本目なら掲載メールを送る", async () => {
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: `  ${TIKTOK_URL}  `,
      adminLabel: " 現場紹介 ",
    });
    expect(result.success).toBe(true);
    expect(videos()).toHaveLength(1);
    expect(videos()[0]).toMatchObject({
      user_id: USER_ID,
      placement: "contractor_page",
      provider: "external",
      embed_source_url: TIKTOK_URL,
      admin_label: "現場紹介",
      status: "ready",
      sort_order: 0,
    });
    expect(sendVideoPublishedEmailsMock).toHaveBeenCalledTimes(1);
    expect(sendVideoPublishedEmailsMock.mock.calls[0]?.[1]).toMatchObject({
      userId: USER_ID,
      placement: "contractor_page",
    });
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({
      action: "video_create",
      actor_id: ADMIN_ID,
      target_type: "videos",
    });
  });

  it("2 本目は末尾の表示順で追加し、掲載メールは送らない", async () => {
    db.tables.videos = [video({ sort_order: 3 })];
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: "https://www.tiktok.com/@u/video/7000000000000000002",
      adminLabel: "",
    });
    expect(result.success).toBe(true);
    expect(videos()).toHaveLength(2);
    expect(videos()[1]).toMatchObject({ sort_order: 4, admin_label: null });
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
  });

  it("別の掲載場所に公開中があっても、この掲載場所の 1 本目ならメールを送る", async () => {
    db.tables.videos = [video({ placement: "client_page" })];
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(result.success).toBe(true);
    expect(sendVideoPublishedEmailsMock).toHaveBeenCalledTimes(1);
  });

  it("処理中（processing）しか無ければ公開中 0 本として 1 本目扱い", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_p", embed_source_url: null, status: "processing" }),
    ];
    await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(sendVideoPublishedEmailsMock).toHaveBeenCalledTimes(1);
  });

  it("不正な URL は拒否し DB に書かない", async () => {
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: "https://vt.tiktok.com/ZSabc/",
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("対応プラットフォームの URL を入力してください");
    }
    expect(videos()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("未知の掲載場所は拒否する", async () => {
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "top_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    expect(videos()).toHaveLength(0);
  });

  it("admin 以外は拒否する", async () => {
    auth.ok = false;
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(result).toEqual({
      success: false,
      error: "この操作を行う権限がありません",
    });
    expect(videos()).toHaveLength(0);
  });

  it("退会済み・存在しないユーザーには追加できない", async () => {
    db.tables.users = [{ id: USER_ID, deleted_at: "2026-08-01T00:00:00Z" }];
    const deleted = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(deleted.success).toBe(false);

    const missing = await addExternalVideoAction({
      userId: "99999999-9999-9999-9999-999999999999",
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(missing.success).toBe(false);
    expect(videos()).toHaveLength(0);
  });

  it("INSERT が失敗したら success:false でメールも送らない", async () => {
    db.failures.videos = { insert: { message: "boom" } };
    const result = await addExternalVideoAction({
      userId: USER_ID,
      placement: "contractor_page",
      url: TIKTOK_URL,
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
  });
});

describe("createVideoUploadAction（ファイルアップロード URL 発行）", () => {
  it("Cloudflare 未設定なら案内メッセージで拒否し、行を作らない", async () => {
    cloudflare.configured = false;
    const result = await createVideoUploadAction({
      userId: USER_ID,
      placement: "client_page",
      adminLabel: "",
    });
    expect(result).toEqual({
      success: false,
      error: CLOUDFLARE_NOT_CONFIGURED_MESSAGE,
    });
    expect(videos()).toHaveLength(0);
  });

  it("direct_upload を発行し processing 行を作って uploadUrl を返す", async () => {
    cloudflare.createDirectUpload.mockResolvedValueOnce({
      uploadURL: "https://upload.example/x",
      uid: "uid_new",
    });
    const result = await createVideoUploadAction({
      userId: USER_ID,
      placement: "client_page",
      adminLabel: "撮影 2026-09",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.uploadUrl).toBe("https://upload.example/x");
      expect(result.data?.videoId).toBe(videos()[0]?.id);
    }
    expect(videos()[0]).toMatchObject({
      provider: "cloudflare",
      cloudflare_uid: "uid_new",
      status: "processing",
      placement: "client_page",
      admin_label: "撮影 2026-09",
    });
    expect(cloudflare.createDirectUpload.mock.calls[0]?.[1]).toMatchObject({
      maxDurationSeconds: 300,
    });
    // 処理中の段階では掲載メールを送らない（ready になったとき）
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
    expect(audits()[0]).toMatchObject({
      action: "video_create",
      metadata: { provider: "cloudflare", cloudflareUid: "uid_new" },
    });
  });

  it("Cloudflare の URL 発行に失敗したら success:false で行を作らない", async () => {
    cloudflare.createDirectUpload.mockRejectedValueOnce(
      new CloudflareStreamError("boom", 500),
    );
    const result = await createVideoUploadAction({
      userId: USER_ID,
      placement: "client_page",
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    expect(videos()).toHaveLength(0);
  });

  it("行の INSERT に失敗したら発行済み UID を Cloudflare から削除する", async () => {
    cloudflare.createDirectUpload.mockResolvedValueOnce({
      uploadURL: "https://upload.example/x",
      uid: "uid_orphan",
    });
    db.failures.videos = { insert: { message: "boom" } };
    const result = await createVideoUploadAction({
      userId: USER_ID,
      placement: "client_page",
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    expect(cloudflare.deleteStreamVideo).toHaveBeenCalledWith(
      expect.anything(),
      "uid_orphan",
    );
  });

  it("admin 以外は Cloudflare を呼ばない", async () => {
    auth.ok = false;
    const result = await createVideoUploadAction({
      userId: USER_ID,
      placement: "client_page",
      adminLabel: "",
    });
    expect(result.success).toBe(false);
    expect(cloudflare.createDirectUpload).not.toHaveBeenCalled();
  });
});

describe("updateVideoLabelAction", () => {
  it("ラベルを更新し監査ログに before / after を残す", async () => {
    db.tables.videos = [video({ admin_label: "旧" })];
    const result = await updateVideoLabelAction({
      videoId: "d1d10000-0000-4000-8000-000000000001",
      adminLabel: "新",
    });
    expect(result.success).toBe(true);
    expect(videos()[0]?.admin_label).toBe("新");
    expect(audits()[0]).toMatchObject({
      action: "video_update",
      metadata: { field: "admin_label", before: "旧", after: "新" },
    });
  });

  it("存在しない動画はエラー", async () => {
    const result = await updateVideoLabelAction({
      videoId: "d1d10000-0000-4000-8000-000000000009",
      adminLabel: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("moveVideoAction（表示順入替）", () => {
  const A = "d1d10000-0000-4000-8000-00000000000a";
  const B = "d1d10000-0000-4000-8000-00000000000b";
  const C = "d1d10000-0000-4000-8000-00000000000c";

  beforeEach(() => {
    db.tables.videos = [
      video({ id: A, sort_order: 0 }),
      video({ id: B, sort_order: 1 }),
      video({ id: C, sort_order: 2 }),
      // 別掲載場所の行は影響を受けない
      video({ id: "d1d10000-0000-4000-8000-00000000000d", placement: "client_page", sort_order: 0 }),
    ];
  });

  function orderOf(placement: string): string[] {
    return videos()
      .filter((v) => v.placement === placement)
      .sort((x, y) => (x.sort_order as number) - (y.sort_order as number))
      .map((v) => v.id as string);
  }

  it("down で 1 つ下と入れ替わり、0..n-1 に振り直す", async () => {
    const result = await moveVideoAction({ videoId: A, direction: "down" });
    expect(result.success).toBe(true);
    expect(orderOf("contractor_page")).toEqual([B, A, C]);
    expect(
      videos().filter((v) => v.placement === "contractor_page").map((v) => v.sort_order).sort(),
    ).toEqual([0, 1, 2]);
    expect(orderOf("client_page")).toEqual(["d1d10000-0000-4000-8000-00000000000d"]);
    expect(audits()[0]).toMatchObject({ action: "video_reorder" });
  });

  it("up で 1 つ上と入れ替わる", async () => {
    const result = await moveVideoAction({ videoId: C, direction: "up" });
    expect(result.success).toBe(true);
    expect(orderOf("contractor_page")).toEqual([A, C, B]);
  });

  it("端にある動画をさらに動かしても順序は変わらない", async () => {
    const result = await moveVideoAction({ videoId: A, direction: "up" });
    expect(result.success).toBe(true);
    expect(orderOf("contractor_page")).toEqual([A, B, C]);
    expect(audits()).toHaveLength(0);
  });
});

describe("deleteVideoAction", () => {
  it("Cloudflare 動画は Cloudflare 側も削除してから行を消す", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_del", embed_source_url: null }),
    ];
    const result = await deleteVideoAction({
      videoId: "d1d10000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
    expect(cloudflare.deleteStreamVideo).toHaveBeenCalledWith(
      expect.anything(),
      "uid_del",
    );
    expect(videos()).toHaveLength(0);
    expect(audits()[0]).toMatchObject({
      action: "video_delete",
      metadata: { cloudflareUid: "uid_del", cloudflareDeleteError: null },
    });
  });

  it("Cloudflare 側の削除に失敗しても行は消し、エラーを監査 metadata に残す", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_del", embed_source_url: null }),
    ];
    cloudflare.deleteStreamVideo.mockRejectedValueOnce(
      new CloudflareStreamError("DELETE failed (500)", 500),
    );
    const result = await deleteVideoAction({
      videoId: "d1d10000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
    expect(videos()).toHaveLength(0);
    expect(audits()[0]).toMatchObject({
      metadata: { cloudflareDeleteError: "DELETE failed (500)" },
    });
  });

  it("external 動画は Cloudflare を呼ばない", async () => {
    db.tables.videos = [video({})];
    const result = await deleteVideoAction({
      videoId: "d1d10000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
    expect(cloudflare.deleteStreamVideo).not.toHaveBeenCalled();
    expect(videos()).toHaveLength(0);
  });

  it("admin 以外は削除できない", async () => {
    auth.ok = false;
    db.tables.videos = [video({})];
    const result = await deleteVideoAction({
      videoId: "d1d10000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(false);
    expect(videos()).toHaveLength(1);
  });
});

describe("refreshVideoStatusAction（状態確認）", () => {
  const ID = "d1d10000-0000-4000-8000-000000000001";

  it("既に ready なら Cloudflare を呼ばず ready を返す", async () => {
    db.tables.videos = [video({})];
    const result = await refreshVideoStatusAction({ videoId: ID });
    expect(result).toEqual({ success: true, data: { status: "ready", detail: null } });
    expect(cloudflare.getStreamVideo).not.toHaveBeenCalled();
  });

  it("まだ処理中なら processing と状態の説明を返す", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_x", embed_source_url: null, status: "processing" }),
    ];
    cloudflare.getStreamVideo.mockResolvedValueOnce({
      uid: "uid_x",
      readyToStream: false,
      state: "inprogress",
      errorReasonText: null,
    });
    const result = await refreshVideoStatusAction({ videoId: ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.status).toBe("processing");
      expect(result.data?.detail).toContain("処理中");
    }
    expect(videos()[0]?.status).toBe("processing");
  });

  it("変換エラーは削除して再登録するよう案内する", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_x", embed_source_url: null, status: "processing" }),
    ];
    cloudflare.getStreamVideo.mockResolvedValueOnce({
      uid: "uid_x",
      readyToStream: false,
      state: "error",
      errorReasonText: "ERR_UNSUPPORTED_CODEC",
    });
    const result = await refreshVideoStatusAction({ videoId: ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.detail).toContain("削除して再登録");
    }
  });

  it("Cloudflare が ready なら公開にし、1 本目なら掲載メールを送る", async () => {
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_x", embed_source_url: null, status: "processing" }),
    ];
    cloudflare.getStreamVideo.mockResolvedValueOnce({
      uid: "uid_x",
      readyToStream: true,
      state: "ready",
      errorReasonText: null,
    });
    const result = await refreshVideoStatusAction({ videoId: ID });
    expect(result).toEqual({ success: true, data: { status: "ready", detail: null } });
    expect(videos()[0]?.status).toBe("ready");
    expect(sendVideoPublishedEmailsMock).toHaveBeenCalledTimes(1);
    expect(audits()[0]).toMatchObject({
      action: "video_update",
      metadata: { field: "status", after: "ready", via: "refresh" },
    });
  });

  it("Cloudflare 未設定なら案内メッセージで拒否する", async () => {
    cloudflare.configured = false;
    db.tables.videos = [
      video({ provider: "cloudflare", cloudflare_uid: "uid_x", embed_source_url: null, status: "processing" }),
    ];
    const result = await refreshVideoStatusAction({ videoId: ID });
    expect(result).toEqual({
      success: false,
      error: CLOUDFLARE_NOT_CONFIGURED_MESSAGE,
    });
  });
});
