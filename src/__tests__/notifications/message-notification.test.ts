import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const { sendEmailMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendEmailMock: vi.fn(async (_args: unknown) => ({ success: true as const })),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: sendEmailMock,
}));

const { getOrgMembersMock } = vi.hoisted(() => ({
  getOrgMembersMock: vi.fn(),
}));
vi.mock("@/lib/email/recipients/organization-members", () => ({
  getOrganizationMemberRecipients: getOrgMembersMock,
  // 同モジュールから getJobClientRecipients も export されているが本テストでは未使用、
  // ただし他テンプレ side import がぶつからないよう noop stub にしておく
  getJobClientRecipients: vi.fn(),
  getUserOrganizationRecipients: vi.fn(),
}));

import { sendMessageNotification } from "@/lib/email/send/message-notification";

// ---------------------------------------------------------------------------
// Admin client mock — sequential chain queue
// ---------------------------------------------------------------------------

type ChainResponse =
  | { kind: "maybeSingle"; data: unknown; error?: unknown }
  | { kind: "update"; data?: unknown; error?: unknown };

interface ChainCall {
  table: string;
  selectArgs: unknown[];
  eqCalls: Array<[string, unknown]>;
  updatePayload: Record<string, unknown> | null;
}

interface MockAdmin {
  from: ReturnType<typeof vi.fn>;
  calls: ChainCall[];
}

function makeMockAdmin(queue: ChainResponse[]): MockAdmin {
  const calls: ChainCall[] = [];
  let queueIndex = 0;
  const from = vi.fn((table: string) => {
    const callRecord: ChainCall = {
      table,
      selectArgs: [],
      eqCalls: [],
      updatePayload: null,
    };
    calls.push(callRecord);
    const response = queue[queueIndex];
    queueIndex++;
    if (!response) {
      throw new Error(
        `Unexpected admin.from("${table}") call #${queueIndex} — queue exhausted`,
      );
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((...args: unknown[]) => {
        callRecord.selectArgs = args;
        return chain;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        callRecord.eqCalls.push([col, val]);
        return response.kind === "update"
          ? Promise.resolve({
              data: response.data ?? null,
              error: response.error ?? null,
            })
          : chain;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        callRecord.updatePayload = payload;
        return chain;
      }),
      maybeSingle: vi.fn().mockResolvedValue(
        response.kind === "maybeSingle"
          ? { data: response.data, error: response.error ?? null }
          : { data: null, error: null },
      ),
    };
    return chain;
  });
  return { from, calls };
}

const THREAD_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_ORG_ID = "88888888-8888-8888-8888-888888888888";
const SENDER_ID = "33333333-3333-3333-3333-333333333333";
const RECEIVER_ID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue({ success: true as const });
  getOrgMembersMock.mockReset();
});

// ===========================================================================
// Phase 2 (A2 修正): 送信方向は sender の席 (identity) から決まる
// ===========================================================================

describe("sendMessageNotification — sender is side 1, receiver is side 2 (個人 identity)", () => {
  it("受信者 = 個人 identity (organization_2_id NULL) → 受信参加者 1 名にメール送信 + last_email_to_contractor_at 更新", async () => {
    const admin = makeMockAdmin([
      // 1. clock (未送信 = null)
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // 2. receiver user info (個人 identity)
      {
        kind: "maybeSingle",
        data: {
          email: "receiver@example.com",
          last_name: "田中",
          first_name: "太郎",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 3. sender name resolution (sender も個人 identity)
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "花子",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 4. clock update
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "はじめまして",
        hasImage: false,
      },
    );

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "receiver@example.com" }),
    );

    // クロック更新: side 2 が受信側なので last_email_to_contractor_at
    const updateCall = admin.calls.find((c) => c.updatePayload !== null);
    expect(updateCall?.updatePayload).toHaveProperty(
      "last_email_to_contractor_at",
    );
  });
});

