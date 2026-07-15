import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup (Supabase server/admin clients + email)
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockAdminFrom = vi.fn();

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
  }),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { sendMessageAction, respondToScoutAction } from "@/app/(authenticated)/messages/[threadId]/actions";
import { sendScoutAction } from "@/app/(authenticated)/messages/scout-send/actions";
import { sendBulkMessagesAction } from "@/app/(authenticated)/messages/bulk-send/actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const CONTRACTOR_ID = "33333333-3333-3333-3333-333333333333";
const THREAD_ID = "44444444-4444-4444-4444-444444444444";
const MESSAGE_ID = "55555555-5555-5555-5555-555555555555";
const JOB_ID = "66666666-6666-6666-6666-666666666666";
const ORG_ID = "77777777-7777-7777-7777-777777777777";

function mockAuth(userId: string | null) {
  if (userId) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  } else {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });
  }
}

/**
 * Build a chainable query mock that terminates with a given response.
 * Supports: select, eq, in, or, order, range, is, neq, gte, lt, limit,
 * update, insert, single, maybeSingle, then-able ({ data, error }).
 */
interface Terminator {
  single?: { data?: unknown; error?: unknown };
  maybeSingle?: { data?: unknown; error?: unknown };
  thenable?: { data?: unknown; error?: unknown; count?: number };
}

function createQueryMock(terminator: Terminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      terminator.single ?? { data: null, error: null },
    ),
    maybeSingle: vi.fn().mockResolvedValue(
      terminator.maybeSingle ?? { data: null, error: null },
    ),
  };

  // Enable awaiting the builder directly (for chains without .single/.maybeSingle)
  if (terminator.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({
          data: terminator.thenable?.data ?? null,
          error: terminator.thenable?.error ?? null,
          count: terminator.thenable?.count,
        }),
    });
  }

  return chain;
}

beforeEach(() => {
  // `vi.clearAllMocks()` は mockReturnValueOnce の onceValues queue を残すため、
  // 明示的に mockReset で queue 込みでクリアする (CLAUDE.md「Vitest モック関連」)。
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockAdminFrom.mockReset();
});

