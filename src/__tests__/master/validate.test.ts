import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MasterKind, MasterRow } from "@/lib/master/fetch";

const { mockGetAllMasterRows } = vi.hoisted(() => ({
  mockGetAllMasterRows: vi.fn<(kind: MasterKind) => Promise<MasterRow[]>>(),
}));

vi.mock("@/lib/master/fetch", () => ({
  getAllMasterRows: (kind: MasterKind) => mockGetAllMasterRows(kind),
}));

import { validateLabelChanges } from "@/lib/master/validate";

const tradeRows: MasterRow[] = [
  { label: "建築/躯体｜大工", deprecated_at: null },
  { label: "建築/躯体｜宮大工", deprecated_at: null },
  { label: "建築/仕上げ｜塗装工", deprecated_at: null },
  { label: "建築/廃止｜旧職種", deprecated_at: "2026-04-01T00:00:00.000Z" },
];

describe("validateLabelChanges", () => {
  beforeEach(() => {
    mockGetAllMasterRows.mockReset();
    mockGetAllMasterRows.mockResolvedValue(tradeRows);
  });

  it("returns valid=true when added is empty (no changes)", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
    // Optimization: getAllMasterRows must not be called when added is empty.
    expect(mockGetAllMasterRows).not.toHaveBeenCalled();
  });

  it("returns valid=true when all added labels are active in master", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "建築/仕上げ｜塗装工"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({ valid: true });
    expect(mockGetAllMasterRows).toHaveBeenCalledWith("trade-types");
  });

  it("returns invalid with unknownLabels when an added label is not in master", async () => {
    const result = await validateLabelChanges(
      ["建築/躯体｜大工", "存在しない職種"],
      ["建築/躯体｜大工"],
      "trade-types",
    );
    expect(result).toEqual({
      valid: false,
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
    expect(mockGetAllMasterRows).not.toHaveBeenCalled();
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
      unknownLabels: ["存在しない職種"],
      deprecatedLabels: ["建築/廃止｜旧職種"],
    });
  });

  it("forwards the kind parameter to getAllMasterRows", async () => {
    mockGetAllMasterRows.mockResolvedValueOnce([
      { label: "第2種電気工事士", deprecated_at: null },
    ]);
    const result = await validateLabelChanges(
      ["第2種電気工事士"],
      [],
      "qualifications",
    );
    expect(mockGetAllMasterRows).toHaveBeenCalledWith("qualifications");
    expect(result).toEqual({ valid: true });
  });
});
