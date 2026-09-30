import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MasterKind, MasterRow, MunicipalityRow } from "@/lib/master/fetch";

/**
 * updateProfileAction（COM-002 プロフィール編集）のテスト。
 *
 * - Server Action 本体はモックせず、Supabase クライアント / next/headers /
 *   マスタ取得層（@/lib/master/fetch）だけを差し替える
 * - Zod（profileEditSchema）・validateLabelChanges・validateAreaChanges・
 *   expandAreasForDb は実体を通す
 * - FormData は profile-edit-form.tsx の組み立てと同じキー・形式で作る
 */

const {
  mockGetUser,
  mockUpdateUser,
  mockRpc,
  mockHeaders,
  mockGetAllMasterRowsOrThrow,
  mockGetAllMunicipalityRows,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockRpc: vi.fn(),
  mockHeaders: vi.fn(),
  mockGetAllMasterRowsOrThrow: vi.fn<(kind: MasterKind) => Promise<MasterRow[]>>(),
  mockGetAllMunicipalityRows: vi.fn<() => Promise<MunicipalityRow[]>>(),
}));

// ---------------------------------------------------------------------------
// Supabase .from() チェイン
// ---------------------------------------------------------------------------
type Op = "select" | "update" | "delete" | "insert";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface RecordedQuery {
  table: string;
  op: Op | null;
  payload: unknown;
  eqs: Array<[string, unknown]>;
}

/** テーブル × 操作ごとの応答。未設定なら { data: null, error: null } */
let responses: Record<string, Partial<Record<Op, QueryResult>>> = {};
let recorded: RecordedQuery[] = [];

