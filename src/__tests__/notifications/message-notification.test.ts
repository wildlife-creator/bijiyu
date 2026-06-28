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
  /** select で渡されたカラム指定 (検証用) */
  selectArgs: unknown[];
  /** eq("col", val) の引数列 (順番保持) */
  eqCalls: Array<[string, unknown]>;
  /** update に渡された payload */
  updatePayload: Record<string, unknown> | null;
}

interface MockAdmin {
  from: ReturnType<typeof vi.fn>;
  /** 全 from() 呼出の記録 (順序保持、検証用) */
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
const SENDER_ID = "33333333-3333-3333-3333-333333333333";
const RECEIVER_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_PARTICIPANT_ID = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue({ success: true as const });
  getOrgMembersMock.mockReset();
});

// ===========================================================================
// Direction = to_contractor (受信者 = 受注者)
// ===========================================================================

describe("sendMessageNotification — direction: to_contractor", () => {
  it("受信者 role='contractor' → 受注者本人 1 名にメール送信 + last_email_to_contractor_at 更新", async () => {
    const admin = makeMockAdmin([
      // 1. receiver role
      { kind: "maybeSingle", data: { role: "contractor" } },
      // 2. clock (未送信 = null)
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // 3. contractor user info
      {
        kind: "maybeSingle",
        data: {
          email: "tanaka@example.com",
          last_name: "田中",
          first_name: "太郎",
          deleted_at: null,
        },
      },
      // 4. sender user info (client side = display_name 優先)
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "次郎",
          deleted_at: null,
          client_profiles: { display_name: "株式会社○○建設" },
        },
      },
      // 5. clock UPDATE
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: ORG_ID,
      },
      senderId: SENDER_ID,
      messageBody: "現場の駐車場はありますか？",
      hasImage: false,
    });

    // 1 通だけ送信されている
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("tanaka@example.com");
    expect(args.subject).toBe(
      "【ビジ友】株式会社○○建設さんから新しいメッセージが届きました",
    );
    expect(args.html).toContain("田中太郎 様");
    expect(args.html).toContain("株式会社○○建設さんから新しいメッセージが届きました。");
    expect(args.html).toContain("現場の駐車場はありますか？");

    // 法人 broadcast は走らない
    expect(getOrgMembersMock).not.toHaveBeenCalled();

    // クロック更新が呼ばれている (5 番目の from = message_threads update)
    const updateCall = admin.calls[4];
    expect(updateCall.table).toBe("message_threads");
    expect(updateCall.updatePayload).toHaveProperty("last_email_to_contractor_at");
    expect(updateCall.updatePayload).not.toHaveProperty("last_email_to_client_side_at");
  });
});

// ===========================================================================
// Direction = to_client_side, 法人 organization broadcast (M-03)
// ===========================================================================

describe("sendMessageNotification — direction: to_client_side (法人 org broadcast)", () => {
  it("受信者 role='client' + thread.organization_id NOT NULL → getOrganizationMemberRecipients で broadcast + last_email_to_client_side_at 更新", async () => {
    getOrgMembersMock.mockResolvedValue([
      {
        userId: "owner-1",
        email: "owner@example.com",
        displayName: "株式会社○○建設",
      },
      {
        userId: "staff-1",
        email: "staff@example.com",
        displayName: "株式会社○○建設",
      },
    ]);

    const admin = makeMockAdmin([
      // 1. receiver role (client)
      { kind: "maybeSingle", data: { role: "client" } },
      // 2. clock null
      { kind: "maybeSingle", data: { last_email_to_client_side_at: null } },
      // 3. sender user (contractor 屋号優先)
      {
        kind: "maybeSingle",
        data: {
          last_name: "田中",
          first_name: "太郎",
          company_name: "田中工務店",
          deleted_at: null,
        },
      },
      // 4. clock UPDATE
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: ORG_ID,
      },
      senderId: SENDER_ID,
      messageBody: "本日伺います。",
      hasImage: false,
    });

    // 組織メンバー 2 名に broadcast
    expect(getOrgMembersMock).toHaveBeenCalledWith(admin, ORG_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);

    const emails = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(emails).toContain("owner@example.com");
    expect(emails).toContain("staff@example.com");

    // 送信者は contractor 屋号優先 = 田中工務店
    const args0 = sendEmailMock.mock.calls[0]?.[0] as {
      subject: string;
      html: string;
    };
    expect(args0.subject).toBe(
      "【ビジ友】田中工務店さんから新しいメッセージが届きました",
    );
    expect(args0.html).toContain("田中工務店さんから新しいメッセージが届きました。");

    // クロック更新 last_email_to_client_side_at
    const updateCall = admin.calls[3];
    expect(updateCall.table).toBe("message_threads");
    expect(updateCall.updatePayload).toHaveProperty("last_email_to_client_side_at");
    expect(updateCall.updatePayload).not.toHaveProperty("last_email_to_contractor_at");
  });
});