// ===========================================================================
// sendMessageAction
// ===========================================================================
describe("sendMessageAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const defaults: Record<string, string> = {
      threadId: THREAD_ID,
      body: "テストメッセージ本文",
    };
    for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("threadId が未指定ならエラーを返す", async () => {
    mockAuth(USER_ID);
    const fd = new FormData();
    fd.set("body", "本文");
    const result = await sendMessageAction(fd);
    expect(result.success).toBe(false);
  });

  it("アクセス不可能なスレッドではエラーを返す", async () => {
    mockAuth(USER_ID);
    // canAccessThread: RLS 拒否で null 返却
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: null, error: { message: "RLS denied" } },
      }),
    );
    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("スレッドが見つかりません");
  });

  it("本文が空かつ画像もない場合はエラーを返す", async () => {
    mockAuth(USER_ID);
    // 1. canAccessThread
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: USER_ID,
            participant_2_id: CONTRACTOR_ID,
            organization_id: null,
            thread_type: "message",
          },
          error: null,
        },
      }),
    );
    // 2. rate limit count
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null, count: 0 } }),
    );
    // 3. organization_members.select for is_proxy check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: null, error: null },
      }),
    );

    const fd = new FormData();
    fd.set("threadId", THREAD_ID);
    fd.set("body", "   ");
    const result = await sendMessageAction(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("メッセージを入力");
  });

  // -------------------------------------------------------------------------
  // direct-upload 化した添付画像パス (imagePath) の検証
  // -------------------------------------------------------------------------
  function queueSendHappyPath(messagesChain: ReturnType<typeof createQueryMock>) {
    mockAuth(USER_ID);
    // 1. canAccessThread
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: USER_ID,
            participant_2_id: CONTRACTOR_ID,
            organization_id: null,
            thread_type: "message",
          },
          error: null,
        },
      }),
    );
    // 2. rate limit count
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null, count: 0 } }),
    );
    // 3. organization_members.select (is_proxy check)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 4. messages.insert.select.single
    mockFrom.mockReturnValueOnce(messagesChain);
    // 5. message_threads.update.eq (thenable)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
  }

  it("本人フォルダ外の imagePath は『画像データが不正』で拒否する", async () => {
    queueSendHappyPath(
      createQueryMock({ single: { data: { id: MESSAGE_ID }, error: null } }),
    );

    const result = await sendMessageAction(
      buildFormData({ imagePath: "other-user/evil.png" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("画像データが不正");
  });

  it("正常な imagePath は messages.image_url にそのまま保存する", async () => {
    const messagesChain = createQueryMock({
      single: { data: { id: MESSAGE_ID }, error: null },
    });
    queueSendHappyPath(messagesChain);

    const imagePath = `${USER_ID}/abc.png`;
    const result = await sendMessageAction(buildFormData({ imagePath }));
    expect(result.success).toBe(true);
    expect(messagesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: imagePath }),
    );
  });

  it("組織メンバー（participant ではない）でも送信できる", async () => {
    mockAuth(USER_ID);
    // 1. canAccessThread: thread with organization_id, user is neither participant
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: OTHER_USER_ID,
            participant_2_id: CONTRACTOR_ID,
            organization_id: ORG_ID,
            thread_type: "message",
          },
          error: null,
        },
      }),
    );
    // 2. rate limit count
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null, count: 0 } }),
    );
    // 3. organization_members.select
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 4. messages.insert.select.single
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { id: MESSAGE_ID }, error: null },
      }),
    );
    // 5. message_threads.update.eq (thenable)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data?.messageId).toBe(MESSAGE_ID);
  });

  // -------------------------------------------------------------------------
  // A7 回帰 (R5.3): identity ベース退会/解散ガード
  // -------------------------------------------------------------------------
  it("A7: 組織スレッドで元 participant staff が退会でも、組織自体が生きていれば送信可能", async () => {
    // シナリオ: participant_1 = 退会済み staff、organization_1 = 組織 (生きている)。
    // viewer = Owner (participant_1/2 でも登録 org 側)。旧実装だと staff の
    // deleted_at で誤ブロックされていた。identity ベース化で通るようになる。
    mockAuth(USER_ID);
    // 1. canAccessThread (nested に participant + organizations の deleted_at を含む)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: OTHER_USER_ID, // 元 staff (退会済み)
            participant_2_id: CONTRACTOR_ID,
            organization_id: ORG_ID,
            organization_1_id: ORG_ID,
            organization_2_id: null,
            thread_type: "message",
            participant_1: { deleted_at: "2026-01-01T00:00:00Z" }, // 退会
            participant_2: { deleted_at: null },
            organization_1: { deleted_at: null }, // 組織は生きている
            organization_2: null,
          },
          error: null,
        },
      }),
    );
    // 2. getActiveOrganizationContext → USER (Owner) は ORG_ID 所属
    //    (thenable 経由の deep call は簡略化のため active=null 相当で返す。
    //     この場合 viewerOrgId = null で isCounterpartWithdrawn は
    //     non-blocking fallback を返す = A7 の意図と一致)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );
    // 3. rate limit
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null, count: 0 } }),
    );
    // 4. messages.insert.select.single
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { id: MESSAGE_ID }, error: null },
      }),
    );
    // 5. message_threads.update.eq
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(true);
  });

  it("A7: counterpart が個人 identity で退会済み → 送信ブロック", async () => {
    // シナリオ: 1対1個人スレッド (org_1/2 とも null) で相手 (participant_2) が退会
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: USER_ID,
            participant_2_id: OTHER_USER_ID,
            organization_id: null,
            organization_1_id: null,
            organization_2_id: null,
            thread_type: "message",
            participant_1: { deleted_at: null },
            participant_2: { deleted_at: "2026-01-01T00:00:00Z" }, // 相手退会
            organization_1: null,
            organization_2: null,
          },
          error: null,
        },
      }),
    );
    // getActiveOrganizationContext → active=null
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("退会");
  });

  it("レート制限超過時はエラーを返す", async () => {
    mockAuth(USER_ID);
    // 1. canAccessThread
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: THREAD_ID,
            participant_1_id: USER_ID,
            participant_2_id: CONTRACTOR_ID,
            organization_id: null,
            thread_type: "message",
          },
          error: null,
        },
      }),
    );
    // 2. R5.2: getActiveOrganizationContext (viewerOrgId 解決) → empty
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );
    // 3. rate limit count (超過)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null, count: 10 } }),
    );

    const result = await sendMessageAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("送信頻度");
  });
});

