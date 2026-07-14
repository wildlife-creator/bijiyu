import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// completeRegistrationAction のパスワード先出し順序を固定する回帰テスト
// ---------------------------------------------------------------------------
// 2026-07-13 修正: パスワード設定 (supabase.auth.updateUser) を、マスタ照合
// (validateLabelChanges / validateAreaChanges) や complete_registration RPC より
// 「前」に実行するよう並べ替えた。
//
// なぜ順序が重要か:
//   - パスワードを最後に置くと、RPC が成功して updateUser が失敗した瞬間に
//     「last_name は入っている(=完全登録扱いで /mypage へ)のにパスワード未設定」
//     という復旧不能アカウントが残る。セッション切れ後は二度とログインできない。
//   - パスワードを最初に置けば、後続が失敗しても last_name=NULL のままなので、
//     ユーザーは自分のパスワードでログインでき、middleware が /register/profile に
//     差し戻して自力でやり直せる (src/middleware.ts の profileIncomplete 分岐)。
//
// この順序を将来うっかり元に戻すと詰みバグが再発するため、ここで invocation 順を
// 固定する。CLAUDE.md「Server Action 自体を vi.mock で差し替えない / Supabase
// クライアント等の外部依存をモックし内部ロジックを実際に動かす」に従い、Zod は
// 実物 (registerProfileSchema) を通し、Supabase/マスタ照合/メールのみモックする。

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockRpc = vi.fn();
const mockValidateLabelChanges = vi.fn();
const mockValidateAreaChanges = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

vi.mock("@/lib/master/validate", () => ({
  validateLabelChanges: (...args: unknown[]) => mockValidateLabelChanges(...args),
  labelValidationErrorMessage: () => "職種のマスタ照合に失敗しました",
}));

vi.mock("@/lib/master/validate-area", () => ({
  validateAreaChanges: (...args: unknown[]) => mockValidateAreaChanges(...args),
  areaValidationErrorMessage: () => "対応エリアのマスタ照合に失敗しました",
}));

// UI 層 AreaRow[] → DB 層 AreaTuple[] の平坦化。本体ロジックには影響しないため
// 素の 1 件配列を返すだけの薄いスタブにする。
vi.mock("@/lib/master/area-conversion", () => ({
  expandAreasForDb: () => [{ prefecture: "東京都", municipality: null }],
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/registration-completed", () => ({
  registrationCompletedEmail: () => ({ subject: "s", html: "h" }),
}));

import { completeRegistrationAction } from "@/app/(auth)/register/profile/actions";

// registerProfileSchema (実物) を通過する有効な入力。
function validInput() {
  return {
    lastName: "山田",
    firstName: "太郎",
    gender: "male",
    birthDate: "1990/01/15",
    prefecture: "東京都",
    municipality: "港区",
    companyName: "",
    skills: [{ tradeType: "大工", experienceYears: 5 }],
    availableAreas: [{ prefecture: "東京都", whole: true, municipalities: [] }],
    password: "password123",
  };
}

const OK = { data: {}, error: null };

beforeEach(() => {
  mockGetUser.mockReset();
  mockUpdateUser.mockReset();
  mockRpc.mockReset();
  mockValidateLabelChanges.mockReset();
  mockValidateAreaChanges.mockReset();
  mockSendEmail.mockReset();

  // デフォルトは全部成功。個別テストで必要な失敗だけ上書きする。
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "new@test.local" } },
  });
  mockUpdateUser.mockResolvedValue(OK);
  mockRpc.mockResolvedValue({ error: null });
  mockValidateLabelChanges.mockResolvedValue({ valid: true });
  mockValidateAreaChanges.mockResolvedValue({ valid: true });
  mockSendEmail.mockResolvedValue(undefined);
});

describe("completeRegistrationAction: パスワードは照合・RPC より前に設定される", () => {
  it("正常系で成功し、updateUser がマスタ照合・RPC より前に呼ばれる", async () => {
    const result = await completeRegistrationAction(validInput());

    expect(result.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });

    // invocation 順で「パスワード設定 < マスタ照合 < RPC」を固定する。
    const passwordOrder = mockUpdateUser.mock.invocationCallOrder[0];
    const labelOrder = mockValidateLabelChanges.mock.invocationCallOrder[0];
    const areaOrder = mockValidateAreaChanges.mock.invocationCallOrder[0];
    const rpcOrder = mockRpc.mock.invocationCallOrder[0];

    expect(passwordOrder).toBeLessThan(labelOrder);
    expect(passwordOrder).toBeLessThan(areaOrder);
    expect(passwordOrder).toBeLessThan(rpcOrder);
  });

  it("パスワード設定が失敗したら、照合も RPC も実行せず即エラーを返す", async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "weak password" },
    });

    const result = await completeRegistrationAction(validInput());

    expect(result.success).toBe(false);
    expect(mockValidateLabelChanges).not.toHaveBeenCalled();
    expect(mockValidateAreaChanges).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("RPC が失敗しても、その前にパスワードは設定済み(=復旧可能な状態)である", async () => {
    // last_name=NULL のまま失敗しても、パスワードが既に設定されていれば
    // ユーザーはログインして /register/profile でやり直せる。この不変条件を固定する。
    mockRpc.mockResolvedValue({ error: { message: "boom" } });

    const result = await completeRegistrationAction(validInput());

    expect(result.success).toBe(false);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockUpdateUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[0],
    );
  });
});