// ===========================================================================
// Direction = to_client_side, 個人発注者 (organization_id null)
// ===========================================================================

describe("sendMessageNotification — direction: to_client_side (個人発注者)", () => {
  it("受信者 role='client' + thread.organization_id NULL → 個人発注者本人 1 名に送信 (display_name 優先)", async () => {
    const admin = makeMockAdmin([
      // 1. receiver role
      { kind: "maybeSingle", data: { role: "client" } },
      // 2. clock null
      { kind: "maybeSingle", data: { last_email_to_client_side_at: null } },
      // 3. client user info (display_name で resolve)
      {
        kind: "maybeSingle",
        data: {
          email: "client@example.com",
          last_name: "山田",
          first_name: "次郎",
          deleted_at: null,
          client_profiles: { display_name: "山田個人事業主" },
        },
      },
      // 4. sender (contractor)
      {
        kind: "maybeSingle",
        data: {
          last_name: "田中",
          first_name: "太郎",
          company_name: null,
          deleted_at: null,
        },
      },
      // 5. clock UPDATE
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "了解です",
      hasImage: false,
    });

    // 組織 broadcast は呼ばない (org_id null だから)
    expect(getOrgMembersMock).not.toHaveBeenCalled();
    // 1 通だけ
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      html: string;
    };
    expect(args.to).toBe("client@example.com");
    expect(args.html).toContain("山田個人事業主 様"); // display_name 優先
    // sender = contractor 屋号 NULL なので姓名フォールバック
    expect(args.html).toContain("田中太郎さんから新しいメッセージが届きました。");
  });
});

// ===========================================================================
// Throttle 15 分 — skip / expired 両方
// ===========================================================================

describe("sendMessageNotification — throttle 15 分", () => {
  it("受信側クロックが 15 分以内 → sendEmail 呼ばず、クロック更新もしない (skip)", async () => {
    const recentClock = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分前
    const admin = makeMockAdmin([
      // 1. receiver role
      { kind: "maybeSingle", data: { role: "contractor" } },
      // 2. clock 5 分前 → throttle で skip
      {
        kind: "maybeSingle",
        data: { last_email_to_contractor_at: recentClock },
      },
      // 以降は呼ばれないはず
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "追撃メッセージ",
      hasImage: false,
    });

    // sendEmail は呼ばれない
    expect(sendEmailMock).not.toHaveBeenCalled();
    // クロック UPDATE も呼ばれない (= admin.from は 2 回だけ)
    expect(admin.from).toHaveBeenCalledTimes(2);
    const updateCalls = admin.calls.filter((c) => c.updatePayload !== null);
    expect(updateCalls).toHaveLength(0);
  });

  it("受信側クロックが 15 分超 → 通常通り送信 + クロック更新", async () => {
    const oldClock = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 分前
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { role: "contractor" } },
      { kind: "maybeSingle", data: { last_email_to_contractor_at: oldClock } },
      {
        kind: "maybeSingle",
        data: {
          email: "tanaka@example.com",
          last_name: "田中",
          first_name: "太郎",
          deleted_at: null,
        },
      },
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "次郎",
          deleted_at: null,
          client_profiles: { display_name: "山田工務店" },
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "20 分経過後の再送",
      hasImage: false,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // クロック UPDATE される
    const updateCall = admin.calls.find((c) => c.updatePayload !== null);
    expect(updateCall?.table).toBe("message_threads");
    expect(updateCall?.updatePayload).toHaveProperty(
      "last_email_to_contractor_at",
    );
  });
});

