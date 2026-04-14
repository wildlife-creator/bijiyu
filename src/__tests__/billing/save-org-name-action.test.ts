import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for saveOrganizationNameAction (Task 13.15).
 */

const authState = { user: null as null | { id: string } };
const userRowState = { role: "client" as string };
const orgState = { id: "org-1" as string | null };
const adminOps: Array<{ op: string; table: string; payload?: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.user },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role: userRowState.role },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (..._args: unknown[]) => ({
          is: () => ({
            maybeSingle: async () => ({
              data: orgState.id ? { id: orgState.id } : null,
              error: null,
            }),
          }),
        }),
      }),
      update: (payload: unknown) => {
        adminOps.push({ op: "update", table, payload });
        return {
          eq: () => Promise.resolve({ error: null }),
        };
      },
      insert: (payload: unknown) => {
        adminOps.push({ op: "insert", table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

// Mock redirect to capture the target path
const redirectMock = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const { saveOrganizationNameAction } = await import(
  "@/app/(authenticated)/mypage/organization-setup/actions"
);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  authState.user = { id: "user-1" };
  userRowState.role = "client";
  orgState.id = "org-1";
  adminOps.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("saveOrganizationNameAction", () => {
  it("returns error when not authenticated", async () => {
    authState.user = null;
    const result = await saveOrganizationNameAction("テスト建設");
    expect(result.success).toBe(false);
  });

  it("returns error for staff role", async () => {
    userRowState.role = "staff";
    const result = await saveOrganizationNameAction("テスト建設");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("発注者アカウントのみ");
  });

  it("returns error for contractor role", async () => {
    userRowState.role = "contractor";
    const result = await saveOrganizationNameAction("テスト建設");
    expect(result.success).toBe(false);
  });

  it("returns error for empty string after trim", async () => {
    const result = await saveOrganizationNameAction("   ");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("組織名を入力");
  });

  it("returns error for string over 100 chars", async () => {
    const result = await saveOrganizationNameAction("あ".repeat(101));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("100文字以内");
  });

  it("accepts exactly 1 char (boundary)", async () => {
    await expect(saveOrganizationNameAction("A")).rejects.toThrow("NEXT_REDIRECT");
    const updateOp = adminOps.find((o) => o.op === "update" && o.table === "organizations");
    expect(updateOp).toBeDefined();
  });

  it("accepts exactly 100 chars (boundary)", async () => {
    await expect(saveOrganizationNameAction("あ".repeat(100))).rejects.toThrow("NEXT_REDIRECT");
    const updateOp = adminOps.find((o) => o.op === "update" && o.table === "organizations");
    expect(updateOp).toBeDefined();
  });

  it("updates organization name and records audit log", async () => {
    await expect(saveOrganizationNameAction("テスト株式会社")).rejects.toThrow("NEXT_REDIRECT");

    const updateOp = adminOps.find((o) => o.op === "update" && o.table === "organizations");
    expect(updateOp?.payload).toEqual({ name: "テスト株式会社" });

    const auditOp = adminOps.find((o) => o.op === "insert" && o.table === "audit_logs");
    expect(auditOp?.payload).toMatchObject({
      actor_id: "user-1",
      action: "organization_name_set",
      target_type: "organization",
    });
  });

  it("redirects to /mypage?setup_completed=true on success", async () => {
    await expect(saveOrganizationNameAction("テスト建設")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/mypage?setup_completed=true");
  });
});
