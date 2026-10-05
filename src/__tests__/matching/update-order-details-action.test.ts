import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup（Supabase クライアントとメール送信だけを差し替える）
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockStorageRemove = vi.fn();
const mockGetActiveOrganizationContext = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    storage: {
      from: () => ({ remove: (...args: unknown[]) => mockStorageRemove(...args) }),
    },
  }),
}));

vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: (...args: unknown[]) =>
    mockGetActiveOrganizationContext(...args),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email/send-email";
import { updateOrderDetailsAction } from "@/app/(authenticated)/applications/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC_A = `${USER_ID}/${APP_ID}/doc-a.jpg`;
const DOC_B = `${USER_ID}/${APP_ID}/doc-b.pdf`;
const NEW_DOC = `${USER_ID}/${APP_ID}/doc-new.png`;

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** await / single / maybeSingle のどれで終わっても { data, error } を返すチェーン */
function chain(result: QueryResult, overrides: Partial<Record<"single" | "maybeSingle", QueryResult>> = {}) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "update"]) {
    c[method] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(overrides.single ?? result);
  c.maybeSingle = vi.fn().mockResolvedValue(overrides.maybeSingle ?? result);
  c.then = (resolve: (v: QueryResult) => void) => resolve(result);
  return c as Record<string, ReturnType<typeof vi.fn>>;
}

function appRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    applicant_id: "applicant-1",
    status: "accepted",
    headcount: 1,
    first_work_date: "2026-11-01",
    work_location: "東京都渋谷区1-1-1",
    client_notes: "朝礼は8時です",
    document_urls: [DOC_A, DOC_B],
    jobs: {
      id: "j1",
      title: "外壁塗装の応援",
      owner_id: USER_ID,
      organization_id: null,
      trade_types: ["建築/仕上げ｜塗装工"],
      work_end_date: "2026-11-30",
      owner: {
        last_name: "田中",
        first_name: "一郎",
        deleted_at: null,
        client_profiles: { display_name: "田中工務店", image_url: null },
      },
      organization: null,
    },
    applicant: {
      id: "applicant-1",
      last_name: "高橋",
      first_name: "美咲",
      company_name: null,
      deleted_at: null,
    },
    ...overrides,
  };
}

interface AdminState {
  userReview: QueryResult;
  clientReview: QueryResult;
  update: QueryResult;
}

function setup(
  row: ReturnType<typeof appRow> | null,
  adminOverrides: Partial<AdminState> = {},
) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockFrom.mockReturnValue(
    chain({ data: row, error: row ? null : { message: "not found" } }),
  );

  const state: AdminState = {
    userReview: { data: null, error: null },
    clientReview: { data: null, error: null },
    update: { data: [{ id: APP_ID }], error: null },
    ...adminOverrides,
  };
  const applicationsChain = chain(state.update);
  mockAdminFrom.mockImplementation((table: string) => {
    switch (table) {
      case "users":
        return chain(
          { data: null, error: null },
          {
            // 応募者のメールアドレス
            maybeSingle: { data: { email: "applicant@test.local" }, error: null },
            // 発注者控えの宛先（個人プラン = オーナー本人）
            single: {
              data: {
                id: USER_ID,
                email: "owner@test.local",
                last_name: "田中",
                first_name: "一郎",
                deleted_at: null,
                is_active: true,
              },
              error: null,
            },
          },
        );
      case "user_reviews":
        return chain(state.userReview);
      case "client_reviews":
        return chain(state.clientReview);
      case "applications":
        return applicationsChain;
      default:
        return chain({ data: null, error: null });
    }
  });
  mockStorageRemove.mockResolvedValue({ data: [], error: null });
  return { applicationsChain };
}

function buildFormData(
  overrides: Record<string, string> = {},
  docs: { keep?: string[]; add?: string[] } = {},
): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    applicationId: APP_ID,
    workLocation: "東京都渋谷区1-1-1",
    clientNotes: "朝礼は8時です",
    firstWorkDate: "2026-11-01",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const entry of docs.keep ?? [DOC_A, DOC_B]) fd.append("keepDocuments", entry);
  for (const path of docs.add ?? []) fd.append("documentPaths", path);
  return fd;
}

function sentMails() {
  return vi
    .mocked(sendEmail)
    .mock.calls.map((c) => c[0] as { to: string; subject: string; html: string });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockStorageRemove.mockReset();
  mockGetActiveOrganizationContext.mockReset();
});