// ===========================================================================
// respondToScoutAction (message-level scout_status)
// ===========================================================================
describe("respondToScoutAction", () => {
  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await respondToScoutAction(MESSAGE_ID, "accepted");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("メッセージが見つからない場合はエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: null, error: { message: "not found" } },
      }),
    );
    const result = await respondToScoutAction(MESSAGE_ID, "accepted");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("スカウトメッセージが見つかりません");
  });

  it("is_scout=false のメッセージにはエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: MESSAGE_ID,
            thread_id: THREAD_ID,
            sender_id: OTHER_USER_ID,
            job_id: JOB_ID,
            is_scout: false,
            scout_status: null,
          },
          error: null,
        },
      }),
    );
    const result = await respondToScoutAction(MESSAGE_ID, "accepted");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("このメッセージはスカウトではありません");
  });

  it("既に応答済み（scout_status != pending）はエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: MESSAGE_ID,
            thread_id: THREAD_ID,
            sender_id: OTHER_USER_ID,
            job_id: JOB_ID,
            is_scout: true,
            scout_status: "accepted",
          },
          error: null,
        },
      }),
    );
    const result = await respondToScoutAction(MESSAGE_ID, "rejected");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("このスカウトには既に応答済みです");
  });

  it("スレッドの受信者でなければエラーを返す", async () => {
    mockAuth(USER_ID);
    // 1. messages.select (scout message)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: MESSAGE_ID,
            thread_id: THREAD_ID,
            sender_id: OTHER_USER_ID,
            job_id: JOB_ID,
            is_scout: true,
            scout_status: "pending",
          },
          error: null,
        },
      }),
    );
    // 2. message_threads.select (Phase 2: identity 4 列) — USER_ID はどちらの
    //    「organization_X_id が null な side の participant」にも該当しない
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            participant_1_id: "99999999-0000-0000-0000-999999999999",
            participant_2_id: OTHER_USER_ID,
            organization_1_id: null,
            organization_2_id: null,
          },
          error: null,
        },
      }),
    );

    const result = await respondToScoutAction(MESSAGE_ID, "accepted");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("スカウトへの応答権限がありません");
  });

  it("正常系: 受諾すると jobId と messageId を返す", async () => {
    mockAuth(USER_ID);
    // 1. messages.select (scout)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: MESSAGE_ID,
            thread_id: THREAD_ID,
            sender_id: OTHER_USER_ID,
            job_id: JOB_ID,
            is_scout: true,
            scout_status: "pending",
          },
          error: null,
        },
      }),
    );
    // 2. message_threads.select (Phase 2: 4 列で organization_2_id=null な side に USER_ID)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            participant_1_id: OTHER_USER_ID,
            participant_2_id: USER_ID,
            organization_1_id: null,
            organization_2_id: null,
          },
          error: null,
        },
      }),
    );
    // 3. admin.messages.update.eq (thenable)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await respondToScoutAction(MESSAGE_ID, "accepted");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.jobId).toBe(JOB_ID);
      expect(result.data?.messageId).toBe(MESSAGE_ID);
    }
  });

  it("同一スレッド内の複数スカウトは独立に応答できる（messageId ベース）", async () => {
    // Scout A: accepted, Scout B: pending の状況で B に応答する
    mockAuth(USER_ID);
    const SCOUT_B_ID = "88888888-8888-8888-8888-888888888888";
    const JOB_B_ID = "99999999-9999-9999-9999-999999999999";

    // 1. messages.select (B: まだ pending)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            id: SCOUT_B_ID,
            thread_id: THREAD_ID,
            sender_id: OTHER_USER_ID,
            job_id: JOB_B_ID,
            is_scout: true,
            scout_status: "pending",
          },
          error: null,
        },
      }),
    );
    // 2. message_threads.select (Phase 2: 4 列)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: {
            participant_1_id: OTHER_USER_ID,
            participant_2_id: USER_ID,
            organization_1_id: null,
            organization_2_id: null,
          },
          error: null,
        },
      }),
    );
    // 3. admin.messages.update
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await respondToScoutAction(SCOUT_B_ID, "rejected");
    expect(result.success).toBe(true);
    if (result.success) {
      // B の messageId が返る（A の messageId ではない）
      expect(result.data?.messageId).toBe(SCOUT_B_ID);
      expect(result.data?.jobId).toBe(JOB_B_ID);
    }
  });
});

