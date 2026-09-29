import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * submitCcusAction（CCUS 登録申請）のテスト。
 *
 * カード画像はブラウザから Storage へ直接アップロード済みで、Action は
 * ストレージパスと技能者 ID だけを受け取る（CLAUDE.md「ファイル本体を
 * Server Action (FormData) で送ってはならない」）。Action 自体はモックせず、
 * Supabase クライアント・admin client・sendEmail・next/headers だけを差し替えて
 * 実ロジックを通す。sendVerificationEmails（通知メールの共通ヘルパー）も実体を通す。
 */

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// 監査ログは service_role の共通ヘルパーで書く（会員セッションからの INSERT は RLS で必ず失敗するため）
const mockWriteAuditLog = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([
      ["host", "127.0.0.1:3000"],
      ["x-forwarded-proto", "http"],
    ]),
}));

import { submitCcusAction } from "@/app/(authenticated)/profile/verification/ccus/actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const VERIFICATION_ID = "44444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-09-29T01:23:45.000Z";

const VALID_PATH = `${USER_ID}/ccus-card.jpg`;
const WORKER_ID = "12345678901234";

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface ChainMock {
  table: string;
  selects: string[];
  eqs: Array<[string, unknown]>;
  inserts: Array<Record<string, unknown>>;
  select: (cols: string) => ChainMock;
  eq: (col: string, value: unknown) => ChainMock;
  insert: (payload: Record<string, unknown>) => ChainMock;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: (resolve: (v: QueryResult) => void) => void;
}

/** `.from()` 1 回分のチェイン。終端（maybeSingle / single / await）は result を返す */
function makeChain(table: string, result: QueryResult): ChainMock {
  const chain: ChainMock = {
    table,
    selects: [],
    eqs: [],
    inserts: [],
    select: (cols) => {
      chain.selects.push(cols);
      return chain;
    },
    eq: (col, value) => {
      chain.eqs.push([col, value]);
      return chain;
    },
    insert: (payload) => {
      chain.inserts.push(payload);
      return chain;
    },
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve) => resolve(result),
  };
  return chain;
}

const APPROVED_IDENTITY: QueryResult = {
  data: { id: "approved-identity", status: "approved" },
  error: null,
};

/**
 * サーバー client の `.from()` を呼び出し順のキューで設定する。
 * identity_verifications: [1] 本人確認 approved 確認 → [2] CCUS pending 確認
 *   → [3] insert…single
 * audit_logs: insert を await
 */
function setupServerFrom(options: {
  identityResult?: QueryResult;
  pendingResult?: QueryResult;
  insertResult?: QueryResult;
}) {
  const verificationResults: QueryResult[] = [
    options.identityResult ?? APPROVED_IDENTITY,
    options.pendingResult ?? { data: null, error: null },
    options.insertResult ?? {
      data: { id: VERIFICATION_ID, created_at: CREATED_AT },
      error: null,
    },
  ];
  const chains: ChainMock[] = [];
  mockFrom.mockImplementation((table: string) => {
    let result: QueryResult;
    if (table === "identity_verifications") {
      result = verificationResults.shift() ?? { data: null, error: null };
    } else if (table === "audit_logs") {
      result = { data: null, error: null };
    } else {
      throw new Error(`unexpected table: ${table}`);
    }
    const chain = makeChain(table, result);
    chains.push(chain);
    return chain;
  });
  return chains;
}

function setupAdminUsers(result: QueryResult) {
  mockAdminFrom.mockImplementation((table: string) => makeChain(table, result));
}

function authenticated() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
}

