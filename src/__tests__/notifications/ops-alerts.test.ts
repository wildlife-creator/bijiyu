import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendEmailMock: vi.fn(async (_args: unknown) => ({ success: true as const })),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import {
  sendOrphanAuthUserAlert,
  sendEmailRecycleFailureAlert,
} from "@/lib/email/send/ops-alerts";

const ORG_ID = "55555555-5555-5555-5555-555555555555";
const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_USER_ID = "22222222-2222-2222-2222-222222222222";

// ---------------------------------------------------------------------------
// Lightweight admin client mock for ops-alerts.
// 各テーブルの maybeSingle 戻り値を queue で順に返す。
// ---------------------------------------------------------------------------
function makeAdmin(
  queues: Record<string, Array<{ data: unknown; error: unknown }>>,
) {
  return {
    from: (table: string) => {
      const queue = queues[table] ?? [];
      const result = queue.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result),
      };
      return chain;
    },
    // ops-alerts のヘルパーは auth/rpc を呼ばないため undefined でも OK
  } as never;
}

beforeEach(() => {
  sendEmailMock.mockClear();
});

afterEach(() => {
  delete process.env.OPS_NOTIFICATION_EMAIL;
});

// ---------------------------------------------------------------------------
// sendOrphanAuthUserAlert (§9.1)
// ---------------------------------------------------------------------------

