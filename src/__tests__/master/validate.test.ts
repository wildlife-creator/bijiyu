import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MasterKind, MasterRow } from "@/lib/master/fetch";

const { mockGetAllMasterRowsOrThrow } = vi.hoisted(() => ({
  mockGetAllMasterRowsOrThrow: vi.fn<(kind: MasterKind) => Promise<MasterRow[]>>(),
}));

vi.mock("@/lib/master/fetch", () => ({
  // 検証は失敗を伝播する Or-Throw アクセサを使う（描画用の getAllMasterRows とは別）。
  getAllMasterRowsOrThrow: (kind: MasterKind) =>
    mockGetAllMasterRowsOrThrow(kind),
}));

import {
  validateLabelChanges,
  labelValidationErrorMessage,
} from "@/lib/master/validate";

const tradeRows: MasterRow[] = [
  { label: "建築/躯体｜大工", deprecated_at: null },
  { label: "建築/躯体｜宮大工", deprecated_at: null },
  { label: "建築/仕上げ｜塗装工", deprecated_at: null },
  { label: "建築/廃止｜旧職種", deprecated_at: "2026-04-01T00:00:00.000Z" },
];

describe("validateLabelChanges", () => {
  beforeEach(() => {
    mockGetAllMasterRowsOrThrow.mockReset();
    mockGetAllMasterRowsOrThrow.mockResolvedValue(tradeRows);
  });

  it("returns valid=true when added is empty (no changes)", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
    // Optimization: master lookup must not be called when added is empty.
    expect(mockGetAllMasterRowsOrThrow).not.toHaveBeenCalled();
  });

  it("returns valid=true when all added labels are active in master", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/仕上げ｜塗装工"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
    expect(mockGetAllMasterRowsOrThrow).toHaveBeenCalledWith("trade-types");
  });

  it("returns invalid with unknownLabels when an added label is not in master", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "存在しない職種"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({
      valid: false,
      transient: false,
      unknownLabels: ["存在しない職種"],
      deprecatedLabels: [],
    });
  });

  it("returns invalid with deprecatedLabels when a newly added label is deprecated", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/廃止｜旧職種"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({
      valid: false,
      transient: false,
      unknownLabels: [],
      deprecatedLabels: ["建築/廃止｜旧職種"],
    });
  });

  it("allows existing deprecated labels (in previousLabels) to be kept", async () => {
    // 既存保有: 廃止職種を以前から持っている → newLabels に残しても OK
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/廃止｜旧職種"],
      ["建築/躯体｜大工", "建築/廃止｜旧職種"],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
    // added が空のため master ルックアップ自体スキップされる
    expect(mockGetAllMasterRowsOrThrow).not.toHaveBeenCalled();
  });

  it("handles new registration with empty previousLabels (all added)", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/仕上げ｜塗装工"],
      [],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
  });

  it("detects unknown labels in a fresh registration (empty previousLabels)", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "存在しない職種"],
      [],
      "trade-types",
    );
    expect(result).toEqual({
      valid: false,
      transient: false,
      unknownLabels: ["存在しない職種"],
      deprecatedLabels: [],
    });
  });

  it("dedupes newLabels before computing added (no double-counting)", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/躯体｜大工"],
      [],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
  });

  it("reports both unknown and deprecated when both occur in added", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "存在しない職種", "建築/廃止｜旧職種"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({
      valid: false,
      transient: false,
      unknownLabels: ["存在しない職種"],
      deprecatedLabels: ["建築/廃止｜旧職種"],
    });
  });

  it("forwards the kind parameter to getAllMasterRowsOrThrow", async () => {
    mockGetAllMasterRowsOrThrow.mockResolvedValueOnce([
      { label: "第2種電気工事士", deprecated_at: null },
    ]);
    const result = await validateLabelChanges(
      ["第2種電気工事士"],
      [],
      "qualifications",
    );
    expect(mockGetAllMasterRowsOrThrow).toHaveBeenCalledWith("qualifications");
    expect(result).toEqual({ valid: true });
  });

  it("returns transient=true (never unknown) when master fetch throws", async () => {
    // 2026-07-11 回帰防止: マスタ取得の一時失敗を「存在しない職種」と誤判定しない。
    // Or-Throw アクセサが reject する = unstable_cache に空がキャッシュされない前提。
    mockGetAllMasterRowsOrThrow.mockRejectedValueOnce(new Error("boom"));
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "存在しない職種"],
      [],
      "trade-types",
    );
    expect(result).toEqual({ valid: false, transient: true });
  });
});

describe("labelValidationErrorMessage", () => {
  it("transient は「時間をおいて」の一時エラー文言（存在しない断定をしない）", () => {
    const msg = labelValidationErrorMessage(
      { valid: false, transient: true },
      "職種",
    );
    // 「マスタ」等の開発用語を含まない汎用文言で統一（noun に依らず同一文言）。
    expect(msg).toBe(
      "データの取得に一時的に失敗しました。時間をおいて再度お試しください。",
    );
    expect(msg).not.toContain("存在しない");
    expect(msg).not.toContain("マスタ");
  });

  it("unknown は「存在しない〇〇が含まれています」", () => {
    const msg = labelValidationErrorMessage(
      {
        valid: false,
        transient: false,
        unknownLabels: ["存在しない職種"],
        deprecatedLabels: [],
      },
      "職種",
    );
    expect(msg).toBe("存在しない職種が含まれています: 存在しない職種");
  });

  it("deprecated の動詞は既定「登録」/ 引数で「新規追加」に切替できる", () => {
    const failure = {
      valid: false as const,
      transient: false as const,
      unknownLabels: [] as string[],
      deprecatedLabels: ["建築/廃止｜旧職種"],
    };
    expect(labelValidationErrorMessage(failure, "職種")).toBe(
      "廃止された職種は登録できません: 建築/廃止｜旧職種",
    );
    expect(labelValidationErrorMessage(failure, "職種", "新規追加")).toBe(
      "廃止された職種は新規追加できません: 建築/廃止｜旧職種",
    );
  });
});