describe("submitCcusAction", () => {
  beforeEach(() => {
    // mockReturnValueOnce キュー漏れ防止のため mockReset で明示リセット
    mockGetUser.mockReset();
    mockFrom.mockReset();
    mockWriteAuditLog.mockReset().mockResolvedValue(undefined);
    mockAdminFrom.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true });
    vi.stubEnv("OPS_NOTIFICATION_EMAIL", "ops@test.local");
    setupAdminUsers({
      data: { email: "worker@test.local", last_name: "佐藤", first_name: "花子" },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("認証", () => {
    it("未ログインなら「ログインの有効期限が切れました」を返し DB に触れない", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing" },
      });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({
        success: false,
        error: "ログインの有効期限が切れました。再度ログインしてください。",
      });
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("前提条件: 本人確認の承認", () => {
    beforeEach(() => {
      authenticated();
    });

    it("承認済みの本人確認が無ければ「本人確認が承認されていません」を返し INSERT しない", async () => {
      const chains = setupServerFrom({ identityResult: { data: null, error: null } });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({
        success: false,
        error: "本人確認が承認されていません",
      });
      expect(chains).toHaveLength(1);
      expect(chains[0].eqs).toEqual([
        ["user_id", USER_ID],
        ["document_type", "identity"],
        ["status", "approved"],
      ]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("本人確認の取得が error を返した場合も承認済みとみなさない", async () => {
      setupServerFrom({
        identityResult: { data: null, error: { message: "db down", code: "XX000" } },
      });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({
        success: false,
        error: "本人確認が承認されていません",
      });
    });
  });

  describe("審査中の申請", () => {
    it("CCUS の pending が既にあれば「審査中の申請があります」を返し INSERT しない", async () => {
      authenticated();
      const chains = setupServerFrom({
        pendingResult: { data: { id: "existing-pending" }, error: null },
      });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: false, error: "審査中の申請があります" });
      expect(chains).toHaveLength(2);
      expect(chains[1].eqs).toEqual([
        ["user_id", USER_ID],
        ["document_type", "ccus"],
        ["status", "pending"],
      ]);
      expect(chains.every((c) => c.inserts.length === 0)).toBe(true);
    });
  });

  describe("入力検証", () => {
    beforeEach(() => {
      authenticated();
    });

    it.each([
      ["空文字", ""],
      ["他人のフォルダ", `${OTHER_USER_ID}/ccus-card.jpg`],
      ["パストラバーサル", `${USER_ID}/../${OTHER_USER_ID}/ccus-card.jpg`],
      ["許可されていない拡張子", `${USER_ID}/ccus-card.html`],
      ["ユーザー ID の前方一致（別ユーザー）", `${USER_ID}x/ccus-card.jpg`],
      ["バケット名を含む", `ccus-documents/${USER_ID}/ccus-card.jpg`],
    ])("カード画像パスが不正（%s）なら「カード画像を選択してください」", async (_label, path) => {
      const chains = setupServerFrom({});

      const result = await submitCcusAction({
        documentPath: path,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: false, error: "カード画像を選択してください" });
      // 承認確認・pending 確認の 2 回だけで INSERT には進まない
      expect(chains).toHaveLength(2);
      expect(chains.every((c) => c.inserts.length === 0)).toBe(true);
    });

    it.each([
      ["空文字", ""],
      ["空白のみ", "   "],
      ["全角空白のみ", "　"],
    ])("技能者 ID が%sなら「技能者IDを入力してください」", async (_label, workerId) => {
      const chains = setupServerFrom({});

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: workerId,
      });

      expect(result).toEqual({ success: false, error: "技能者IDを入力してください" });
      expect(chains.every((c) => c.inserts.length === 0)).toBe(true);
    });

    it("パスと技能者 ID の両方が不正ならカード画像のエラーを先に返す", async () => {
      setupServerFrom({});

      const result = await submitCcusAction({ documentPath: "", ccusWorkerId: "" });

      expect(result).toEqual({ success: false, error: "カード画像を選択してください" });
    });
  });

  describe("DB エラー", () => {
    beforeEach(() => {
      authenticated();
    });

    it("INSERT が error を返したら「申請の登録に失敗しました」を返し、監査ログ・メールは行わない", async () => {
      const chains = setupServerFrom({
        insertResult: { data: null, error: { message: "db down", code: "XX000" } },
      });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: false, error: "申請の登録に失敗しました" });
      expect(chains.map((c) => c.table)).not.toContain("audit_logs");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("INSERT が data: null（error なし）でも「申請の登録に失敗しました」を返す", async () => {
      setupServerFrom({ insertResult: { data: null, error: null } });

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: false, error: "申請の登録に失敗しました" });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    beforeEach(() => {
      authenticated();
    });

    it("技能者 ID を trim して pending で INSERT し、監査ログを記録して success を返す", async () => {
      const chains = setupServerFrom({});

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: `  ${WORKER_ID}  `,
      });

      expect(result).toEqual({ success: true });
      expect(chains.map((c) => c.table)).toEqual([
        "identity_verifications",
        "identity_verifications",
        "identity_verifications",
      ]);

      const insertChain = chains[2];
      expect(insertChain.inserts).toEqual([
        {
          user_id: USER_ID,
          document_type: "ccus",
          status: "pending",
          document_url_1: VALID_PATH,
          ccus_worker_id: WORKER_ID,
        },
      ]);
      expect(insertChain.selects).toEqual(["id, created_at"]);

      // 会員セッションでは audit_logs に書かない
      expect(chains.map((c) => c.table)).not.toContain("audit_logs");
      expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
      expect(mockWriteAuditLog).toHaveBeenCalledWith({
        actorId: USER_ID,
        action: "ccus.submit",
        targetType: "identity_verification",
        targetId: USER_ID,
        metadata: { verificationId: expect.any(String) },
      });
    });

    it("申請者宛控え・運営宛通知の 2 通を送信し、送信完了を待ってから返す", async () => {
      setupServerFrom({});
      const settled: string[] = [];
      mockSendEmail.mockImplementation(
        (params: { to: string }) =>
          new Promise((resolve) => {
            setTimeout(() => {
              settled.push(params.to);
              resolve({ success: true });
            }, 5);
          }),
      );

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: true });
      // Action が返った時点で両方の送信が完了している（fire-and-forget でない）
      expect(settled).toEqual(["worker@test.local", "ops@test.local"]);

      const [receipt, ops] = mockSendEmail.mock.calls.map(
        (call) => call[0] as { to: string; subject: string; html: string },
      );
      expect(receipt.to).toBe("worker@test.local");
      expect(receipt.subject).toBe("【ビジ友】CCUS登録の申請を受け付けました");
      expect(receipt.html).toContain("佐藤");
      expect(ops.to).toBe("ops@test.local");
      expect(ops.subject).toBe("【ビジ友 運営】CCUS登録の申請がありました");
      expect(ops.html).toContain(VERIFICATION_ID);
    });

    it("運営通知先が未設定なら申請者宛控えのみ送信する", async () => {
      vi.stubEnv("OPS_NOTIFICATION_EMAIL", "");
      setupServerFrom({});

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: true });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ to: "worker@test.local" });
    });

    it("メール送信が失敗しても申請自体は success を返す", async () => {
      setupServerFrom({});
      mockSendEmail.mockRejectedValue(new Error("resend down"));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await submitCcusAction({
        documentPath: VALID_PATH,
        ccusWorkerId: WORKER_ID,
      });

      expect(result).toEqual({ success: true });
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      consoleError.mockRestore();
    });
  });
});
