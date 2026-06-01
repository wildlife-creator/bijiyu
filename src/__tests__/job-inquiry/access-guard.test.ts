import { describe, expect, it } from "vitest";

import { canSendJobInquiry } from "@/lib/job-inquiry/access-guard";

const baseViewer = { id: "v1", role: "contractor", organizationId: null };
const baseTarget = { id: "t1", deletedAt: null, organizationId: null };

describe("canSendJobInquiry", () => {
  it("通常は送信可能（ok: true）", () => {
    expect(canSendJobInquiry({ viewer: baseViewer, target: baseTarget })).toEqual({
      ok: true,
    });
  });

  it("admin は送信不可（reason: admin）", () => {
    expect(
      canSendJobInquiry({
        viewer: { ...baseViewer, role: "admin" },
        target: baseTarget,
      }),
    ).toEqual({ ok: false, reason: "admin" });
  });

  it("退会済み宛は送信不可（reason: deleted）", () => {
    expect(
      canSendJobInquiry({
        viewer: baseViewer,
        target: { ...baseTarget, deletedAt: "2026-01-01T00:00:00Z" },
      }),
    ).toEqual({ ok: false, reason: "deleted" });
  });

  it("自分宛は送信不可（reason: self）", () => {
    expect(
      canSendJobInquiry({
        viewer: baseViewer,
        target: { ...baseTarget, id: "v1" },
      }),
    ).toEqual({ ok: false, reason: "self" });
  });

  it("自社（同一組織）宛は送信不可（reason: same_org）", () => {
    expect(
      canSendJobInquiry({
        viewer: { ...baseViewer, organizationId: "o1" },
        target: { ...baseTarget, organizationId: "o1" },
      }),
    ).toEqual({ ok: false, reason: "same_org" });
  });

  it("異なる組織同士は送信可能", () => {
    expect(
      canSendJobInquiry({
        viewer: { ...baseViewer, organizationId: "o1" },
        target: { ...baseTarget, organizationId: "o2" },
      }),
    ).toEqual({ ok: true });
  });

  it("片方のみ組織所属（個人受注者 → 法人発注者）は送信可能", () => {
    expect(
      canSendJobInquiry({
        viewer: { ...baseViewer, organizationId: null },
        target: { ...baseTarget, organizationId: "o2" },
      }),
    ).toEqual({ ok: true });
  });
});
