import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * submitIdentityAction（本人確認申請）のテスト。
 *
 * ファイル本体はブラウザから Storage へ直接アップロード済みで、Action は
 * ストレージパスだけを受け取る（CLAUDE.md「ファイル本体を Server Action
 * (FormData) で送ってはならない」）。Action 自体はモックせず、Supabase クライアント・
 * admin client・sendEmail・next/headers だけを差し替えて実ロジックを通す。
 * sendVerificationEmails（通知メールの共通ヘルパー）も実体を通す。
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

import { submitIdentityAction } from "@/app/(authenticated)/profile/verification/identity/actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const VERIFICATION_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-09-29T01:23:45.000Z";

const VALID_PATH_1 = `${USER_ID}/identity-front.jpg`;
const VALID_PATH_2 = `${USER_ID}/face.png`;

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

/**
 * サーバー client の `.from()` を呼び出し順のキューで設定する。
 * identity_verifications: [1] pending 確認（maybeSingle）→ [2] insert…single
 * audit_logs: insert を await
 */
function setupServerFrom(options: {
  pendingResult?: QueryResult;
  insertResult?: QueryResult;
  auditResult?: QueryResult;
}) {
  const verificationResults: QueryResult[] = [
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
      result = options.auditResult ?? { data: null, error: null };
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
  const chains: ChainMock[] = [];
  mockAdminFrom.mockImplementation((table: string) => {
    const chain = makeChain(table, result);
    chains.push(chain);
    return chain;
  });
  return chains;
}

function authenticated() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
}

describe("submitIdentityAction", () => {
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
      data: { email: "applicant@test.local", last_name: "山田", first_name: "太郎" },
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

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({
        success: false,
        error: "ログインの有効期限が切れました。再度ログインしてください。",
      });
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("パス検証", () => {
    beforeEach(() => {
      authenticated();
      setupServerFrom({});
    });

    it.each([
      ["空文字", ""],
      ["他人のフォルダ", `${OTHER_USER_ID}/identity.jpg`],
      ["パストラバーサル", `${USER_ID}/../${OTHER_USER_ID}/identity.jpg`],
      ["許可されていない拡張子", `${USER_ID}/identity.exe`],
      ["拡張子なし", `${USER_ID}/identity`],
      ["ユーザー ID の前方一致（別ユーザー）", `${USER_ID}0/identity.jpg`],
      ["階層が深すぎる", `${USER_ID}/a/b/identity.jpg`],
    ])("書類パスが不正（%s）なら「本人確認書類を選択してください」", async (_label, path) => {
      const result = await submitIdentityAction({
        document1Path: path,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({
        success: false,
        error: "本人確認書類を選択してください",
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it.each([
      ["空文字", ""],
      ["他人のフォルダ", `${OTHER_USER_ID}/face.png`],
      ["許可されていない拡張子", `${USER_ID}/face.svg`],
    ])("顔写真パスが不正（%s）なら「ご本人の顔写真を選択してください」", async (_label, path) => {
      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: path,
      });

      expect(result).toEqual({
        success: false,
        error: "ご本人の顔写真を選択してください",
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("両方不正なら書類側のエラーを先に返す", async () => {
      const result = await submitIdentityAction({
        document1Path: "",
        document2Path: "",
      });

      expect(result).toEqual({
        success: false,
        error: "本人確認書類を選択してください",
      });
    });
  });

  describe("審査中の申請", () => {
    it("本人確認の pending が既にあれば「審査中の申請があります」を返し INSERT しない", async () => {
      authenticated();
      const chains = setupServerFrom({
        pendingResult: { data: { id: "existing-pending" }, error: null },
      });

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: false, error: "審査中の申請があります" });
      expect(chains).toHaveLength(1);
      expect(chains[0].eqs).toEqual([
        ["user_id", USER_ID],
        ["document_type", "identity"],
        ["status", "pending"],
      ]);
      expect(chains[0].inserts).toHaveLength(0);
      expect(mockSendEmail).not.toHaveBeenCalled();
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

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: false, error: "申請の登録に失敗しました" });
      expect(chains.map((c) => c.table)).toEqual([
        "identity_verifications",
        "identity_verifications",
      ]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("INSERT が data: null（error なし）でも「申請の登録に失敗しました」を返す", async () => {
      setupServerFrom({ insertResult: { data: null, error: null } });

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: false, error: "申請の登録に失敗しました" });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    beforeEach(() => {
      authenticated();
    });

    it("pending で INSERT し、監査ログを記録して success を返す", async () => {
      const chains = setupServerFrom({});

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: true });

      const insertChain = chains[1];
      expect(insertChain.table).toBe("identity_verifications");
      expect(insertChain.inserts).toEqual([
        {
          user_id: USER_ID,
          document_type: "identity",
          status: "pending",
          document_url_1: VALID_PATH_1,
          document_url_2: VALID_PATH_2,
        },
      ]);
      expect(insertChain.selects).toEqual(["id, created_at"]);

      // 会員セッションでは audit_logs に書かない
      expect(chains.map((c) => c.table)).not.toContain("audit_logs");
      expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
      expect(mockWriteAuditLog).toHaveBeenCalledWith({
        actorId: USER_ID,
        action: "identity.submit",
        targetType: "identity_verification",
        targetId: USER_ID,
        metadata: { verificationId: expect.any(String) },
      });
    });

    it("サブディレクトリ付き・大文字拡張子のパスも受け付ける", async () => {
      const chains = setupServerFrom({});
      const path1 = `${USER_ID}/2026/front.PDF`;
      const path2 = `${USER_ID}/face.webp`;

      const result = await submitIdentityAction({
        document1Path: path1,
        document2Path: path2,
      });

      expect(result).toEqual({ success: true });
      expect(chains[1].inserts[0]).toMatchObject({
        document_url_1: path1,
        document_url_2: path2,
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

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: true });
      // Action が返った時点で両方の送信が完了している（fire-and-forget でない）
      expect(settled).toEqual(["applicant@test.local", "ops@test.local"]);

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      const [receipt, ops] = mockSendEmail.mock.calls.map(
        (call) => call[0] as { to: string; subject: string; html: string },
      );
      expect(receipt.to).toBe("applicant@test.local");
      expect(receipt.subject).toBe("【ビジ友】本人確認の申請を受け付けました");
      expect(receipt.html).toContain("山田");
      expect(ops.to).toBe("ops@test.local");
      expect(ops.subject).toBe("【ビジ友 運営】本人確認の申請がありました");
      expect(ops.html).toContain(VERIFICATION_ID);
      expect(ops.html).toContain("http://127.0.0.1:3000");
    });

    it("メール送信が失敗しても申請自体は success を返す", async () => {
      setupServerFrom({});
      mockSendEmail.mockRejectedValue(new Error("resend down"));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: true });
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      consoleError.mockRestore();
    });

    it("申請者のメールアドレスが取れない場合は運営宛のみ送信する", async () => {
      setupServerFrom({});
      setupAdminUsers({ data: null, error: null });

      const result = await submitIdentityAction({
        document1Path: VALID_PATH_1,
        document2Path: VALID_PATH_2,
      });

      expect(result).toEqual({ success: true });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ to: "ops@test.local" });
    });
  });
});
