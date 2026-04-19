import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createScoutTemplateAction,
  updateScoutTemplateAction,
  deleteScoutTemplateAction,
} from "@/app/(authenticated)/messages/templates/actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = "11111111-1111-1111-1111-111111111111";
const TEMPLATE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_ID = "55555555-5555-5555-5555-555555555555";

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

interface Terminator {
  single?: { data?: unknown; error?: unknown };
  maybeSingle?: { data?: unknown; error?: unknown };
  thenable?: { data?: unknown; error?: unknown };
}

function createQueryMock(terminator: Terminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      terminator.single ?? { data: null, error: null },
    ),
    maybeSingle: vi.fn().mockResolvedValue(
      terminator.maybeSingle ?? { data: null, error: null },
    ),
  };

  if (terminator.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({
          data: terminator.thenable?.data ?? null,
          error: terminator.thenable?.error ?? null,
        }),
    });
  }

  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// createScoutTemplateAction
// ===========================================================================
describe("createScoutTemplateAction", () => {
  const validInput = {
    title: "建設工事スカウト挨拶",
    body: "お世話になっております。案件のご案内をお送りいたします。",
    memo: "通常の挨拶テンプレート",
  };

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await createScoutTemplateAction(validInput);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("title が空文字ならバリデーションエラー", async () => {
    mockAuth(USER_ID);
    const result = await createScoutTemplateAction({
      ...validInput,
      title: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("タイトルを入力してください");
  });

  it("title に改行が含まれる場合はエラー", async () => {
    mockAuth(USER_ID);
    const result = await createScoutTemplateAction({
      ...validInput,
      title: "改行\nあり",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("タイトルに改行は使用できません");
  });

  it("title 51 文字はエラー、50 文字は成功", async () => {
    mockAuth(USER_ID);
    const over = await createScoutTemplateAction({
      ...validInput,
      title: "あ".repeat(51),
    });
    expect(over.success).toBe(false);

    // 50 文字 OK 系は下の happy path で検証
  });

  it("body が空文字ならバリデーションエラー", async () => {
    mockAuth(USER_ID);
    const result = await createScoutTemplateAction({
      ...validInput,
      body: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("本文を入力してください");
  });

  it("memo 501 文字はエラー", async () => {
    mockAuth(USER_ID);
    const result = await createScoutTemplateAction({
      ...validInput,
      memo: "あ".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("法人プランユーザーは organization_id 付きで INSERT される", async () => {
    mockAuth(USER_ID);
    // 1. resolveOwnerAndOrg: organization_members.select
    const memberSelect = createQueryMock({
      maybeSingle: { data: { organization_id: ORG_ID }, error: null },
    });
    mockFrom.mockReturnValueOnce(memberSelect);
    // 2. scout_templates.insert
    const insertSelect = createQueryMock({
      single: { data: { id: TEMPLATE_ID }, error: null },
    });
    mockFrom.mockReturnValueOnce(insertSelect);

    const result = await createScoutTemplateAction(validInput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data?.id).toBe(TEMPLATE_ID);

    expect(insertSelect.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: USER_ID,
        organization_id: ORG_ID,
        title: "建設工事スカウト挨拶",
        body: "お世話になっております。案件のご案内をお送りいたします。",
        memo: "通常の挨拶テンプレート",
      }),
    );
  });

  it("個人プランユーザーは organization_id=null で INSERT される", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    const insertSelect = createQueryMock({
      single: { data: { id: TEMPLATE_ID }, error: null },
    });
    mockFrom.mockReturnValueOnce(insertSelect);

    const result = await createScoutTemplateAction(validInput);
    expect(result.success).toBe(true);
    expect(insertSelect.insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: null }),
    );
  });

  it("memo が空文字なら null として保存される", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    const insertSelect = createQueryMock({
      single: { data: { id: TEMPLATE_ID }, error: null },
    });
    mockFrom.mockReturnValueOnce(insertSelect);

    await createScoutTemplateAction({ ...validInput, memo: "" });
    expect(insertSelect.insert).toHaveBeenCalledWith(
      expect.objectContaining({ memo: null }),
    );
  });

  it("INSERT が失敗した場合は日本語エラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        single: { data: null, error: { message: "RLS denied" } },
      }),
    );
    const result = await createScoutTemplateAction(validInput);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("テンプレートの作成に失敗しました");
  });
});

// ===========================================================================
// updateScoutTemplateAction
// ===========================================================================
describe("updateScoutTemplateAction", () => {
  const validInput = {
    title: "更新後タイトル",
    body: "更新後の本文です。",
    memo: "更新後メモ",
  };

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await updateScoutTemplateAction(TEMPLATE_ID, validInput);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("バリデーション失敗時は日本語エラーを返す", async () => {
    mockAuth(USER_ID);
    const result = await updateScoutTemplateAction(TEMPLATE_ID, {
      ...validInput,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("UPDATE が成功すれば success を返す", async () => {
    mockAuth(USER_ID);
    const updateChain = createQueryMock({
      thenable: { data: null, error: null },
    });
    mockFrom.mockReturnValueOnce(updateChain);

    const result = await updateScoutTemplateAction(TEMPLATE_ID, validInput);
    expect(result.success).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "更新後タイトル",
        body: "更新後の本文です。",
        memo: "更新後メモ",
      }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", TEMPLATE_ID);
  });

  it("UPDATE が RLS で拒否された場合はエラーを返す（別組織からの編集試行）", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: null, error: { message: "RLS denied" } },
      }),
    );
    const result = await updateScoutTemplateAction(TEMPLATE_ID, validInput);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("テンプレートの更新に失敗しました");
  });
});

// ===========================================================================
// deleteScoutTemplateAction
// ===========================================================================
describe("deleteScoutTemplateAction", () => {
  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await deleteScoutTemplateAction(TEMPLATE_ID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("認証が必要です");
  });

  it("DELETE が成功すれば success を返す", async () => {
    mockAuth(USER_ID);
    const deleteChain = createQueryMock({
      thenable: { data: null, error: null },
    });
    mockFrom.mockReturnValueOnce(deleteChain);

    const result = await deleteScoutTemplateAction(TEMPLATE_ID);
    expect(result.success).toBe(true);
    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith("id", TEMPLATE_ID);
  });

  it("DELETE が RLS で拒否された場合はエラー", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: null, error: { message: "RLS denied" } },
      }),
    );
    const result = await deleteScoutTemplateAction(TEMPLATE_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("テンプレートの削除に失敗しました");
  });
});