// ===========================================================================
// sendScoutAction (org-aware thread reuse + duplicate check)
// ===========================================================================
describe("sendScoutAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const defaults: Record<string, string> = {
      userId: CONTRACTOR_ID,
      jobId: JOB_ID,
      title: "スカウトタイトル",
      body: "スカウト本文です",
    };
    for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("contractor ロールはスカウト送信不可", async () => {
    mockAuth(USER_ID);
    // users.select(role).single
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "contractor" }, error: null },
      }),
    );
    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("発注者のみ");
  });

  it("Zod バリデーションエラーを返す（userId が不正な UUID）", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    const result = await sendScoutAction(buildFormData({ userId: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("正常系: 法人プラン（organization_id あり）で既存スレッドを再利用してスカウト送信", async () => {
    mockAuth(USER_ID);
    // 1. users.select(role).single → client
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. organization_members.select.maybeSingle → organization_id あり (自分の active org)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 修正1: applications 応募済みチェック (admin) → 未応募
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 3. Phase 2 findOrCreateThread: admin.organization_members で相手 (受注者) の
    //    組織所属を解決 → 受注者は org 無し
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 修正8: jobs 所有権チェック（owner_id === 送信者）→ title もここで取得
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            title: "テスト案件",
            owner_id: USER_ID,
            organization_id: null,
          },
          error: null,
        },
      }),
    );
    // 4. message_threads.select.or(...) (thenable) → identity ペアが一致する既存スレッド
    //    注: getActiveOrganizationContext は本テストの浅いモック配下では active=null を返し
    //    実効 organizationId は null になる (個人プラン相当)。identity 一致は個人ペアで成立させる。
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: THREAD_ID,
              thread_type: "scout",
              participant_1_id: USER_ID,
              participant_2_id: CONTRACTOR_ID,
              organization_1_id: null,
              organization_2_id: null,
            },
          ],
          error: null,
        },
      }),
    );
    // 5. messages.select (duplicate scout check).maybeSingle → なし
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: null, error: null },
      }),
    );
    // 5. messages.insert.select.single → 成功
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { id: MESSAGE_ID }, error: null },
      }),
    );
    // 6. message_threads.update.eq (thenable)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 8. users.select(email).eq.single (target user) → email なしで email ブロックをスキップ
    //    (案件タイトルは上部の所有権チェックで取得済み。旧 jobs.select(title) は廃止)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { email: null }, error: null },
      }),
    );

    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.threadId).toBe(THREAD_ID);
      expect(result.data?.messageId).toBe(MESSAGE_ID);
    }
  });

  it("重複スカウト（同一案件×同一受注者）はエラーを返す", async () => {
    mockAuth(USER_ID);
    // 1. role check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member (自分の active org)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 修正1: applications 応募済みチェック (admin) → 未応募
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 3. Phase 2 findOrCreateThread: admin で相手 (受注者) の org 解決 → 無し
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 修正8: jobs 所有権チェック（owner_id === 送信者）→ title もここで取得
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            title: "テスト案件",
            owner_id: USER_ID,
            organization_id: null,
          },
          error: null,
        },
      }),
    );
    // 4. message_threads.select.or → identity ペア一致で既存スレッド
    //    (getActiveOrganizationContext モック上 active=null → 個人プラン相当)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: THREAD_ID,
              thread_type: "scout",
              participant_1_id: USER_ID,
              participant_2_id: CONTRACTOR_ID,
              organization_1_id: null,
              organization_2_id: null,
            },
          ],
          error: null,
        },
      }),
    );
    // 5. messages.select (duplicate scout check) → 既存あり
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { id: "existing-scout-id" },
          error: null,
        },
      }),
    );

    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toContain("既にこの案件でスカウト");
  });

  it("修正1: 応募済みの職人には同一案件のスカウトを送れない（全ステータス）", async () => {
    mockAuth(USER_ID);
    // 1. role check → client
    mockFrom.mockReturnValueOnce(
      createQueryMock({ single: { data: { role: "client" }, error: null } }),
    );
    // 2. organization_members (getActiveOrganizationContext) → active=null
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 修正8: jobs 所有権チェック（owner_id === 送信者）→ 通過させる
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            title: "テスト案件",
            owner_id: USER_ID,
            organization_id: null,
          },
          error: null,
        },
      }),
    );
    // 3. 修正1: applications 応募済みチェック (admin) → 応募あり（お断り済み等でも拒否）
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { id: "existing-app-id" }, error: null },
      }),
    );

    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("この職人はこの案件に既に応募しています");
  });

  it("個人プラン（organization_id なし）で新規スレッドを作成してスカウト送信", async () => {
    mockAuth(USER_ID);
    // 1. role check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member → なし (個人プラン)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: null, error: null },
      }),
    );
    // 修正1: applications 応募済みチェック (admin) → 未応募
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 3. Phase 2 findOrCreateThread: admin で相手 (受注者) の org 解決 → 無し
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 修正8: jobs 所有権チェック（owner_id === 送信者）→ title もここで取得
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            title: "テスト案件",
            owner_id: USER_ID,
            organization_id: null,
          },
          error: null,
        },
      }),
    );
    // 4. message_threads.select.or → identity ペア一致無し (candidates 空)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [], error: null },
      }),
    );
    // 5. findOrCreateThread: message_threads.insert.select.single → 新規作成成功
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: {
          data: { id: THREAD_ID, thread_type: "scout" },
          error: null,
        },
      }),
    );
    // 5. messages.select (duplicate check) → なし
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: null, error: null },
      }),
    );
    // 6. messages.insert.select.single → 成功
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { id: MESSAGE_ID }, error: null },
      }),
    );
    // 7. message_threads.update.eq
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 8. jobs.select(title).eq.single (A3: 案件タイトル解決)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { title: "テスト案件" }, error: null },
      }),
    );
    // 9. users.select(email) → email なしでスキップ
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { email: null }, error: null },
      }),
    );

    const result = await sendScoutAction(buildFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.threadId).toBe(THREAD_ID);
      expect(result.data?.messageId).toBe(MESSAGE_ID);
    }
  });
});

