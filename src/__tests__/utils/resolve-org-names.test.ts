import { describe, expect, it, vi } from "vitest";

import { getActiveCorporateOrgNames } from "@/lib/utils/resolve-org-names";

/**
 * resolve-org-names.ts の単体テスト。
 *
 * 「active な法人プラン（corporate / corporate_premium）のユーザーのみ」
 * 組織名を返す挙動を網羅する。ダウングレード後や cancelled 状態のユーザーには
 * 組織データが DB に残っていても組織名を返してはならない（データ保持と
 * 表示制御の分離ポリシー）。
 */

type MembersRow = {
  user_id: string;
  organizations: { name: string | null } | null;
};

type SubsRow = { user_id: string };

function makeAdmin(config: {
  members: MembersRow[];
  activeCorpSubs: SubsRow[];
}) {
  const { members, activeCorpSubs } = config;

  function makeFromChain(table: string) {
    if (table === "organization_members") {
      return {
        select: () => ({
          in: (_col: string, userIds: string[]) => {
            const data = members.filter((m) => userIds.includes(m.user_id));
            return Promise.resolve({ data, error: null });
          },
        }),
      };
    }
    if (table === "subscriptions") {
      return {
        select: () => ({
          in: (_col: string, userIds: string[]) => ({
            eq: (_c2: string, _v2: string) => ({
              in: (_c3: string, _planTypes: string[]) => {
                const data = activeCorpSubs.filter((s) =>
                  userIds.includes(s.user_id),
                );
                return Promise.resolve({ data, error: null });
              },
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }

  return {
    from: (table: string) => makeFromChain(table),
  } as unknown as Parameters<typeof getActiveCorporateOrgNames>[0];
}

describe("getActiveCorporateOrgNames", () => {
  it("空配列を渡すと空の Map を返す（DB にアクセスしない）", async () => {
    const admin = makeAdmin({ members: [], activeCorpSubs: [] });
    const spy = vi.spyOn(admin, "from");
    const result = await getActiveCorporateOrgNames(admin, []);
    expect(result.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("active な法人プランユーザーの組織名を返す", async () => {
    const admin = makeAdmin({
      members: [
        { user_id: "u-1", organizations: { name: "株式会社A" } },
      ],
      activeCorpSubs: [{ user_id: "u-1" }],
    });
    const result = await getActiveCorporateOrgNames(admin, ["u-1"]);
    expect(result.get("u-1")).toBe("株式会社A");
  });

  it("ダウングレード後（activeなcorpサブスクなし）は組織名を返さない", async () => {
    const admin = makeAdmin({
      members: [
        // organizations データは残っているが
        { user_id: "u-downgraded", organizations: { name: "ダウングレード済" } },
      ],
      // active な corporate/corporate_premium サブスクは存在しない
      activeCorpSubs: [],
    });
    const result = await getActiveCorporateOrgNames(admin, ["u-downgraded"]);
    expect(result.has("u-downgraded")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("organizations.name が空文字の場合は Map に含めない", async () => {
    const admin = makeAdmin({
      members: [
        { user_id: "u-empty", organizations: { name: "" } },
      ],
      activeCorpSubs: [{ user_id: "u-empty" }],
    });
    const result = await getActiveCorporateOrgNames(admin, ["u-empty"]);
    expect(result.has("u-empty")).toBe(false);
  });

  it("organizations.name が null の場合は Map に含めない", async () => {
    const admin = makeAdmin({
      members: [
        { user_id: "u-null", organizations: { name: null } },
      ],
      activeCorpSubs: [{ user_id: "u-null" }],
    });
    const result = await getActiveCorporateOrgNames(admin, ["u-null"]);
    expect(result.has("u-null")).toBe(false);
  });

  it("複数ユーザーで active / 非 active が混在する場合、active のみ返す", async () => {
    const admin = makeAdmin({
      members: [
        { user_id: "u-active", organizations: { name: "アクティブ組織" } },
        { user_id: "u-cancelled", organizations: { name: "解約済み組織" } },
        { user_id: "u-downgraded", organizations: { name: "ダウン組織" } },
      ],
      activeCorpSubs: [{ user_id: "u-active" }],
    });
    const result = await getActiveCorporateOrgNames(admin, [
      "u-active",
      "u-cancelled",
      "u-downgraded",
    ]);
    expect(result.size).toBe(1);
    expect(result.get("u-active")).toBe("アクティブ組織");
    expect(result.has("u-cancelled")).toBe(false);
    expect(result.has("u-downgraded")).toBe(false);
  });

  it("organization_members に存在しないユーザーIDは無視する", async () => {
    const admin = makeAdmin({
      members: [
        { user_id: "u-with-org", organizations: { name: "ある組織" } },
      ],
      activeCorpSubs: [
        { user_id: "u-with-org" },
        { user_id: "u-lone" }, // サブスクだけあって org_members にいない
      ],
    });
    const result = await getActiveCorporateOrgNames(admin, [
      "u-with-org",
      "u-lone",
    ]);
    expect(result.size).toBe(1);
    expect(result.get("u-with-org")).toBe("ある組織");
  });
});
