import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOrganizationManagementRecipients } from "@/lib/email/recipients/organization-managers";

/**
 * §5.2.A B-3 ヘルパー: getOrganizationManagementRecipients。
 * § 5.4.B / §5.6 / §5.7 / §5.7.5 の組織側 control mail で再利用される共通ヘルパー。
 * 必須除外フィルタ (deleted_at / is_active / email 非空) と
 * excludeUserIds の挙動を unit で固定する。
 */

const mockFrom = vi.fn();
const adminClient = { from: (...args: unknown[]) => mockFrom(...args) } as never;

interface ChainConfig {
  thenable?: { data: unknown; error: unknown };
}

function makeChain(config: ChainConfig = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  };
  Object.defineProperty(chain, "then", {
    configurable: true,
    value: (resolve: (v: unknown) => void) =>
      resolve(config.thenable ?? { data: null, error: null }),
  });
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("getOrganizationManagementRecipients", () => {
  it("organization_members が 0 件なら空配列", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({ thenable: { data: [], error: null } }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
    );
    expect(result).toEqual([]);
  });

  it("organization_members 取得エラーでも throw せず空配列", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: { data: null, error: { message: "RLS denied" } },
      }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
    );
    expect(result).toEqual([]);
  });

  it("excludeUserIds に含まれる user_id は users 取得段階に進まず除外", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: { data: [{ user_id: "u-1" }, { user_id: "u-2" }], error: null },
      }),
    );
    // users 取得は 1 件のみ ("u-1" が exclude されるので "u-2" だけ)
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: {
          data: [
            {
              id: "u-2",
              email: "u2@test.local",
              last_name: "山田",
              first_name: "二郎",
            },
          ],
          error: null,
        },
      }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
      ["u-1"],
    );
    expect(result).toEqual([
      {
        userId: "u-2",
        email: "u2@test.local",
        displayName: "山田二郎",
      },
    ]);
  });

  it("email が空文字 / null の users は除外", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: {
          data: [{ user_id: "u-1" }, { user_id: "u-2" }, { user_id: "u-3" }],
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: {
          data: [
            { id: "u-1", email: "valid@test.local", last_name: "山", first_name: "田" },
            { id: "u-2", email: "", last_name: "佐", first_name: "藤" },
            { id: "u-3", email: null, last_name: "鈴", first_name: "木" },
          ],
          error: null,
        },
      }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("u-1");
  });

  it("姓名どちらも欠損なら displayName は「ご担当者」フォールバック", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: { data: [{ user_id: "u-1" }], error: null },
      }),
    );
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: {
          data: [
            {
              id: "u-1",
              email: "u1@test.local",
              last_name: null,
              first_name: null,
            },
          ],
          error: null,
        },
      }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
    );
    expect(result[0]?.displayName).toBe("ご担当者");
  });

  it("全 excludeUserIds で対象 0 名 → users クエリにも進まない", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        thenable: { data: [{ user_id: "u-1" }], error: null },
      }),
    );

    const result = await getOrganizationManagementRecipients(
      adminClient,
      "org-1",
      ["u-1"],
    );
    expect(result).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1); // organization_members のみ
  });
});
