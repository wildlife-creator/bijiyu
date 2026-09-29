import { describe, expect, it } from "vitest";

import {
  appendWithdrawnSuffix,
  resolveCounterpartyDisplay,
  type ThreadIdentitySides,
} from "@/lib/messaging/counterparty-display";
import {
  OFFICIAL_AVATAR_URL,
  counterpartyAvatarUrl,
} from "@/lib/messaging/official-account";

// ------------------------------------------------------------
// appendWithdrawnSuffix
// ------------------------------------------------------------
describe("appendWithdrawnSuffix", () => {
  it("deletedAt があれば「（退会済み）」を付す", () => {
    expect(appendWithdrawnSuffix("山田工務店", "2026-01-01")).toBe(
      "山田工務店（退会済み）",
    );
  });

  it("deletedAt が null なら素の名前を返す", () => {
    expect(appendWithdrawnSuffix("山田工務店", null)).toBe("山田工務店");
  });
});

// ------------------------------------------------------------
// resolveCounterpartyDisplay — 退会済みの対称表示
// ------------------------------------------------------------
describe("resolveCounterpartyDisplay 退会済み counterparty の表示", () => {
  const VIEWER_ID = "viewer-0000";
  const COUNTER_ID = "counter-0000";

  /**
   * viewer = participant_1（個人）、counterparty = participant_2 の
   * 個人 identity スレッドを組み立てる最小フィクスチャ。
   */
  function individualThread(
    counterparty: ThreadIdentitySides["participant_2"],
  ): ThreadIdentitySides {
    return {
      participant_1_id: VIEWER_ID,
      participant_2_id: COUNTER_ID,
      organization_1_id: null,
      organization_2_id: null,
      participant_1: {
        id: VIEWER_ID,
        last_name: "閲覧",
        first_name: "者",
        company_name: null,
        avatar_url: null,
        deleted_at: null,
        client_profiles: null,
      },
      participant_2: counterparty,
      organization_1: null,
      organization_2: null,
    };
  }

  it("退会済み受注者（display_name なし・姓名のみ）は「姓名（退会済み）」で表示される", () => {
    const thread = individualThread({
      id: COUNTER_ID,
      last_name: "田中",
      first_name: "太郎",
      company_name: null,
      avatar_url: null,
      deleted_at: "2026-01-01",
      client_profiles: null,
    });

    const result = resolveCounterpartyDisplay(thread, VIEWER_ID, null);

    expect(result.name).toBe("田中太郎（退会済み）");
    expect(result.deletedAt).toBe("2026-01-01");
  });

  it("退会済み発注者（display_name 保持）は「社名（退会済み）」で表示される", () => {
    const thread = individualThread({
      id: COUNTER_ID,
      last_name: "山田",
      first_name: "花子",
      company_name: null,
      avatar_url: null,
      deleted_at: "2026-01-01",
      client_profiles: { display_name: "山田工務店", image_url: null },
    });

    const result = resolveCounterpartyDisplay(thread, VIEWER_ID, null);

    expect(result.name).toBe("山田工務店（退会済み）");
    expect(result.deletedAt).toBe("2026-01-01");
  });

  it("在籍中の counterparty には「（退会済み）」を付けない", () => {
    const thread = individualThread({
      id: COUNTER_ID,
      last_name: "田中",
      first_name: "太郎",
      company_name: null,
      avatar_url: null,
      deleted_at: null,
      client_profiles: null,
    });

    const result = resolveCounterpartyDisplay(thread, VIEWER_ID, null);

    expect(result.name).toBe("田中太郎");
    expect(result.deletedAt).toBeNull();
  });
});

// ------------------------------------------------------------
// 管理運営アカウント（ビジ友公式）の見分け
// 名前・画像は誰でも真似できるため、判定は users.is_hidden だけで行う
// ------------------------------------------------------------
describe("resolveCounterpartyDisplay / counterpartyAvatarUrl 管理運営アカウントの見分け", () => {
  const VIEWER_ID = "viewer-0000";
  const COUNTER_ID = "counter-0000";
  const COUNTER_ORG_ID = "org-0000";
  const OPS_NAME = "ビジ友運営事務局";
  const MEMBER_LOGO_UPLOAD = "https://example.supabase.co/storage/v1/object/public/client-images/fake-logo.png";

  const viewer = {
    id: VIEWER_ID,
    last_name: "閲覧",
    first_name: "者",
    company_name: null,
    avatar_url: null,
    deleted_at: null,
    client_profiles: null,
  };

  /** 相手が組織側（Owner の client_profiles で名前が決まる）のスレッド */
  function orgThread(isHidden: boolean | undefined): ThreadIdentitySides {
    return {
      participant_1_id: VIEWER_ID,
      participant_2_id: COUNTER_ID,
      organization_1_id: null,
      organization_2_id: COUNTER_ORG_ID,
      participant_1: viewer,
      participant_2: { ...viewer, id: COUNTER_ID, last_name: "運営", first_name: "担当" },
      organization_1: null,
      organization_2: {
        owner_user: {
          last_name: "運営",
          first_name: "担当",
          deleted_at: null,
          is_hidden: isHidden,
          client_profiles: { display_name: OPS_NAME, image_url: MEMBER_LOGO_UPLOAD },
        },
      },
    };
  }

  it("本物の管理運営アカウント（is_hidden = true）は公式扱いになり、アイコンは公式のロゴになる", () => {
    const result = resolveCounterpartyDisplay(orgThread(true), VIEWER_ID, null);
    expect(result.isOfficial).toBe(true);
    expect(counterpartyAvatarUrl(result)).toBe(OFFICIAL_AVATAR_URL);
  });

  it("名前とロゴ画像を真似した会員（is_hidden = false）は公式扱いにならず、アイコンも本人が登録した画像のまま", () => {
    const result = resolveCounterpartyDisplay(orgThread(false), VIEWER_ID, null);
    expect(result.name).toBe(OPS_NAME);
    expect(result.isOfficial).toBe(false);
    expect(counterpartyAvatarUrl(result)).toBe(MEMBER_LOGO_UPLOAD);
  });

  it("is_hidden を取得していない（undefined）場合も公式扱いにしない", () => {
    const result = resolveCounterpartyDisplay(orgThread(undefined), VIEWER_ID, null);
    expect(result.isOfficial).toBe(false);
  });

  it("相手が個人 identity の場合も is_hidden だけで判定する", () => {
    const thread: ThreadIdentitySides = {
      participant_1_id: VIEWER_ID,
      participant_2_id: COUNTER_ID,
      organization_1_id: null,
      organization_2_id: null,
      participant_1: viewer,
      participant_2: {
        id: COUNTER_ID,
        last_name: "ビジ友",
        first_name: "運営",
        company_name: OPS_NAME,
        avatar_url: MEMBER_LOGO_UPLOAD,
        deleted_at: null,
        is_hidden: false,
        client_profiles: null,
      },
      organization_1: null,
      organization_2: null,
    };
    expect(resolveCounterpartyDisplay(thread, VIEWER_ID, null).isOfficial).toBe(false);
    const official = { ...thread, participant_2: { ...(thread.participant_2 as object), is_hidden: true } } as ThreadIdentitySides;
    expect(resolveCounterpartyDisplay(official, VIEWER_ID, null).isOfficial).toBe(true);
  });
});