// ===========================================================================
// 画像のみメッセージ → プレースホルダー差し込み
// ===========================================================================

describe("sendMessageNotification — 画像のみメッセージ", () => {
  it("messageBody 空 + hasImage=true → 本文に「(画像が添付されています)」プレースホルダー", async () => {
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { role: "contractor" } },
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      {
        kind: "maybeSingle",
        data: {
          email: "tanaka@example.com",
          last_name: "田中",
          first_name: "太郎",
          deleted_at: null,
        },
      },
      {
        kind: "maybeSingle",
        data: {
          last_name: "山田",
          first_name: "次郎",
          deleted_at: null,
          client_profiles: { display_name: "山田工務店" },
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "",
      hasImage: true,
    });

    const args = sendEmailMock.mock.calls[0]?.[0] as { html: string };
    expect(args.html).toContain("(画像が添付されています)");
  });
});

// ===========================================================================
// 防御: 受信者が退会済 / email 無し → skip
// ===========================================================================

describe("sendMessageNotification — 受信者状態による skip", () => {
  it("受信者 (contractor) の deleted_at が set されている → sendEmail せず、クロック更新もしない", async () => {
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { role: "contractor" } },
      { kind: "maybeSingle", data: { last_email_to_contractor_at: null } },
      // contractor 取得時に deleted_at セット = recipients 空配列
      {
        kind: "maybeSingle",
        data: {
          email: "tanaka@example.com",
          last_name: "田中",
          first_name: "太郎",
          deleted_at: new Date().toISOString(),
        },
      },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "退会済へのメッセージ",
      hasImage: false,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    // recipients 0 件で early return → クロック更新もしない
    const updateCalls = admin.calls.filter((c) => c.updatePayload !== null);
    expect(updateCalls).toHaveLength(0);
  });

  it("受信者の users 行が見つからない (role 取得 null) → sendEmail せず early return", async () => {
    const admin = makeMockAdmin([
      // receiver role 取得が null
      { kind: "maybeSingle", data: null },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: OTHER_PARTICIPANT_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "test",
      hasImage: false,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    // admin.from は 1 回だけ (role 取得) で打ち切り
    expect(admin.from).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 送信者名解決のロジック確認
// ===========================================================================

describe("sendMessageNotification — 送信者名解決", () => {
  it("受信者 = client side → 送信者 (contractor) は屋号優先で表示", async () => {
    const admin = makeMockAdmin([
      { kind: "maybeSingle", data: { role: "client" } },
      { kind: "maybeSingle", data: { last_email_to_client_side_at: null } },
      {
        kind: "maybeSingle",
        data: {
          email: "client@example.com",
          last_name: "山田",
          first_name: "次郎",
          deleted_at: null,
          client_profiles: { display_name: "山田事業所" },
        },
      },
      // sender = contractor with company_name (屋号優先される)
      {
        kind: "maybeSingle",
        data: {
          last_name: "田中",
          first_name: "太郎",
          company_name: "田中工務店",
          deleted_at: null,
        },
      },
      { kind: "update" },
    ]);

    await sendMessageNotification(admin as never, {
      threadId: THREAD_ID,
      thread: {
        participant_1_id: SENDER_ID,
        participant_2_id: RECEIVER_ID,
        organization_id: null,
      },
      senderId: SENDER_ID,
      messageBody: "本日伺います",
      hasImage: false,
    });

    const args = sendEmailMock.mock.calls[0]?.[0] as { subject: string };
    // 屋号 (田中工務店) が件名に出る、姓名 (田中太郎) ではない
    expect(args.subject).toBe(
      "【ビジ友】田中工務店さんから新しいメッセージが届きました",
    );
  });
});
