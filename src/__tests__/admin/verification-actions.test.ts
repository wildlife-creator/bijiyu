import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-012 の Server Action テスト（Task 9.3）。
 * - approveVerificationAction: pending 楽観チェック・users フラグ更新
 *   （ccus は ccus_worker_id も反映）・audit log（identity_approve）・
 *   通知メール（fire-and-forget。失敗しても本体処理を維持）
 * - rejectVerificationAction: 否認理由必須（max 1000）・status='rejected'＋
 *   rejection_reason・audit log（identity_reject）・再提出依頼メール
 */

const authState = {
  user: null as null | { id: string },
  role: "admin" as string | null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.role ? { role: authState.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const adminState = {
  verification: null as null | Record<string, unknown>,
  targetUser: null as null | Record<string, unknown>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateError: null as null | { message: string },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          adminState.updates.push({ table, payload });
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "identity_verifications") {
            return { data: adminState.verification, error: null };
          }
          if (table === "users") {
            return { data: adminState.targetUser, error: null };
          }
          return { data: null, error: null };
        }),
      };
      // update().eq() チェーンの await 解決（{ error } 形状を正確に再現）
      Object.defineProperty(chain, "then", {
        configurable: true,
        value: (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: adminState.updateError }),
      });
      return chain;
    },
  }),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  approveVerificationAction,
  rejectVerificationAction,
} from "@/app/admin/(protected)/verifications/[id]/actions";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const VERIFICATION_ID = "aaaaaaaa-0000-1000-8000-000000000001";
const TARGET_USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  authState.user = { id: ADMIN_ID };
  authState.role = "admin";
  adminState.verification = {
    id: VERIFICATION_ID,
    user_id: TARGET_USER_ID,
    document_type: "identity",
    status: "pending",
    ccus_worker_id: null,
  };
  adminState.targetUser = {
    id: TARGET_USER_ID,
    email: "contractor@test.local",
    last_name: "山田",
    first_name: "太郎",
    deleted_at: null,
  };
  adminState.updates = [];
  adminState.updateError = null;
  mockSendEmail.mockReset().mockResolvedValue({ success: true });
  mockWriteAuditLog.mockClear();
  mockRedirect.mockClear();
});

function reasonFormData(reason: string): FormData {
  const fd = new FormData();
  fd.set("rejectionReason", reason);
  return fd;
}

describe("approveVerificationAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "contractor";
    const result = await approveVerificationAction(VERIFICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("pending でないレコードは「既に審査済みです」", async () => {
    adminState.verification = {
      ...adminState.verification!,
      status: "approved",
    };
    const result = await approveVerificationAction(VERIFICATION_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("既に審査済み");
    }
    expect(adminState.updates).toHaveLength(0);
  });

  it("identity 承認: status/reviewed_by/reviewed_at 更新 + identity_verified=true + audit + メール", async () => {
    await expect(approveVerificationAction(VERIFICATION_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/verifications",
    );

    const vUpdate = adminState.updates.find(
      (u) => u.table === "identity_verifications",
    );
    expect(vUpdate?.payload.status).toBe("approved");
    expect(vUpdate?.payload.reviewed_by).toBe(ADMIN_ID);
    expect(vUpdate?.payload.reviewed_at).toBeTruthy();

    const uUpdate = adminState.updates.find((u) => u.table === "users");
    expect(uUpdate?.payload).toEqual({ identity_verified: true });

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "identity_approve",
        actorId: ADMIN_ID,
        targetId: VERIFICATION_ID,
        metadata: expect.objectContaining({ document_type: "identity" }),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "contractor@test.local",
        subject: expect.stringContaining("本人確認"),
      }),
    );
  });

  it("ccus 承認: ccus_verified=true + ccus_worker_id を users へ反映", async () => {
    adminState.verification = {
      id: VERIFICATION_ID,
      user_id: TARGET_USER_ID,
      document_type: "ccus",
      status: "pending",
      ccus_worker_id: "12345678912345",
    };

    await expect(approveVerificationAction(VERIFICATION_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/verifications",
    );

    const uUpdate = adminState.updates.find((u) => u.table === "users");
    expect(uUpdate?.payload).toEqual({
      ccus_verified: true,
      ccus_worker_id: "12345678912345",
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("CCUS") }),
    );
  });

  it("メール送信失敗でも本体処理は維持される（redirect まで到達）", async () => {
    mockSendEmail.mockRejectedValue(new Error("smtp down"));

    await expect(approveVerificationAction(VERIFICATION_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/verifications",
    );

    expect(
      adminState.updates.some((u) => u.table === "identity_verifications"),
    ).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_approve" }),
    );
  });

  it("DB 更新エラー時はエラーを返す（メール送信しない）", async () => {
    adminState.updateError = { message: "db down" };
    const result = await approveVerificationAction(VERIFICATION_ID);
    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("rejectVerificationAction", () => {
  it("否認理由なしは拒否", async () => {
    const result = await rejectVerificationAction(
      VERIFICATION_ID,
      reasonFormData(""),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("否認理由 1000 文字超は拒否", async () => {
    const result = await rejectVerificationAction(
      VERIFICATION_ID,
      reasonFormData("あ".repeat(1001)),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("pending でないレコードは「既に審査済みです」", async () => {
    adminState.verification = {
      ...adminState.verification!,
      status: "rejected",
    };
    const result = await rejectVerificationAction(
      VERIFICATION_ID,
      reasonFormData("不鮮明です"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("既に審査済み");
    }
  });

  it("否認: status='rejected'＋rejection_reason + audit + 再提出依頼メール", async () => {
    await expect(
      rejectVerificationAction(VERIFICATION_ID, reasonFormData("書類が不鮮明です")),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/verifications");

    const vUpdate = adminState.updates.find(
      (u) => u.table === "identity_verifications",
    );
    expect(vUpdate?.payload.status).toBe("rejected");
    expect(vUpdate?.payload.rejection_reason).toBe("書類が不鮮明です");

    // 否認では users のフラグを更新しない
    expect(adminState.updates.some((u) => u.table === "users")).toBe(false);

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "identity_reject",
        actorId: ADMIN_ID,
        targetId: VERIFICATION_ID,
        metadata: expect.objectContaining({ document_type: "identity" }),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "contractor@test.local",
        html: expect.stringContaining("書類が不鮮明です"),
      }),
    );
  });
});