function makeChain(table: string) {
  const rec: RecordedQuery = { table, op: null, payload: undefined, eqs: [] };
  recorded.push(rec);

  const resolveResult = (): QueryResult =>
    (rec.op && responses[table]?.[rec.op]) ?? { data: null, error: null };

  const chain = {
    select: () => {
      rec.op = rec.op ?? "select";
      return chain;
    },
    update: (payload: unknown) => {
      rec.op = "update";
      rec.payload = payload;
      return chain;
    },
    delete: () => {
      rec.op = "delete";
      return chain;
    },
    insert: (payload: unknown) => {
      rec.op = "insert";
      rec.payload = payload;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      rec.eqs.push([col, val]);
      return chain;
    },
    single: () => Promise.resolve(resolveResult()),
    then: (
      resolve: (v: QueryResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(resolveResult()).then(resolve, reject),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    from: (table: string) => makeChain(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

vi.mock("@/lib/master/fetch", () => ({
  getAllMasterRowsOrThrow: (kind: MasterKind) =>
    mockGetAllMasterRowsOrThrow(kind),
  getAllMunicipalityRows: () => mockGetAllMunicipalityRows(),
}));

import { updateProfileAction } from "@/app/(authenticated)/profile/edit/actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CURRENT_EMAIL = "contractor@test.local";

const MASTER: Record<MasterKind, MasterRow[]> = {
  "trade-types": [
    { label: "建築/躯体｜大工", deprecated_at: null },
    { label: "建築/仕上げ｜内装工", deprecated_at: null },
    { label: "建築/躯体｜廃止職種", deprecated_at: "2026-04-01T00:00:00.000Z" },
  ],
  qualifications: [
    { label: "一級建築士", deprecated_at: null },
    { label: "特級ボイラー技士", deprecated_at: null },
  ],
  "skill-tags": [
    { label: "型枠設置工", deprecated_at: null },
    { label: "外壁塗装工", deprecated_at: null },
  ],
};

const MUNICIPALITIES: MunicipalityRow[] = [
  { prefecture: "東京都", municipality: "港区", deprecated_at: null },
  { prefecture: "東京都", municipality: "新宿区", deprecated_at: null },
];

interface FormOverrides {
  lastName?: string;
  firstName?: string;
  gender?: string;
  birthDate?: string;
  email?: string;
  prefecture?: string;
  municipality?: string;
  companyName?: string;
  bio?: string;
  skills?: Array<{ tradeType: string; experienceYears: number }>;
  skillTags?: string[];
  qualifications?: string[];
  availableAreas?: Array<{
    prefecture: string;
    whole: boolean;
    municipalities: string[];
  }>;
}

/** profile-edit-form.tsx の onSubmit と同じキー・形式で FormData を組み立てる */
function buildFormData(overrides: FormOverrides = {}): FormData {
  const v = {
    lastName: "山田",
    firstName: "太郎",
    gender: "男性",
    birthDate: "1990/1/15",
    email: CURRENT_EMAIL,
    prefecture: "東京都",
    municipality: "港区",
    companyName: "山田工務店",
    bio: "よろしくお願いします",
    skills: [{ tradeType: "建築/躯体｜大工", experienceYears: 10 }],
    skillTags: ["型枠設置工"],
    qualifications: ["一級建築士"],
    availableAreas: [
      { prefecture: "東京都", whole: false, municipalities: ["港区", "新宿区"] },
      { prefecture: "神奈川県", whole: true, municipalities: [] },
    ],
    ...overrides,
  };
  const fd = new FormData();
  fd.append("lastName", v.lastName);
  fd.append("firstName", v.firstName);
  fd.append("gender", v.gender);
  fd.append("birthDate", v.birthDate);
  fd.append("email", v.email);
  fd.append("prefecture", v.prefecture);
  fd.append("municipality", v.municipality);
  fd.append("companyName", v.companyName);
  fd.append("bio", v.bio);
  fd.append("skills", JSON.stringify(v.skills));
  fd.append("skillTags", JSON.stringify(v.skillTags));
  fd.append("qualifications", JSON.stringify(v.qualifications));
  fd.append("availableAreas", JSON.stringify(v.availableAreas));
  return fd;
}

function headersWith(entries: Record<string, string>) {
  return {
    get: (name: string) => entries[name.toLowerCase()] ?? null,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockUpdateUser.mockReset();
  mockRpc.mockReset();
  mockHeaders.mockReset();
  mockGetAllMasterRowsOrThrow.mockReset();
  mockGetAllMunicipalityRows.mockReset();

  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: CURRENT_EMAIL } },
    error: null,
  });
  mockUpdateUser.mockResolvedValue({ data: { user: null }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockHeaders.mockResolvedValue(
    headersWith({ host: "localhost:3000", "x-forwarded-proto": "http" }),
  );
  mockGetAllMasterRowsOrThrow.mockImplementation(async (kind) => MASTER[kind]);
  mockGetAllMunicipalityRows.mockResolvedValue(MUNICIPALITIES);

  recorded = [];
  // 既存保有データ（previous*）: 何も持っていない状態を既定にする
  responses = {
    user_skills: { select: { data: [], error: null } },
    user_qualifications: { select: { data: [], error: null } },
    users: { select: { data: { skill_tags: [] }, error: null } },
    user_available_areas: { select: { data: [], error: null } },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("updateProfileAction", () => {
  describe("認証", () => {
    it("未ログインなら認証エラーを返し、DB に触れない", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const result = await updateProfileAction(buildFormData());

      expect(result).toEqual({
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      });
      expect(recorded).toHaveLength(0);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("入力バリデーション（Zod）", () => {
    it("姓が空なら日本語エラーを返し、保存しない", async () => {
      const result = await updateProfileAction(buildFormData({ lastName: "" }));

      expect(result).toEqual({
        success: false,
        error: "入力内容に不備があります",
      });
      expect(recorded).toHaveLength(0);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("職種が 0 件なら弾く", async () => {
      const result = await updateProfileAction(buildFormData({ skills: [] }));
      expect(result).toEqual({
        success: false,
        error: "入力内容に不備があります",
      });
    });

    it("対応エリアが 0 件なら弾く", async () => {
      const result = await updateProfileAction(
        buildFormData({ availableAreas: [] }),
      );
      expect(result).toEqual({
        success: false,
        error: "入力内容に不備があります",
      });
    });

    it("実在しない生年月日（2/30）なら弾く", async () => {
      const result = await updateProfileAction(
        buildFormData({ birthDate: "1990/2/30" }),
      );
      expect(result).toEqual({
        success: false,
        error: "入力内容に不備があります",
      });
    });

    it("メールアドレスの形式が不正なら弾く", async () => {
      const result = await updateProfileAction(
        buildFormData({ email: "not-an-email" }),
      );
      expect(result).toEqual({
        success: false,
        error: "入力内容に不備があります",
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("skills が壊れた JSON なら汎用エラー（例外を投げない）", async () => {
      const fd = buildFormData();
      fd.set("skills", "{not json");
      const result = await updateProfileAction(fd);
      expect(result).toEqual({
        success: false,
        error: "プロフィールの保存に失敗しました。もう一度お試しください。",
      });
    });
  });

  describe("マスタの差分検証", () => {
    it("存在しない職種を新規追加すると職種名入りのエラー", async () => {
      const result = await updateProfileAction(
        buildFormData({
          skills: [{ tradeType: "建築/躯体｜架空工", experienceYears: 1 }],
        }),
      );
      expect(result).toEqual({
        success: false,
        error: "存在しない職種が含まれています: 建築/躯体｜架空工",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("廃止済みの職種を新規追加すると「新規追加できません」エラー", async () => {
      const result = await updateProfileAction(
        buildFormData({
          skills: [{ tradeType: "建築/躯体｜廃止職種", experienceYears: 1 }],
        }),
      );
      expect(result).toEqual({
        success: false,
        error: "廃止された職種は新規追加できません: 建築/躯体｜廃止職種",
      });
    });

    it("既存保有の廃止職種はそのまま保持して保存できる", async () => {
      responses.user_skills = {
        select: { data: [{ trade_type: "建築/躯体｜廃止職種" }], error: null },
      };
      const result = await updateProfileAction(
        buildFormData({
          skills: [{ tradeType: "建築/躯体｜廃止職種", experienceYears: 3 }],
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("存在しない資格を追加すると資格のエラー", async () => {
      const result = await updateProfileAction(
        buildFormData({ qualifications: ["架空資格"] }),
      );
      expect(result).toEqual({
        success: false,
        error: "存在しない資格が含まれています: 架空資格",
      });
    });

    it("存在しない保有スキルを追加するとスキルのエラー", async () => {
      const result = await updateProfileAction(
        buildFormData({ skillTags: ["架空スキル"] }),
      );
      expect(result).toEqual({
        success: false,
        error: "存在しないスキルが含まれています: 架空スキル",
      });
    });

    it("存在しない市区町村を追加するとエリアのエラー", async () => {
      const result = await updateProfileAction(
        buildFormData({
          availableAreas: [
            { prefecture: "東京都", whole: false, municipalities: ["架空区"] },
          ],
        }),
      );
      expect(result).toEqual({
        success: false,
        error: "存在しないエリアが含まれています: 東京都架空区",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("マスタ取得が一時的に失敗したら「存在しない」と断定せず一時エラー文言", async () => {
      mockGetAllMasterRowsOrThrow.mockRejectedValue(new Error("network"));
      const result = await updateProfileAction(buildFormData());
      expect(result).toEqual({
        success: false,
        error:
          "データの取得に一時的に失敗しました。時間をおいて再度お試しください。",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("今の登録内容の読み込み失敗", () => {
    it.each([
      ["user_skills"],
      ["user_qualifications"],
      ["users"],
      ["user_available_areas"],
    ])("%s の読み込みが失敗したら一時エラーを返し、保存しない", async (table) => {
      responses[table] = {
        select: { data: null, error: { message: "network" } },
      };
      const result = await updateProfileAction(buildFormData());
      expect(result).toEqual({
        success: false,
        error:
          "データの取得に一時的に失敗しました。時間をおいて再度お試しください。",
      });
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("保存処理のエラー", () => {
    it("保存（update_my_profile）が失敗したらプロフィール保存失敗のエラーを返し、メールは変更しない", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "db error" } });
      const result = await updateProfileAction(
        buildFormData({ email: "new@test.local" }),
      );
      expect(result).toEqual({
        success: false,
        error: "プロフィールの保存に失敗しました。もう一度お試しください。",
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("書き込みは RPC 1 回だけで、テーブルへの直接の UPDATE / DELETE / INSERT はしない（一部だけ保存されるのを防ぐ）", async () => {
      await updateProfileAction(buildFormData());
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(
        recorded.filter((q) => q.op === "update" || q.op === "delete" || q.op === "insert"),
      ).toEqual([]);
    });
  });

  describe("正常系", () => {
    it("update_my_profile に全項目を 1 回で渡す（性別は日本語ラベルのまま・重複は除去・エリアは DB タプルに展開）", async () => {
      const result = await updateProfileAction(
        buildFormData({
          gender: "女性",
          skills: [
            { tradeType: "建築/躯体｜大工", experienceYears: 10 },
            // 重複は Zod transform で除去される
            { tradeType: "建築/躯体｜大工", experienceYears: 3 },
            { tradeType: "建築/仕上げ｜内装工", experienceYears: 2 },
          ],
          skillTags: ["型枠設置工", "型枠設置工", "外壁塗装工"],
        }),
      );

      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("update_my_profile", {
        p_last_name: "山田",
        p_first_name: "太郎",
        p_gender: "女性",
        p_birth_date: "1990-01-15",
        p_prefecture: "東京都",
        p_municipality: "港区",
        p_company_name: "山田工務店",
        p_bio: "よろしくお願いします",
        p_skill_tags: ["型枠設置工", "外壁塗装工"],
        p_skills: [
          { trade_type: "建築/躯体｜大工", experience_years: 10 },
          { trade_type: "建築/仕上げ｜内装工", experience_years: 2 },
        ],
        p_qualifications: ["一級建築士"],
        p_areas: [
          { prefecture: "東京都", municipality: "港区" },
          { prefecture: "東京都", municipality: "新宿区" },
          { prefecture: "神奈川県", municipality: null },
        ],
      });

      // メールは変わっていないので updateUser は呼ばない
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockHeaders).not.toHaveBeenCalled();
    });

    it("任意項目が空なら municipality は空文字（DB 側で NULL）、company_name / bio は空文字、資格・スキルは空配列で渡す", async () => {
      const result = await updateProfileAction(
        buildFormData({
          municipality: "",
          companyName: "",
          bio: "",
          qualifications: [],
          skillTags: [],
        }),
      );

      expect(result).toEqual({ success: true });
      const args = mockRpc.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(args.p_municipality).toBe("");
      expect(args.p_company_name).toBe("");
      expect(args.p_bio).toBe("");
      expect(args.p_qualifications).toEqual([]);
      expect(args.p_skill_tags).toEqual([]);
    });

    it("メールアドレス欄が空なら updateUser を呼ばない", async () => {
      const result = await updateProfileAction(buildFormData({ email: "" }));
      expect(result).toEqual({ success: true });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("メールアドレス変更", () => {
    it("変更時は host header から組んだ emailRedirectTo で updateUser を呼ぶ", async () => {
      mockHeaders.mockResolvedValue(
        headersWith({ host: "127.0.0.1:3000", "x-forwarded-proto": "http" }),
      );

      const result = await updateProfileAction(
        buildFormData({ email: "new@test.local" }),
      );

      expect(result).toEqual({ success: true });
      expect(mockUpdateUser).toHaveBeenCalledWith(
        { email: "new@test.local" },
        { emailRedirectTo: "http://127.0.0.1:3000/email-change-confirmed" },
      );
      // プロフィール本体は先に保存済み
      expect(mockRpc).toHaveBeenCalledWith("update_my_profile", expect.anything());
    });

    it("x-forwarded-proto が https ならその proto を使う", async () => {
      mockHeaders.mockResolvedValue(
        headersWith({ host: "staging.example.com", "x-forwarded-proto": "https" }),
      );

      await updateProfileAction(buildFormData({ email: "new@test.local" }));

      expect(mockUpdateUser).toHaveBeenCalledWith(
        { email: "new@test.local" },
        { emailRedirectTo: "https://staging.example.com/email-change-confirmed" },
      );
    });

    it("x-forwarded-proto が無ければ http を補う", async () => {
      mockHeaders.mockResolvedValue(headersWith({ host: "localhost:3000" }));

      await updateProfileAction(buildFormData({ email: "new@test.local" }));

      expect(mockUpdateUser).toHaveBeenCalledWith(
        { email: "new@test.local" },
        { emailRedirectTo: "http://localhost:3000/email-change-confirmed" },
      );
    });

    it("前後の空白は trim してから比較・送信する", async () => {
      await updateProfileAction(buildFormData({ email: "  new@test.local  " }));
      expect(mockUpdateUser).toHaveBeenCalledWith(
        { email: "new@test.local" },
        { emailRedirectTo: "http://localhost:3000/email-change-confirmed" },
      );
    });

    it("updateUser が失敗したらメールアドレス更新失敗のエラー", async () => {
      mockUpdateUser.mockResolvedValue({
        data: { user: null },
        error: { message: "email rate limit exceeded" },
      });

      const result = await updateProfileAction(
        buildFormData({ email: "new@test.local" }),
      );

      expect(result).toEqual({
        success: false,
        error: "メールアドレスの更新に失敗しました。もう一度お試しください。",
      });
    });
  });
});
