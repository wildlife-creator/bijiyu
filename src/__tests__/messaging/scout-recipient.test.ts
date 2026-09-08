import { describe, expect, it, vi } from "vitest";

import {
  resolveScoutRecipientUserIds,
  resolveSideUserIds,
} from "@/lib/messaging/scout-recipient";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * スカウト受信者判定（src/lib/messaging/scout-recipient.ts）のテスト。
 * ステージング指摘 No.33: 法人プランの会員が職人としてスカウトを受ける（両側が組織 identity）
 * ケースで「受ける／断る」ボタンが出ず、応答も拒否されていた不具合の回帰防止。
 */

const ORG_A = "org-a";
const ORG_B = "org-b";
const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF_A = "staff-a";
const STAFF_B = "staff-b";
const CONTRACTOR = "contractor-1";
const INDIVIDUAL_CLIENT = "individual-client";

/** organization_members だけを返す最小の admin client モック */
function fakeAdmin(members: Record<string, string[]>) {
  const calls: string[] = [];
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, orgId: string) => {
          calls.push(orgId);
          return Promise.resolve({
            data: (members[orgId] ?? []).map((user_id) => ({ user_id })),
            error: null,
          });
        }),
      })),
    })),
  };
  return {
    admin: admin as unknown as ReturnType<typeof createAdminClient>,
    calls,
  };
}

const members = {
  [ORG_A]: [OWNER_A, STAFF_A],
  [ORG_B]: [OWNER_B, STAFF_B],
};

describe("resolveSideUserIds", () => {
  it("個人 identity なら participant のみ（organization_members を読まない）", async () => {
    const { admin, calls } = fakeAdmin(members);
    const ids = await resolveSideUserIds(admin, null, CONTRACTOR);
    expect(ids).toEqual([CONTRACTOR]);
    expect(calls).toHaveLength(0);
  });

  it("組織 identity なら participant + 組織メンバー全員（重複なし）", async () => {
    const { admin } = fakeAdmin(members);
    const ids = await resolveSideUserIds(admin, ORG_A, OWNER_A);
    expect(ids.sort()).toEqual([OWNER_A, STAFF_A].sort());
  });
});

describe("resolveScoutRecipientUserIds", () => {
  it("法人 ⇔ 法人: 送信者が side1 の組織メンバーなら受信者は side2 の組織全員（No.33）", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: OWNER_A,
      participant_2_id: OWNER_B,
      organization_1_id: ORG_A,
      organization_2_id: ORG_B,
    };
    // 送信者が Owner でも代理スタッフでも同じ結果
    for (const sender of [OWNER_A, STAFF_A]) {
      const ids = await resolveScoutRecipientUserIds(admin, thread, sender);
      expect(ids?.sort()).toEqual([OWNER_B, STAFF_B].sort());
    }
  });

  it("法人 → 個人職人: 受信者は職人本人のみ（従来ケースの非回帰）", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: OWNER_A,
      participant_2_id: CONTRACTOR,
      organization_1_id: ORG_A,
      organization_2_id: null,
    };
    expect(
      await resolveScoutRecipientUserIds(admin, thread, STAFF_A),
    ).toEqual([CONTRACTOR]);
  });

  it("受注者起点スレッド（受注者 = participant_1、発注者組織 = side2）でも送信者の反対側になる", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: CONTRACTOR,
      participant_2_id: OWNER_A,
      organization_1_id: null,
      organization_2_id: ORG_A,
    };
    expect(
      await resolveScoutRecipientUserIds(admin, thread, OWNER_A),
    ).toEqual([CONTRACTOR]);
  });

  it("個人発注者 → 個人職人（両側 個人）: 受信者は送信者の反対側の participant", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: INDIVIDUAL_CLIENT,
      participant_2_id: CONTRACTOR,
      organization_1_id: null,
      organization_2_id: null,
    };
    expect(
      await resolveScoutRecipientUserIds(admin, thread, INDIVIDUAL_CLIENT),
    ).toEqual([CONTRACTOR]);
    expect(
      await resolveScoutRecipientUserIds(admin, thread, CONTRACTOR),
    ).toEqual([INDIVIDUAL_CLIENT]);
  });

  it("送信者が組織を離れた元スタッフ（どちらの側にも居ない）: 組織側が片方だけなら個人側を受信者とみなす", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: OWNER_A,
      participant_2_id: CONTRACTOR,
      organization_1_id: ORG_A,
      organization_2_id: null,
    };
    expect(
      await resolveScoutRecipientUserIds(admin, thread, "former-staff"),
    ).toEqual([CONTRACTOR]);
  });

  it("送信者が判定不能かつ両側同種（法人 ⇔ 法人）なら null（誰も応答できない側に倒す）", async () => {
    const { admin } = fakeAdmin(members);
    const thread = {
      participant_1_id: OWNER_A,
      participant_2_id: OWNER_B,
      organization_1_id: ORG_A,
      organization_2_id: ORG_B,
    };
    expect(
      await resolveScoutRecipientUserIds(admin, thread, "former-staff"),
    ).toBeNull();
  });
});
