import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryAdminClient,
  createInMemoryDb,
  type InMemoryDb,
  type Row,
} from "./in-memory-admin-client";

/**
 * markVideoReady（Cloudflare 処理完了 → 公開）の冪等性と「1 本目だけメール」を検証する。
 * Webhook と「状態を確認」ボタンの共通処理。
 */

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

const { markVideoReady } = await import("@/lib/videos/mark-ready");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SITE = "http://127.0.0.1:3000";

let db: InMemoryDb;

function row(overrides: Partial<Row>): Row {
  return {
    id: "v-1",
    user_id: USER_ID,
    placement: "contractor_page",
    sort_order: 0,
    provider: "cloudflare",
    cloudflare_uid: "uid_1",
    embed_source_url: null,
    admin_label: null,
    status: "processing",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  db = createInMemoryDb({ videos: [] });
  sendVideoPublishedEmailsMock.mockClear();
});

describe("markVideoReady", () => {
  it("該当 UID が無ければ not_found（削除済み・別環境の Webhook）", async () => {
    const admin = createInMemoryAdminClient(db);
    const result = await markVideoReady(admin as never, {
      cloudflareUid: "unknown",
      siteUrl: SITE,
    });
    expect(result).toEqual({ outcome: "not_found" });
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
  });

  it("processing → ready にし、公開中 0 本からの 1 本目なら掲載メールを送る", async () => {
    db.tables.videos = [row({})];
    const admin = createInMemoryAdminClient(db);
    const result = await markVideoReady(admin as never, {
      cloudflareUid: "uid_1",
      siteUrl: SITE,
    });
    expect(result).toEqual({ outcome: "marked_ready", videoId: "v-1", emailSent: true });
    expect(db.tables.videos[0]?.status).toBe("ready");
    expect(sendVideoPublishedEmailsMock).toHaveBeenCalledTimes(1);
    expect(sendVideoPublishedEmailsMock.mock.calls[0]?.[1]).toEqual({
      userId: USER_ID,
      placement: "contractor_page",
      siteUrl: SITE,
    });
  });

  it("同じ掲載場所に公開中が既にあればメールを送らない", async () => {
    db.tables.videos = [
      row({ id: "v-0", cloudflare_uid: null, provider: "external", embed_source_url: "https://www.tiktok.com/@u/video/1", status: "ready" }),
      row({}),
    ];
    const admin = createInMemoryAdminClient(db);
    const result = await markVideoReady(admin as never, {
      cloudflareUid: "uid_1",
      siteUrl: SITE,
    });
    expect(result).toEqual({ outcome: "marked_ready", videoId: "v-1", emailSent: false });
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
  });

  it("既に ready なら何もしない（Webhook 再送・二重確認に対して冪等）", async () => {
    db.tables.videos = [row({ status: "ready" })];
    const admin = createInMemoryAdminClient(db);
    const result = await markVideoReady(admin as never, {
      cloudflareUid: "uid_1",
      siteUrl: SITE,
    });
    expect(result).toEqual({ outcome: "already_ready" });
    expect(sendVideoPublishedEmailsMock).not.toHaveBeenCalled();
  });

  it("SELECT が失敗したら throw する（呼び出し側がログして 200 / エラー表示）", async () => {
    db.failures.videos = { select: { message: "boom" } };
    const admin = createInMemoryAdminClient(db);
    await expect(
      markVideoReady(admin as never, { cloudflareUid: "uid_1", siteUrl: SITE }),
    ).rejects.toBeTruthy();
  });
});
