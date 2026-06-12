import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_FETCH_PAGE_SIZE,
  buildProxyOrgOptions,
  dedupeOrganizationIds,
  fetchAllRows,
} from "@/lib/admin/proxy-threads";

/**
 * ADM-023/024 代理メッセージ閲覧のヘルパーのテスト。
 * - fetchAllRows: 1000件上限の静かな打ち切りを防ぐページネーションループ
 * - dedupeOrganizationIds / buildProxyOrgOptions: 会社絞込ドロップダウンの選択肢導出（純粋関数）
 */

describe("fetchAllRows（全件ページネーション）", () => {
  it("1ページ目が PAGE_SIZE 未満なら1回で打ち切る", async () => {
    const buildPageQuery = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });

    const rows = await fetchAllRows(buildPageQuery);

    expect(rows).toEqual([{ id: "a" }, { id: "b" }]);
    expect(buildPageQuery).toHaveBeenCalledTimes(1);
    expect(buildPageQuery).toHaveBeenCalledWith(0, ADMIN_FETCH_PAGE_SIZE - 1);
  });

  it("PAGE_SIZE ちょうどのページが返ったら次ページを取得して結合する", async () => {
    const page1 = Array.from({ length: ADMIN_FETCH_PAGE_SIZE }, (_, i) => ({
      id: `p1-${i}`,
    }));
    const page2 = [{ id: "p2-0" }];
    const buildPageQuery = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const rows = await fetchAllRows(buildPageQuery);

    expect(rows).toHaveLength(ADMIN_FETCH_PAGE_SIZE + 1);
    expect(rows[0]).toEqual({ id: "p1-0" });
    expect(rows[ADMIN_FETCH_PAGE_SIZE]).toEqual({ id: "p2-0" });
    expect(buildPageQuery).toHaveBeenCalledTimes(2);
    expect(buildPageQuery).toHaveBeenNthCalledWith(
      2,
      ADMIN_FETCH_PAGE_SIZE,
      ADMIN_FETCH_PAGE_SIZE * 2 - 1,
    );
  });

  it("空の1ページ目は空配列を返す", async () => {
    const buildPageQuery = vi
      .fn()
      .mockResolvedValue({ data: [], error: null });

    await expect(fetchAllRows(buildPageQuery)).resolves.toEqual([]);
  });

  it("途中ページで error が返ったら部分データを返さず throw する", async () => {
    const page1 = Array.from({ length: ADMIN_FETCH_PAGE_SIZE }, (_, i) => ({
      id: `p1-${i}`,
    }));
    const buildPageQuery = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(fetchAllRows(buildPageQuery)).rejects.toThrow();
  });
});

describe("dedupeOrganizationIds（組織IDの重複排除）", () => {
  it("重複と null を除いた組織ID配列を返す", () => {
    expect(
      dedupeOrganizationIds([
        { organization_id: "org-1" },
        { organization_id: "org-2" },
        { organization_id: "org-1" },
        { organization_id: null },
      ]),
    ).toEqual(["org-1", "org-2"]);
  });

  it("空入力は空配列を返す", () => {
    expect(dedupeOrganizationIds([])).toEqual([]);
  });
});

describe("buildProxyOrgOptions（会社絞込の選択肢導出）", () => {
  const organizations = [
    { id: "org-1", owner_id: "owner-1" },
    { id: "org-2", owner_id: "owner-2" },
    { id: "org-3", owner_id: "owner-3" },
  ];
  const ownerUsers = [
    {
      id: "owner-1",
      last_name: "山田",
      first_name: "太郎",
      deleted_at: null,
    },
    {
      id: "owner-2",
      last_name: "佐藤",
      first_name: "花子",
      deleted_at: null,
    },
    {
      id: "owner-3",
      last_name: "鈴木",
      first_name: "一郎",
      deleted_at: "2026-06-01T00:00:00Z",
    },
  ];

  it("display_name を最優先し、無ければ姓名（スペース無し）にフォールバックする", () => {
    const options = buildProxyOrgOptions({
      organizations,
      ownerUsers,
      ownerProfiles: [{ user_id: "owner-1", display_name: "株式会社アルファ" }],
    });

    expect(options.find((o) => o.organizationId === "org-1")?.name).toBe(
      "株式会社アルファ",
    );
    expect(options.find((o) => o.organizationId === "org-2")?.name).toBe(
      "佐藤花子",
    );
  });

  it("退会済み Owner で display_name 保持があれば社名を表示する（C案退会）", () => {
    const options = buildProxyOrgOptions({
      organizations,
      ownerUsers,
      ownerProfiles: [{ user_id: "owner-3", display_name: "株式会社ベータ" }],
    });

    expect(options.find((o) => o.organizationId === "org-3")?.name).toBe(
      "株式会社ベータ",
    );
  });

  it("退会済み Owner で display_name が無ければ退会済みユーザーと表示する", () => {
    const options = buildProxyOrgOptions({
      organizations,
      ownerUsers,
      ownerProfiles: [],
    });

    expect(options.find((o) => o.organizationId === "org-3")?.name).toBe(
      "退会済みユーザー",
    );
  });

  it("会社名の昇順（ja ロケール）でソートされる", () => {
    const options = buildProxyOrgOptions({
      organizations,
      ownerUsers,
      ownerProfiles: [
        { user_id: "owner-1", display_name: "わ建設" },
        { user_id: "owner-2", display_name: "あ建設" },
        { user_id: "owner-3", display_name: "か建設" },
      ],
    });

    expect(options.map((o) => o.name)).toEqual([
      "あ建設",
      "か建設",
      "わ建設",
    ]);
  });

  it("Owner ユーザーが見つからない組織は未設定と表示する（選択肢から落とさない）", () => {
    const options = buildProxyOrgOptions({
      organizations: [{ id: "org-x", owner_id: "owner-x" }],
      ownerUsers: [],
      ownerProfiles: [],
    });

    expect(options).toEqual([{ organizationId: "org-x", name: "未設定" }]);
  });
});