describe("sendMessageNotification — sender is side 2, receiver is side 1 (組織 identity, broadcast)", () => {
  it("受信側 = 法人 organization_1_id NOT NULL → 組織メンバー broadcast + last_email_to_client_side_at 更新", async () => {
    getOrgMembersMock.mockResolvedValue([
      { email: "owner@example.com", displayName: "工務店A オーナー" },
      { email: "staff@example.com", displayName: "工務店A 担当" },
    ]);

    const admin = makeMockAdmin([
      // 1. clock (side 1 = client_side)
      { kind: "maybeSingle", data: { last_email_to_client_side_at: null } },
      // (org broadcast は getOrganizationMemberRecipients 経由なので admin.from は呼ばれない)
      // 2. sender name (sender = 個人受注者)
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "次郎",
          company_name: "山田工務店",
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 3. clock update
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: RECEIVER_ID,
          participant_2_id: SENDER_ID,
          organization_1_id: ORG_ID,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "はい大丈夫です",
        hasImage: false,
      },
    );

    expect(getOrgMembersMock).toHaveBeenCalledWith(expect.anything(), ORG_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);

    const updateCall = admin.calls.find((c) => c.updatePayload !== null);
    expect(updateCall?.updatePayload).toHaveProperty(
      "last_email_to_client_side_at",
    );
  });
});

// ===========================================================================
// A4 修正: 代理スタッフ送信でも sender_name は組織 Owner の display_name
// ===========================================================================

