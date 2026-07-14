import { describe, expect, it } from "vitest";

import {
  appendWithdrawnSuffix,
  resolveCounterpartyDisplay,
  type ThreadIdentitySides,
} from "@/lib/messaging/counterparty-display";

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
