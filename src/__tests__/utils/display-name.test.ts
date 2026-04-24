import { describe, expect, it } from "vitest";

import {
  getUserDisplayName,
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";

// ------------------------------------------------------------
// getUserDisplayName
// ------------------------------------------------------------
describe("getUserDisplayName", () => {
  it("退会済みユーザーは常に '退会済みユーザー' を返す（mode 不問）", () => {
    expect(
      getUserDisplayName({
        lastName: "田中",
        firstName: "太郎",
        deletedAt: "2026-01-01",
      }),
    ).toBe("退会済みユーザー");

    expect(
      getUserDisplayName(
        { companyName: "テスト株式会社", deletedAt: "2026-01-01" },
        "company",
      ),
    ).toBe("退会済みユーザー");

    expect(
      getUserDisplayName(
        { companyName: "テスト屋号", deletedAt: "2026-01-01" },
        "prefer-company",
      ),
    ).toBe("退会済みユーザー");
  });

  it("full モードは姓名をスペース無しで結合して返す", () => {
    expect(
      getUserDisplayName({
        lastName: "田中",
        firstName: "太郎",
        deletedAt: null,
      }),
    ).toBe("田中太郎");
  });

  it("full モードで姓のみ・名のみでも結合して返す", () => {
    expect(
      getUserDisplayName({ lastName: "田中", firstName: null, deletedAt: null }),
    ).toBe("田中");
    expect(
      getUserDisplayName({ lastName: null, firstName: "太郎", deletedAt: null }),
    ).toBe("太郎");
  });

  it("full モードで姓名が空なら '未設定' を返す", () => {
    expect(getUserDisplayName({ deletedAt: null })).toBe("未設定");
  });

  it("company モードは companyName を返す", () => {
    expect(
      getUserDisplayName(
        { companyName: "テスト株式会社", deletedAt: null },
        "company",
      ),
    ).toBe("テスト株式会社");
  });

  it("company モードで companyName が空なら '未設定' を返す（姓名へのフォールバックは行わない）", () => {
    expect(
      getUserDisplayName(
        {
          lastName: "田中",
          firstName: "太郎",
          companyName: null,
          deletedAt: null,
        },
        "company",
      ),
    ).toBe("未設定");
  });

  // ----- prefer-company モード（追加 4 シナリオ）-----
  it("prefer-company: 屋号あり → 屋号を返す", () => {
    expect(
      getUserDisplayName(
        {
          companyName: "山田工務店",
          lastName: "山田",
          firstName: "次郎",
          deletedAt: null,
        },
        "prefer-company",
      ),
    ).toBe("山田工務店");
  });

  it("prefer-company: 屋号なし + 姓名あり → 姓名をスペース無しで返す", () => {
    expect(
      getUserDisplayName(
        {
          companyName: null,
          lastName: "山田",
          firstName: "次郎",
          deletedAt: null,
        },
        "prefer-company",
      ),
    ).toBe("山田次郎");
  });

  it("prefer-company: 屋号なし + 姓名なし → '未設定' を返す", () => {
    expect(
      getUserDisplayName(
        { companyName: null, deletedAt: null },
        "prefer-company",
      ),
    ).toBe("未設定");
  });
});

// ------------------------------------------------------------
// resolveParticipantName（新シグネチャ: displayName 基軸）
// ------------------------------------------------------------
describe("resolveParticipantName", () => {
  it("displayName があれば displayName をそのまま返す（通常）", () => {
    expect(
      resolveParticipantName({
        displayName: "山田建設株式会社",
        lastName: "山田",
        firstName: "太郎",
        deletedAt: null,
      }),
    ).toBe("山田建設株式会社");
  });

  it("退会済みでも displayName があれば displayName を返す（C 案: client_profiles.display_name 保持）", () => {
    expect(
      resolveParticipantName({
        displayName: "山田建設株式会社",
        lastName: "山田",
        firstName: "太郎",
        deletedAt: "2026-04-01",
      }),
    ).toBe("山田建設株式会社");
  });

  it("退会済みで displayName も空なら '退会済みユーザー' を返す", () => {
    expect(
      resolveParticipantName({
        displayName: null,
        lastName: "山田",
        firstName: "太郎",
        deletedAt: "2026-04-01",
      }),
    ).toBe("退会済みユーザー");
  });

  it("displayName が無ければ姓名をスペース無しで返す（姓名のみ）", () => {
    expect(
      resolveParticipantName({
        displayName: null,
        lastName: "山田",
        firstName: "太郎",
        deletedAt: null,
      }),
    ).toBe("山田太郎");
  });

  it("displayName / 姓名すべて空なら '未設定' を返す", () => {
    expect(
      resolveParticipantName({
        displayName: null,
        lastName: null,
        firstName: null,
        deletedAt: null,
      }),
    ).toBe("未設定");

    expect(
      resolveParticipantName({
        displayName: "",
        lastName: "",
        firstName: "",
        deletedAt: null,
      }),
    ).toBe("未設定");
  });
});

// ------------------------------------------------------------
// resolveClientProfileForRow（B3 対応）
// ------------------------------------------------------------
describe("resolveClientProfileForRow", () => {
  it("個人/小規模プラン: organization_id NULL → owner.client_profiles を返す", () => {
    const result = resolveClientProfileForRow({
      organization_id: null,
      owner: {
        last_name: "佐藤",
        first_name: "花子",
        deleted_at: null,
        client_profiles: [
          { display_name: "佐藤建設", image_url: "/a.png" },
        ],
      },
    });

    expect(result).toEqual({
      displayName: "佐藤建設",
      imageUrl: "/a.png",
      lastName: "佐藤",
      firstName: "花子",
      deletedAt: null,
    });
  });

  it("法人プラン Owner 作案件: organization_id あり → organization.owner_user.client_profiles を返す", () => {
    const result = resolveClientProfileForRow({
      organization_id: "org-1",
      owner: {
        last_name: "鈴木",
        first_name: "社長",
        deleted_at: null,
        client_profiles: [
          { display_name: "鈴木工務店", image_url: "/b.png" },
        ],
      },
      organization: {
        owner_user: {
          last_name: "鈴木",
          first_name: "社長",
          deleted_at: null,
          client_profiles: [
            { display_name: "鈴木工務店", image_url: "/b.png" },
          ],
        },
      },
    });

    expect(result).toEqual({
      displayName: "鈴木工務店",
      imageUrl: "/b.png",
      lastName: "鈴木",
      firstName: "社長",
      deletedAt: null,
    });
  });

  it("法人プラン Staff 作案件: owner は Staff だが organization.owner_user（社長）の client_profiles を使う", () => {
    const result = resolveClientProfileForRow({
      organization_id: "org-1",
      // owner は Staff（client_profiles 無し、姓名のみ）
      owner: {
        last_name: "山田",
        first_name: "担当",
        deleted_at: null,
        client_profiles: [],
      },
      // organization.owner_user は社長（client_profiles 有り）
      organization: {
        owner_user: {
          last_name: "鈴木",
          first_name: "社長",
          deleted_at: null,
          client_profiles: [
            { display_name: "鈴木工務店", image_url: "/b.png" },
          ],
        },
      },
    });

    expect(result).toEqual({
      displayName: "鈴木工務店",
      imageUrl: "/b.png",
      lastName: "鈴木",
      firstName: "社長",
      deletedAt: null,
    });
  });

  it("Owner 退会済み: deletedAt がそのまま返る（呼び出し側で退会済みユーザー表記に切替可能）", () => {
    const result = resolveClientProfileForRow({
      organization_id: null,
      owner: {
        last_name: "佐藤",
        first_name: "花子",
        deleted_at: "2026-04-01T00:00:00Z",
        client_profiles: [
          { display_name: "旧佐藤建設", image_url: null },
        ],
      },
    });

    expect(result).toEqual({
      displayName: "旧佐藤建設",
      imageUrl: null,
      lastName: "佐藤",
      firstName: "花子",
      deletedAt: "2026-04-01T00:00:00Z",
    });
  });

  it("該当 source が無ければ全 null を返す（欠損データの耐障害性）", () => {
    expect(
      resolveClientProfileForRow({
        organization_id: null,
        owner: null,
      }),
    ).toEqual({
      displayName: null,
      imageUrl: null,
      lastName: null,
      firstName: null,
      deletedAt: null,
    });

    expect(
      resolveClientProfileForRow({
        organization_id: "org-1",
        organization: { owner_user: null },
      }),
    ).toEqual({
      displayName: null,
      imageUrl: null,
      lastName: null,
      firstName: null,
      deletedAt: null,
    });
  });

  it("client_profiles が空配列（profile 未作成）でも姓名・deletedAt は返す", () => {
    const result = resolveClientProfileForRow({
      organization_id: null,
      owner: {
        last_name: "田中",
        first_name: "花子",
        deleted_at: null,
        client_profiles: [],
      },
    });

    expect(result).toEqual({
      displayName: null,
      imageUrl: null,
      lastName: "田中",
      firstName: "花子",
      deletedAt: null,
    });
  });
});