describe("sendMessageNotification — sender name resolution (A4)", () => {
  it("sender が organization side なら Owner の client_profiles.display_name を sender_name にする", async () => {
    const admin = makeMockAdmin([
      // 1. clock
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // 2. receiver user info (contractor 側 = 個人)
      {
        kind: "maybeSingle",
        data: {
          email: "contractor@example.com",
          last_name: "受注者",
          first_name: "花子",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 3. sender side org → organizations.owner_user 経由で display_name 解決
      {
        kind: "maybeSingle",
        data: {
          owner_user: {
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
            client_profiles: [{ display_name: "ビジ友テスト工務店A" }],
          },
        },
      },
      // 4. clock update
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID, // Owner の id (participant)
          participant_2_id: RECEIVER_ID,
          organization_1_id: ORG_ID,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "お世話になります",
        hasImage: false,
      },
    );

    // A4: 送信者名は Owner 個人名ではなく組織 display_name
    const emailArgs = sendEmailMock.mock.calls[0]?.[0] as
      | { html: string; subject: string }
      | undefined;
    expect(emailArgs?.html).toContain("ビジ友テスト工務店A");
  });

  it("sender が個人 identity で displayName なし + companyName あり → 屋号を sender_name にする", async () => {
    const admin = makeMockAdmin([
      // 1. clock
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // 2. receiver
      {
        kind: "maybeSingle",
        data: {
          email: "receiver@example.com",
          last_name: "田中",
          first_name: "太郎",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 3. sender = 個人受注者 (client_profiles なし、company_name あり)
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "次郎",
          company_name: "山田工務店",
          deleted_at: null,
          client_profiles: null,
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "ご連絡ありがとうございます",
        hasImage: false,
      },
    );

    const emailArgs = sendEmailMock.mock.calls[0]?.[0] as
      | { html: string }
      | undefined;
    expect(emailArgs?.html).toContain("山田工務店");
  });
});

// ===========================================================================
// A2 修正: role ではなく identity で送信方向を決めるため、
// 有料受注者 (role=client でも受信側席が個人 identity) にも通知が届く
// ===========================================================================

describe("sendMessageNotification — 有料受注者 (role=client) 宛の通知が壊れないこと (A2)", () => {
  it("受信者が role=client だが個人 identity (organization_1_id NULL) なら受注者側 mailbox として扱う", async () => {
    const admin = makeMockAdmin([
      // 1. clock (side 1 = client_side)
      { kind: "maybeSingle", data: { last_email_to_client_side_at: null } },
      // 2. receiver (role=client の個人 identity)
      {
        kind: "maybeSingle",
        data: {
          email: "paid-contractor@example.com",
          last_name: "有料",
          first_name: "受注者",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 3. sender name (side 2 = 組織側 → org owner)
      {
        kind: "maybeSingle",
        data: {
          owner_user: {
            last_name: "発注",
            first_name: "太郎",
            deleted_at: null,
            client_profiles: [{ display_name: "発注者法人" }],
          },
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: RECEIVER_ID, // 有料受注者 = 個人 identity
          participant_2_id: SENDER_ID, // 発注者 org owner
          organization_1_id: null,
          organization_2_id: ORG_ID,
        },
        senderId: SENDER_ID,
        messageBody: "スカウトさせてください",
        hasImage: false,
      },
    );

    // A2 の要点: 有料受注者にもメールが飛ぶ (旧設計では role=client 判定で
    // 発注者側 broadcast にすり替えられて届かなかった)
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "paid-contractor@example.com" }),
    );
  });
});

// ===========================================================================
// throttle
// ===========================================================================

describe("sendMessageNotification — throttle 15 分", () => {
  it("受信側クロックが 15 分以内 → skip (sendEmail 呼ばれず)", async () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分前

    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { last_email_to_contractor_at: recent } },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "追撃メッセージ",
        hasImage: false,
      },
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("受信側クロックが 15 分超 → 通常通り送信 + クロック更新", async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 分前

    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { last_email_to_contractor_at: old } },
      {
        kind: "maybeSingle",
        data: {
          email: "receiver@example.com",
          last_name: "受注",
          first_name: "者",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "花子",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "こんにちは",
        hasImage: false,
      },
    );

    expect(sendEmailMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 画像のみメッセージ
// ===========================================================================

describe("sendMessageNotification — 画像のみメッセージ", () => {
  it("messageBody 空 + hasImage=true → 本文に「(画像が添付されています)」プレースホルダー", async () => {
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      {
        kind: "maybeSingle",
        data: {
          email: "receiver@example.com",
          last_name: "受注",
          first_name: "者",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "花子",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "",
        hasImage: true,
      },
    );

    const emailArgs = sendEmailMock.mock.calls[0]?.[0] as
      | { html: string }
      | undefined;
    expect(emailArgs?.html).toContain("(画像が添付されています)");
  });
});

// ===========================================================================
// 受信者状態による skip
// ===========================================================================

describe("sendMessageNotification — 受信者状態による skip", () => {
  it("受信参加者の users 行が見つからない (email null) → sendEmail せず early return", async () => {
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      { kind: "maybeSingle", data: null },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: SENDER_ID,
          participant_2_id: RECEIVER_ID,
          organization_1_id: null,
          organization_2_id: null,
        },
        senderId: SENDER_ID,
        messageBody: "test",
        hasImage: false,
      },
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sender が participant でない (代理スタッフ broadcast) ケース
// ===========================================================================

describe("sendMessageNotification — sender が participant でない (代理送信)", () => {
  it("sender が organization_1_id のメンバー → side 1 として扱い、受信は side 2", async () => {
    const PROXY_STAFF_ID = "99999999-9999-9999-9999-999999999999";
    const admin = makeMockAdmin([
      // 1. sender の organization_members (代理スタッフの所属 org)
      { kind: "maybeSingle", data: { organization_id: ORG_ID } },
      // 2. clock (受信 = side 2 → contractor)
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // 3. receiver
      {
        kind: "maybeSingle",
        data: {
          email: "receiver@example.com",
          last_name: "受注",
          first_name: "者",
          company_name: null,
          deleted_at: null,
          client_profiles: null,
        },
      },
      // 4. sender org owner (A4: 代理スタッフではなく Owner の display_name)
      {
        kind: "maybeSingle",
        data: {
          owner_user: {
            last_name: "オ",
            first_name: "ーナー",
            deleted_at: null,
            client_profiles: [{ display_name: "ビジ友テスト工務店A" }],
          },
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: "88880000-8888-8888-8888-888888888888", // Owner (別 user)
          participant_2_id: RECEIVER_ID,
          organization_1_id: ORG_ID,
          organization_2_id: null,
        },
        senderId: PROXY_STAFF_ID,
        messageBody: "代理送信します",
        hasImage: false,
      },
    );

    const emailArgs = sendEmailMock.mock.calls[0]?.[0] as
      | { html: string }
      | undefined;
    // A4: 代理スタッフの姓名でなく組織 display_name が sender として現れる
    expect(emailArgs?.html).toContain("ビジ友テスト工務店A");
    // 代理スタッフ本人の姓名は sender として現れない
    expect(emailArgs?.html).not.toContain("代理スタッフ");
  });

  it("sender が organization_1/2 いずれのメンバーでもない → 通知 skip (安全側)", async () => {
    const admin = makeMockAdmin([
      // sender org 解決 → 未帰属
      { kind: "maybeSingle", data: null },
    ]);

    await sendMessageNotification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      {
        threadId: THREAD_ID,
        thread: {
          participant_1_id: "aaaa0000-0000-0000-0000-000000000001",
          participant_2_id: "aaaa0000-0000-0000-0000-000000000002",
          organization_1_id: ORG_ID,
          organization_2_id: OTHER_ORG_ID,
        },
        senderId: "aaaa0000-0000-0000-0000-999999999999",
        messageBody: "test",
        hasImage: false,
      },
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
