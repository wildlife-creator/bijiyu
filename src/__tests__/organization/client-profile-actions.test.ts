import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockAdminStorageFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    storage: { from: (...args: unknown[]) => mockAdminStorageFrom(...args) },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  saveClientProfileAction,
  uploadClientProfileImageAction,
} from "@/app/(authenticated)/mypage/client-profile/actions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";

function mockAuth(userId: string | null) {
  if (userId) {
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "x" } });
  }
}

interface Terminator {
  single?: { data?: unknown; error?: unknown };
  maybeSingle?: { data?: unknown; error?: unknown };
  thenable?: { data?: unknown; error?: unknown };
}

function createQueryMock(t: Terminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(t.maybeSingle ?? { data: null, error: null }),
    single: vi.fn().mockResolvedValue(t.single ?? { data: null, error: null }),
  };
  if (t.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: t.thenable?.data ?? null, error: t.thenable?.error ?? null }),
    });
  }
  return chain;
}

beforeEach(() => {
  // mockClear() / vi.clearAllMocks() は mockReturnValueOnce の queue を残すので
  // 各 spy を mockReset() で完全クリア（仮想モジュール側の createClient mock は
  // 引数無しでプロパティアクセス時にこれら spy を参照するので影響なし）。
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockStorageFrom.mockReset();
  mockAdminStorageFrom.mockReset();
  // saveClientProfileAction / uploadClientProfileImageAction の冒頭で走る Staff ガード
  // （organization_members.org_role === 'staff' か確認する SELECT）は
  // 各テストで共通に通過させる: data=null を返して非 staff 扱い。
  mockFrom.mockReturnValueOnce(
    createQueryMock({ maybeSingle: { data: null, error: null } }),
  );
});

const basePersonalInput = {
  displayName: "田中太郎",
  address: null,
  imageUrl: null,
  recruitJobTypes: ["内装工"],
  recruitArea: ["東京都"],
  employeeScale: null,
  workingWay: null,
  language: null,
  message: null,
  snsX: false,
  snsInstagram: false,
  snsTiktok: false,
  snsYoutube: false,
  snsFacebook: false,
};

describe("saveClientProfileAction", () => {
  it("未認証はエラー", async () => {
    mockAuth(null);
    const r = await saveClientProfileAction(basePersonalInput, { mode: "edit" });
    expect(r.success).toBe(false);
  });

  it("edit モード + プラン未加入（contractor 等）は「発注者プランに加入していない」エラー", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    const r = await saveClientProfileAction(basePersonalInput, { mode: "edit" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("発注者プランに加入していない");
  });

  it("setup モード + skip=true + プラン未加入は「発注者プランに加入していない」エラー", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    const r = await saveClientProfileAction(basePersonalInput, { mode: "setup", skip: true });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("発注者プランに加入していない");
  });

  it("setup モード + 通常 save + プラン未加入は soft retry エラー（Webhook race 想定）", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    const r = await saveClientProfileAction(basePersonalInput, { mode: "setup" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("プラン情報を反映中");
  });

  it("非法人プラン + setup モード + skip → DB 書き込みせず /mypage へ", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { plan_type: "individual", status: "active" },
          error: null,
        },
      }),
    );
    const r = await saveClientProfileAction(basePersonalInput, { mode: "setup", skip: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/mypage");
  });

  it("法人プラン + setup モード + skip → スキップ不可エラー", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { plan_type: "corporate", status: "active" },
          error: null,
        },
      }),
    );
    const r = await saveClientProfileAction(basePersonalInput, { mode: "setup", skip: true });
    expect(r.success).toBe(false);
  });

  it("法人プラン + display_name 空文字はバリデーションエラー", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { plan_type: "corporate", status: "active" },
          error: null,
        },
      }),
    );
    const r = await saveClientProfileAction(
      { ...basePersonalInput, displayName: "" } as typeof basePersonalInput,
      { mode: "edit" },
    );
    expect(r.success).toBe(false);
  });

  it("正常系: upsert が呼ばれ redirectTo が返る（edit モード）", async () => {
    mockAuth(OWNER_ID);
    mockFrom.mockReturnValueOnce(createQueryMock({ maybeSingle: { data: null, error: null } }));
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { plan_type: "individual", status: "active" },
          error: null,
        },
      }),
    );
    const upsertChain = createQueryMock({
      thenable: { data: null, error: null },
    });
    mockFrom.mockReturnValueOnce(upsertChain);

    const r = await saveClientProfileAction(basePersonalInput, { mode: "edit" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/mypage/client-profile");
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: OWNER_ID,
        display_name: "田中太郎",
        recruit_job_types: ["内装工"],
        recruit_area: ["東京都"],
      }),
      expect.objectContaining({ onConflict: "user_id" }),
    );
  });
});

describe("uploadClientProfileImageAction", () => {
  it("ファイル未選択はエラー", async () => {
    mockAuth(OWNER_ID);
    const fd = new FormData();
    const r = await uploadClientProfileImageAction(fd);
    expect(r.success).toBe(false);
  });

  it("5MB 超過はエラー", async () => {
    mockAuth(OWNER_ID);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "a.jpg", {
      type: "image/jpeg",
    });
    const fd = new FormData();
    fd.set("image", big);
    const r = await uploadClientProfileImageAction(fd);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("5MB");
  });

  it("MIME 不正はエラー", async () => {
    mockAuth(OWNER_ID);
    const bad = new File([new Uint8Array(10)], "a.gif", { type: "image/gif" });
    const fd = new FormData();
    fd.set("image", bad);
    const r = await uploadClientProfileImageAction(fd);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("JPEGまたはPNG");
  });

  it("正常系: Storage upload + getPublicUrl で URL を返す", async () => {
    mockAuth(OWNER_ID);
    // resolveProfileUserId
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: "x" }, error: null });
    mockStorageFrom.mockReturnValue({ upload: uploadMock });
    mockAdminStorageFrom.mockReturnValue({
      getPublicUrl: () => ({ data: { publicUrl: "https://example.com/a.jpg" } }),
    });

    const good = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    const fd = new FormData();
    fd.set("image", good);
    const r = await uploadClientProfileImageAction(fd);
    expect(r.success).toBe(true);
    // cache buster `?t=<timestamp>` が付与されることを想定（React state 差し替え検知）
    if (r.success)
      expect(r.data?.imageUrl).toMatch(/^https:\/\/example\.com\/a\.jpg\?t=\d+$/);
    expect(uploadMock).toHaveBeenCalledWith(
      `${OWNER_ID}/client-profile.jpg`,
      good,
      expect.objectContaining({ upsert: true, contentType: "image/jpeg" }),
    );
  });
});