// ===========================================================================
// sendBulkMessagesAction
// ===========================================================================
describe("sendBulkMessagesAction", () => {
  function buildFormData(
    recipientIds: string[],
    body: string = "一斉送信テスト本文",
  ): FormData {
    const fd = new FormData();
    fd.set("recipientIds", JSON.stringify(recipientIds));
    fd.set("body", body);
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("contractor ロールは一斉送信不可", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "contractor" }, error: null },
      }),
    );
    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("発注者のみ");
  });

  it("recipientIds が不正な JSON だとエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    const fd = new FormData();
    fd.set("recipientIds", "not-json");
    fd.set("body", "本文");
    const result = await sendBulkMessagesAction(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("送信先の形式");
  });

  it("recipientIds が空配列の場合は Zod バリデーションエラー", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    const result = await sendBulkMessagesAction(buildFormData([]));
    expect(result.success).toBe(false);
  });

  it("正常系: 法人プランで identity ペア一致の既存スレッドを再利用して送信", async () => {
    mockAuth(USER_ID);
    // 1. role check → client
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member → organization あり (自分の active org)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 3. 宛先の退会チェック (admin.users) → 在籍中
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { deleted_at: null }, error: null },
      }),
    );
    // 3b. Phase 2: admin で相手 (受注者) の org 解決 → 無し
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 4. message_threads.select.or → identity ペア一致で既存スレッド
    //    (getActiveOrganizationContext モック上 active=null → 個人プラン相当)
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: THREAD_ID,
              participant_1_id: USER_ID,
              participant_2_id: CONTRACTOR_ID,
              organization_1_id: null,
              organization_2_id: null,
            },
          ],
          error: null,
        },
      }),
    );
    // 5. messages.insert (no terminator) → 成功
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 6. message_threads.update.eq (updated_at)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.sent).toBe(1);
      expect(result.data?.failed).toBe(0);
    }
  });

  it("正常系: 法人プランで新規スレッドを作成して送信", async () => {
    mockAuth(USER_ID);
    // 1. role check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 3. 宛先の退会チェック (admin.users) → 在籍中
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { deleted_at: null }, error: null },
      }),
    );
    // 3b. Phase 2: admin で相手 (受注者) の org 解決 → 無し
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // 4. 既存スレッド検索 (thenable) → identity ペア一致無し
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [], error: null },
      }),
    );
    // 5. message_threads.insert.select.single → 新規作成
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { id: THREAD_ID }, error: null },
      }),
    );
    // 6. messages.insert → 成功
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 7. message_threads.update.eq
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.sent).toBe(1);
      expect(result.data?.failed).toBe(0);
    }
  });

  it("退会済みの宛先はスキップして failed にカウントする", async () => {
    mockAuth(USER_ID);
    // 1. role check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 3. 宛先の退会チェック (admin.users) → 退会済み
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { deleted_at: "2026-07-01T00:00:00Z" },
          error: null,
        },
      }),
    );
    // 以降の org 解決 / スレッド検索 / insert は呼ばれない

    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.sent).toBe(0);
      expect(result.data?.failed).toBe(1);
    }
  });

  it("宛先ユーザーが存在しない場合もスキップして failed にカウントする", async () => {
    mockAuth(USER_ID);
    // 1. role check
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: { role: "client" }, error: null },
      }),
    );
    // 2. org member
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { organization_id: ORG_ID, is_proxy_account: false },
          error: null,
        },
      }),
    );
    // 3. 宛先の退会チェック (admin.users) → 行なし
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );

    const result = await sendBulkMessagesAction(buildFormData([CONTRACTOR_ID]));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.sent).toBe(0);
      expect(result.data?.failed).toBe(1);
    }
  });
});