// ---------------------------------------------------------------------------
// updateOrderDetailsAction
// ---------------------------------------------------------------------------
describe("updateOrderDetailsAction（発注確定後の発注内容の編集）", () => {
  describe("拒否されるケース", () => {
    it("未認証ユーザーはエラーを返す", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "x" } });
      const result = await updateOrderDetailsAction(buildFormData());
      expect(result).toEqual({
        success: false,
        error: "ログインの有効期限が切れました。再度ログインしてください。",
      });
    });

    it("初回稼働日が空ならバリデーションエラーを返す", async () => {
      setup(appRow());
      const result = await updateOrderDetailsAction(buildFormData({ firstWorkDate: "" }));
      expect(result).toEqual({ success: false, error: "初回稼働日を入力してください" });
    });

    it("勤務地が空白だけならエラーを返す", async () => {
      setup(appRow());
      const result = await updateOrderDetailsAction(buildFormData({ workLocation: "   " }));
      expect(result).toEqual({ success: false, error: "勤務地を入力してください" });
    });

    it("応募が読めない（RLS で見えない / 取得エラー）ならエラーを返す", async () => {
      setup(null);
      const result = await updateOrderDetailsAction(buildFormData());
      expect(result).toEqual({ success: false, error: "応募が見つかりません" });
    });

    it("案件の持ち主でも同じ組織のメンバーでもなければエラーを返す", async () => {
      const row = appRow();
      row.jobs.owner_id = "other-owner";
      setup(row);
      const result = await updateOrderDetailsAction(buildFormData({ firstWorkDate: "2026-11-05" }));
      expect(result).toEqual({ success: false, error: "この応募に対する権限がありません" });
      expect(mockAdminFrom).not.toHaveBeenCalledWith("applications");
    });

    it("別の組織の案件はエラーを返す", async () => {
      const row = appRow();
      row.jobs.owner_id = "other-owner";
      (row.jobs as { organization_id: string | null }).organization_id = ORG_ID;
      setup(row);
      mockGetActiveOrganizationContext.mockResolvedValue({
        active: { organizationId: "another-org" },
      });
      const result = await updateOrderDetailsAction(buildFormData({ firstWorkDate: "2026-11-05" }));
      expect(result).toEqual({ success: false, error: "この応募に対する権限がありません" });
    });

    it.each(["applied", "completed", "lost", "cancelled", "rejected"])(
      "status = %s の応募は変更できない",
      async (status) => {
        const { applicationsChain } = setup(appRow({ status }));
        const result = await updateOrderDetailsAction(
          buildFormData({ firstWorkDate: "2026-11-05" }),
        );
        expect(result).toEqual({
          success: false,
          error: "発注確定中の応募のみ発注内容を変更できます",
        });
        expect(applicationsChain.update).not.toHaveBeenCalled();
      },
    );

    it("発注者が完了報告を出した後は変更できない", async () => {
      const { applicationsChain } = setup(appRow(), {
        userReview: { data: { id: "r1" }, error: null },
      });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({
        success: false,
        error: "完了報告が提出されているため、発注内容は変更できません",
      });
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });

    it("受注者が完了報告を出した後は変更できない", async () => {
      const { applicationsChain } = setup(appRow(), {
        clientReview: { data: { id: "r2" }, error: null },
      });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result.success).toBe(false);
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });

    it("完了報告の有無を読めなかったときは「無い」とみなさずエラーにする", async () => {
      const { applicationsChain } = setup(appRow(), {
        userReview: { data: null, error: { message: "boom" } },
      });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({ success: false, error: "発注内容の更新に失敗しました" });
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });

    it("今の登録に無い書類を「残す」に指定したらエラーを返す（他人の書類の紐づけ防止）", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({}, { keep: [DOC_A, "someone-else/x/secret.pdf"] }),
      );
      expect(result.success).toBe(false);
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });

    it("追加する書類が本人のフォルダ配下でなければエラーを返す", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({}, { add: ["someone-else/x/doc.jpg"] }),
      );
      expect(result.success).toBe(false);
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });

    it("UPDATE が error を返したらエラーを返し、メールは送らない", async () => {
      setup(appRow(), { update: { data: null, error: { message: "boom" } } });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({ success: false, error: "発注内容の更新に失敗しました" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("UPDATE が 0 行（直前に状態が変わった）ならエラーを返し、メールは送らない", async () => {
      setup(appRow(), { update: { data: [], error: null } });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result.success).toBe(false);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(mockStorageRemove).not.toHaveBeenCalled();
    });
  });

  describe("変更なし", () => {
    it("何も変えずに保存したら DB を書かず、メールも送らない", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(buildFormData());
      expect(result).toEqual({ success: true, data: { changed: false } });
      expect(applicationsChain.update).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(mockStorageRemove).not.toHaveBeenCalled();
    });

    it("前後の空白だけの違いは変更とみなさない", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({ workLocation: " 東京都渋谷区1-1-1 ", clientNotes: "朝礼は8時です\n" }),
      );
      expect(result).toEqual({ success: true, data: { changed: false } });
      expect(applicationsChain.update).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    it("初回稼働日を変えると保存し、受注者と発注者に変更前後の日付入りのメールを送る", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({ success: true, data: { changed: true } });
      expect(applicationsChain.update).toHaveBeenCalledWith({
        first_work_date: "2026-11-05",
        work_location: "東京都渋谷区1-1-1",
        client_notes: "朝礼は8時です",
        document_urls: [DOC_A, DOC_B],
      });
      // accepted の行だけを対象にする（status は書き換えない）
      expect(applicationsChain.eq).toHaveBeenCalledWith("status", "accepted");

      const mails = sentMails();
      const toApplicant = mails.find((m) => m.to === "applicant@test.local");
      expect(toApplicant?.subject).toBe("【ビジ友】「外壁塗装の応援」の発注内容が変更されました");
      expect(toApplicant?.html).toContain("【発注者】 田中工務店");
      expect(toApplicant?.html).toContain("【変更された項目】 初回稼働日");
      expect(toApplicant?.html).toContain("2026/11/05（変更前：2026/11/01）");

      const toOwner = mails.find((m) => m.to === "owner@test.local");
      expect(toOwner?.subject).toBe("【ビジ友】「外壁塗装の応援」の発注内容を変更しました");
      expect(toOwner?.html).toContain("【受注者】 高橋美咲");
      expect(toOwner?.html).toContain("2026/11/05（変更前：2026/11/01）");
      expect(mails).toHaveLength(2);
    });

    it("勤務地とその他だけ変えたメールには初回稼働日の行も本文の中身も載せない", async () => {
      setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({ workLocation: "東京都港区9-9-9 秘密の現場", clientNotes: "" }),
      );
      expect(result).toEqual({ success: true, data: { changed: true } });
      const toApplicant = sentMails().find((m) => m.to === "applicant@test.local");
      expect(toApplicant?.html).toContain("【変更された項目】 勤務地、その他");
      expect(toApplicant?.html).not.toContain("【初回稼働日】");
      expect(toApplicant?.html).not.toContain("秘密の現場");
    });

    it("その他を空にすると null で保存する", async () => {
      const { applicationsChain } = setup(appRow());
      await updateOrderDetailsAction(buildFormData({ clientNotes: "" }));
      expect(applicationsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ client_notes: null }),
      );
    });

    it("書類を 1 件外して 1 件追加すると、残り + 追加の順で保存し、外したファイルを消す", async () => {
      const { applicationsChain } = setup(appRow());
      const result = await updateOrderDetailsAction(
        buildFormData({}, { keep: [DOC_B], add: [NEW_DOC] }),
      );
      expect(result).toEqual({ success: true, data: { changed: true } });
      expect(applicationsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ document_urls: [DOC_B, NEW_DOC] }),
      );
      expect(mockStorageRemove).toHaveBeenCalledWith([DOC_A]);
      const toApplicant = sentMails().find((m) => m.to === "applicant@test.local");
      expect(toApplicant?.html).toContain("【変更された項目】 業務に関する書類");
    });

    it("書類を全部外すと document_urls は null になり、旧形式（公開 URL）の書類もパスに直して消す", async () => {
      const legacy = `https://x.supabase.co/storage/v1/object/public/application-documents/${DOC_A}`;
      const { applicationsChain } = setup(appRow({ document_urls: [legacy] }));
      const result = await updateOrderDetailsAction(buildFormData({}, { keep: [] }));
      expect(result).toEqual({ success: true, data: { changed: true } });
      expect(applicationsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ document_urls: null }),
      );
      expect(mockStorageRemove).toHaveBeenCalledWith([DOC_A]);
    });

    it("ファイルの削除に失敗しても保存は成功扱いにする", async () => {
      setup(appRow());
      mockStorageRemove.mockResolvedValue({ data: null, error: { message: "boom" } });
      const result = await updateOrderDetailsAction(buildFormData({}, { keep: [DOC_A] }));
      expect(result).toEqual({ success: true, data: { changed: true } });
    });

    it("メール送信に失敗しても保存は成功扱いにする", async () => {
      setup(appRow());
      vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"));
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({ success: true, data: { changed: true } });
      vi.mocked(sendEmail).mockResolvedValue({ success: true });
    });

    it("退会済みの受注者にはメールを送らない（発注者側の控えは送る）", async () => {
      const row = appRow();
      (row.applicant as { deleted_at: string | null }).deleted_at = "2026-09-01T00:00:00Z";
      setup(row);
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result.success).toBe(true);
      expect(sentMails().map((m) => m.to)).toEqual(["owner@test.local"]);
    });

    it("同じ組織のメンバー（案件の作成者ではない）も変更できる", async () => {
      const row = appRow();
      row.jobs.owner_id = "other-owner";
      (row.jobs as { organization_id: string | null }).organization_id = ORG_ID;
      const { applicationsChain } = setup(row);
      mockGetActiveOrganizationContext.mockResolvedValue({
        active: { organizationId: ORG_ID },
      });
      const result = await updateOrderDetailsAction(
        buildFormData({ firstWorkDate: "2026-11-05" }),
      );
      expect(result).toEqual({ success: true, data: { changed: true } });
      expect(applicationsChain.update).toHaveBeenCalled();
    });
  });
});
