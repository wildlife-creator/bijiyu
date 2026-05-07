import { describe, expect, it } from "vitest";

import { isContractorOrClientRole } from "@/lib/utils/role-guards";

describe("isContractorOrClientRole", () => {
  it("allows contractor", () => {
    expect(isContractorOrClientRole("contractor")).toBe(true);
  });

  it("allows client", () => {
    expect(isContractorOrClientRole("client")).toBe(true);
  });

  it("rejects staff", () => {
    expect(isContractorOrClientRole("staff")).toBe(false);
  });

  it("rejects admin", () => {
    expect(isContractorOrClientRole("admin")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isContractorOrClientRole(null)).toBe(false);
    expect(isContractorOrClientRole(undefined)).toBe(false);
  });
});