describe("sendOrphanAuthUserAlert — §9.1", () => {
  it("OPS_NOTIFICATION_EMAIL が未設定なら sendEmail を呼ばずに skip + console.warn で運用に検知させる", async () => {
    delete process.env.OPS_NOTIFICATION_EMAIL;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await sendOrphanAuthUserAlert(makeAdmin({}), {
        invitedEmail: "new@example.com",
        organizationId: ORG_ID,
      });

      expect(sendEmailMock).not.toHaveBeenCalled();
      // 「設定漏れに気付けないバグ」を防ぐため必ず warn が出ること
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0]?.[0];
      expect(String(warnMsg)).toContain("OPS_NOTIFICATION_EMAIL not set");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("OPS_NOTIFICATION_EMAIL 設定時: 組織名解決成功 → 件名 + 本文に組織名を含めて送信", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendOrphanAuthUserAlert(
      makeAdmin({
        organizations: [{ data: { owner_id: OWNER_ID }, error: null }],
        client_profiles: [
          { data: { display_name: "株式会社○○建設" }, error: null },
        ],
      }),
      {
        invitedEmail: "new@example.com",
        organizationId: ORG_ID,
      },
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("ops@bijiyu.local");
    expect(args.subject).toBe("【ビジ友 運営】担当者追加が途中で失敗しました");
    expect(args.html).toContain("【対象組織】 株式会社○○建設");
    expect(args.html).toContain("【招待先メールアドレス】 new@example.com");
  });

  it("組織名解決失敗時 (organizations not found) → organization_id (UUID) を fallback として本文に出力", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendOrphanAuthUserAlert(
      makeAdmin({
        organizations: [{ data: null, error: null }],
      }),
      {
        invitedEmail: "new@example.com",
        organizationId: ORG_ID,
      },
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain(`【対象組織】 ${ORG_ID}`);
  });

  // -------------------------------------------------------------------------
  // resolveOrganizationDisplayName 内部 fallback の他 2 ケース
  // (2026-06-28 監査弱点補強)。組織レコードはあるが owner_id null /
  // display_name が空 trim の 2 経路でも UUID fallback で本文に出ること。
  // -------------------------------------------------------------------------
  it("組織は見つかるが owner_id が null → UUID fallback", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendOrphanAuthUserAlert(
      makeAdmin({
        organizations: [{ data: { owner_id: null }, error: null }],
      }),
      { invitedEmail: "new@example.com", organizationId: ORG_ID },
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain(`【対象組織】 ${ORG_ID}`);
  });

  it("client_profiles.display_name が空白のみ (trim で空) → UUID fallback", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendOrphanAuthUserAlert(
      makeAdmin({
        organizations: [{ data: { owner_id: OWNER_ID }, error: null }],
        client_profiles: [{ data: { display_name: "   " }, error: null }],
      }),
      { invitedEmail: "new@example.com", organizationId: ORG_ID },
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain(`【対象組織】 ${ORG_ID}`);
  });
});

// ---------------------------------------------------------------------------
// sendEmailRecycleFailureAlert (§9.2)
// ---------------------------------------------------------------------------

describe("sendEmailRecycleFailureAlert — §9.2", () => {
  it("OPS_NOTIFICATION_EMAIL 未設定なら sendEmail を呼ばずに skip + console.warn で運用に検知させる", async () => {
    delete process.env.OPS_NOTIFICATION_EMAIL;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await sendEmailRecycleFailureAlert(makeAdmin({}), {
        path: "self_withdrawal",
        targetUserId: TARGET_USER_ID,
        targetEmail: "tanaka@example.com",
      });

      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0]?.[0];
      expect(String(warnMsg)).toContain("OPS_NOTIFICATION_EMAIL not set");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("path 'self_withdrawal' → triggerLabel「退会」で送信", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: { last_name: "田中", first_name: "太郎" }, error: null }],
      }),
      {
        path: "self_withdrawal",
        targetUserId: TARGET_USER_ID,
        targetEmail: "tanaka@example.com",
      },
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【発生のきっかけ】 退会");
    expect(html).toContain("【対象ユーザー】 tanaka@example.com(田中太郎 様)");
    // organizationId 未指定 → 行省略
    expect(html).not.toContain("【対象組織】");
  });

  it("path 'admin_force_delete' → triggerLabel「管理者による強制削除」", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: { last_name: "佐藤", first_name: "次郎" }, error: null }],
      }),
      {
        path: "admin_force_delete",
        targetUserId: TARGET_USER_ID,
        targetEmail: "sato@example.com",
      },
    );

    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【発生のきっかけ】 管理者による強制削除");
  });

  it("path 'staff_delete' → triggerLabel「担当者の削除」", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: { last_name: "鈴木", first_name: "花子" }, error: null }],
      }),
      {
        path: "staff_delete",
        targetUserId: TARGET_USER_ID,
        targetEmail: "suzuki@example.com",
        organizationId: ORG_ID,
      },
    );

    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【発生のきっかけ】 担当者の削除");
  });

  it("未定義 path → triggerLabel「その他」フォールバック (運営に届かないより届く方が優先)", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: { last_name: "山田", first_name: "次郎" }, error: null }],
      }),
      {
        path: "unknown_future_path",
        targetUserId: TARGET_USER_ID,
        targetEmail: "yamada@example.com",
      },
    );

    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【発生のきっかけ】 その他");
  });

  it("organizationId 指定 + 組織名解決成功 → 【対象組織】行を本文に含める", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: { last_name: "田中", first_name: "太郎" }, error: null }],
        organizations: [{ data: { owner_id: OWNER_ID }, error: null }],
        client_profiles: [
          { data: { display_name: "株式会社○○建設" }, error: null },
        ],
      }),
      {
        path: "self_withdrawal",
        targetUserId: TARGET_USER_ID,
        targetEmail: "tanaka@example.com",
        organizationId: ORG_ID,
      },
    );

    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【対象組織】 株式会社○○建設");
  });

  it("targetEmail null (user_not_found 経路) → 「(取得不可)」フォールバック", async () => {
    process.env.OPS_NOTIFICATION_EMAIL = "ops@bijiyu.local";

    await sendEmailRecycleFailureAlert(
      makeAdmin({
        users: [{ data: null, error: null }],
      }),
      {
        path: "self_withdrawal",
        targetUserId: TARGET_USER_ID,
        targetEmail: null,
      },
    );

    const html = (sendEmailMock.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain("【対象ユーザー】 (取得不可)((氏名未設定) 様)");
  });
});
